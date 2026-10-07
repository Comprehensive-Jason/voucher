//! The Ledger's rules: crediting Vouchers to the Bank, Redeeming them for
//! signed Unlocks, Curfew, holding Loosenings until the Morning boundary, and
//! keeping score of each Day (the Daily goal, the Streak, and the log).
//! Pure logic: every method takes the current time, so tests can control it.

pub mod clickup;
pub mod todoist;

use std::{
    cmp::Reverse,
    collections::{BTreeMap, HashSet},
};

use ed25519_dalek::SigningKey;
use jiff::{
    SignedDuration, Timestamp,
    civil::{Date, Time},
    tz::TimeZone,
};
use serde::{Deserialize, Serialize};
use voucher_protocol::{Unlock, sign};

/// The tunable numbers and times the rules run on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(with = "jiff::fmt::serde::tz::required")]
    pub time_zone: TimeZone,
    pub bank_limit: u32,
    pub unlock_minutes: u32,
    pub curfew_start: Time,
    pub curfew_end: Time,
    pub morning_boundary: Time,
    /// Vouchers to earn in a Day for it to count toward the Streak.
    #[serde(default = "default_daily_goal")]
    pub daily_goal: u32,
    /// Every Activity source, by id (`todoist`, `obsidian`, …).
    #[serde(default = "default_sources")]
    pub sources: BTreeMap<String, Source>,
}

/// How one Activity source earns.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Source {
    pub kind: SourceKind,
    pub on: bool,
    /// One Voucher per this many tasks (Tasks) or minutes (Workout, Focus):
    /// the Earning rate. Bigger is slower, so stricter.
    pub every: u32,
    /// The Android apps whose on-screen time counts (Focus only); several
    /// when an app comes in editions, such as a free and a paid one.
    #[serde(default)]
    pub packages: Vec<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    /// Finished tasks, polled from an API by the Ledger.
    Tasks,
    /// Heart-rate zone minutes, reported by the phone from Health Connect.
    Workout,
    /// Minutes an app is on screen and in use, reported by the phone.
    Focus,
}

/// The sources a new Ledger starts with.
pub fn default_sources() -> BTreeMap<String, Source> {
    let source = |kind, every, packages: &[&str]| Source {
        kind,
        on: true,
        every,
        packages: packages.iter().map(|p| p.to_string()).collect(),
    };
    BTreeMap::from([
        ("todoist".into(), source(SourceKind::Tasks, 1, &[])),
        ("clickup".into(), source(SourceKind::Tasks, 1, &[])),
        ("workout".into(), source(SourceKind::Workout, 15, &[])),
        (
            "obsidian".into(),
            source(SourceKind::Focus, 30, &["md.obsidian"]),
        ),
        (
            "readwise".into(),
            source(SourceKind::Focus, 30, &["com.readermobile"]),
        ),
        (
            "moonreader".into(),
            source(
                SourceKind::Focus,
                30,
                &["com.flyersoft.moonreaderp", "com.flyersoft.moonreader"],
            ),
        ),
        (
            "anki".into(),
            source(SourceKind::Focus, 30, &["com.ichi2.anki"]),
        ),
    ])
}

pub const DEFAULT_DAILY_GOAL: u32 = 16;

fn default_daily_goal() -> u32 {
    DEFAULT_DAILY_GOAL
}

/// One finished task reported by an Activity source. `task` is prefixed with
/// its source (`todoist:`, `clickup:`) so IDs from different sources never clash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub task: String,
    /// The task's name, for the log.
    pub title: String,
    pub at: Timestamp,
}

/// What happened to a batch of earned Vouchers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Credited {
    pub kept: u32,
    /// Lost because the Bank was full.
    pub forfeited: u32,
}

/// A successful Redemption: the signed Unlock to hand to Enforcers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Redeemed {
    pub wire: String,
    pub ends_at: Timestamp,
    /// When this run of stacked tickets began.
    #[serde(default)]
    pub started_at: Timestamp,
    /// How many tickets this run of stacked tickets has used.
    #[serde(default)]
    pub tickets: u32,
}

/// Why a Redemption was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Refusal {
    /// The Bank holds fewer Vouchers than the tickets asked for.
    EmptyBank,
    /// Asked to tear zero tickets.
    NoTickets,
    /// It is Curfew, or the Unlock already runs up to Curfew's start.
    Curfew,
}

/// A requested change to one setting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Change {
    UnlockMinutes(u32),
    BankLimit(u32),
    Curfew {
        start: Time,
        end: Time,
    },
    /// Always waits for the next Day: a Day's goal is fixed once it starts.
    DailyGoal(u32),
    /// Switches an existing source on or off and sets its Earning rate.
    Source {
        id: String,
        on: bool,
        every: u32,
    },
    /// A new source. Always a Loosening.
    AddSource {
        id: String,
        source: Source,
    },
}

/// One line of the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Entry {
    /// A task earned a Voucher. `kept` is false when the Bank was full.
    Earned {
        at: Timestamp,
        task: String,
        #[serde(default)]
        title: String,
        kept: bool,
    },
    Redeemed {
        at: Timestamp,
        tickets: u32,
        /// Minutes the tickets actually added; Curfew can cut the last one short.
        #[serde(default)]
        minutes: u32,
    },
}

impl Entry {
    pub fn at(&self) -> Timestamp {
        match self {
            Entry::Earned { at, .. } | Entry::Redeemed { at, .. } => *at,
        }
    }
}

/// One Day's score and log.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DaySummary {
    pub day: Date,
    /// Vouchers earned this Day, forfeited ones included: the goal measures
    /// work done, not what fitted in the Bank.
    pub earned: u32,
    /// Tickets torn this Day.
    pub redeemed: u32,
    pub unlocked_minutes: u32,
    pub goal: u32,
    pub goal_met: bool,
    /// The earning that met the goal, if the log still holds it.
    pub goal_met_at: Option<Timestamp>,
    /// Goal Days in a row ending this Day. For today, the Streak still stands
    /// on yesterday until today's goal is met, then includes today.
    pub streak: u32,
    /// Vouchers earned this Day per Activity source (`todoist`, `clickup`).
    pub by_source: BTreeMap<String, u32>,
    /// This Day's entries, newest first.
    pub log: Vec<Entry>,
    /// Each source's progress toward its next Voucher this Day.
    pub sources: Vec<SourceProgress>,
}

/// One source's standing for a Day.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceProgress {
    pub id: String,
    pub kind: SourceKind,
    pub on: bool,
    pub every: u32,
    /// Tasks or minutes counted toward the next Voucher.
    pub progress: u32,
    /// Vouchers this source earned this Day.
    pub earned: u32,
}

/// One Day in the history, for Trends.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct DayTotal {
    pub day: Date,
    pub earned: u32,
    pub redeemed: u32,
    pub goal_met: bool,
}

/// What one Day earned, and the goal it had.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct DayScore {
    earned: u32,
    goal: u32,
    #[serde(default)]
    redeemed: u32,
    #[serde(default)]
    unlocked_minutes: u32,
    /// Tasks or minutes counted toward each source's next Voucher.
    #[serde(default)]
    progress: BTreeMap<String, u32>,
    /// The last running total of minutes the phone reported, per source.
    #[serde(default)]
    reported: BTreeMap<String, u32>,
}

impl DayScore {
    fn new(goal: u32) -> Self {
        DayScore {
            earned: 0,
            goal,
            redeemed: 0,
            unlocked_minutes: 0,
            progress: BTreeMap::new(),
            reported: BTreeMap::new(),
        }
    }
}

/// When a requested change takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Effect {
    /// A Tightening: applied immediately.
    Now,
    /// A Loosening: held until this Morning boundary.
    At(Timestamp),
}

pub struct Ledger {
    /// Never saved with the state: it lives in its own locked-down file.
    key: SigningKey,
    state: State,
}

/// Everything the Ledger remembers, saved to disk after every change.
#[derive(Serialize, Deserialize)]
struct State {
    settings: Settings,
    /// When this Ledger was first started. Work done before then never
    /// earns, so a new Ledger starts with an empty Bank instead of back-paying
    /// the last few days.
    #[serde(default)]
    started_at: Timestamp,
    bank: u32,
    /// The most recent Unlock, kept so Enforcers can fetch it.
    unlock: Option<Redeemed>,
    /// Loosenings waiting for their Morning boundary, oldest first.
    pending: Vec<(Change, Timestamp)>,
    /// Which tasks have already earned on which Day.
    earned: HashSet<(String, Date)>,
    /// Every Day that earned anything, for the goal, the Streak, and Trends.
    #[serde(default)]
    days: BTreeMap<Date, DayScore>,
    /// The last month of entries, oldest first.
    #[serde(default)]
    log: Vec<Entry>,
}

impl Ledger {
    pub fn new(settings: Settings, key: SigningKey, started_at: Timestamp) -> Self {
        Ledger {
            key,
            state: State {
                settings,
                started_at,
                bank: 0,
                unlock: None,
                pending: Vec::new(),
                earned: HashSet::new(),
                days: BTreeMap::new(),
                log: Vec::new(),
            },
        }
    }

    /// The Ledger's state as JSON, for saving to disk.
    pub fn save(&self) -> String {
        serde_json::to_string_pretty(&self.state).expect("the state always serializes")
    }

    /// Rebuilds a Ledger from saved JSON and its signing key.
    pub fn load(saved: &str, key: SigningKey) -> Result<Self, serde_json::Error> {
        Ok(Ledger {
            key,
            state: serde_json::from_str(saved)?,
        })
    }

    /// Vouchers currently held.
    pub fn bank(&self) -> u32 {
        self.state.bank
    }

    /// The settings in force right now.
    pub fn settings(&mut self, now: Timestamp) -> &Settings {
        self.settle(now);
        &self.state.settings
    }

    /// Loosenings still waiting for their Morning boundary.
    pub fn pending(&mut self, now: Timestamp) -> &[(Change, Timestamp)] {
        self.settle(now);
        &self.state.pending
    }

    /// The Unlock that is running right now, if any.
    pub fn current_unlock(&self, now: Timestamp) -> Option<&Redeemed> {
        self.state
            .unlock
            .as_ref()
            .filter(|unlock| now < unlock.ends_at)
    }

    /// Adds earned Vouchers to the Bank, forfeiting any past the Bank limit.
    pub fn credit(&mut self, vouchers: u32, now: Timestamp) -> Credited {
        self.settle(now);
        let room = self
            .state
            .settings
            .bank_limit
            .saturating_sub(self.state.bank);
        let kept = vouchers.min(room);
        self.state.bank += kept;
        Credited {
            kept,
            forfeited: vouchers - kept,
        }
    }

    /// Counts finished tasks toward their sources, but each task counts at
    /// most once per Day. Re-polling, or ticking a task off, on, and off
    /// again, counts nothing extra; a recurring habit done again tomorrow
    /// counts again. A source pays one Voucher per `every` tasks; a switched
    /// off source counts nothing, and its tasks never count later.
    ///
    /// Only today and the two Days before count. Older Completions are
    /// ignored and forgotten, which keeps the memory of what has counted from
    /// growing forever without ever letting an old Completion count twice.
    pub fn record(&mut self, completions: &[Completion], now: Timestamp) -> Credited {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        let oldest = days_before(today, EARNING_WINDOW_DAYS);
        self.state.earned.retain(|(_, day)| *day >= oldest);
        let mut credited = Credited {
            kept: 0,
            forfeited: 0,
        };
        for completion in completions {
            let day = day_of(&self.state.settings, completion.at);
            let counts = day >= oldest && completion.at >= self.state.started_at;
            if !counts || !self.state.earned.insert((completion.task.clone(), day)) {
                continue;
            }
            let source = source_of(&completion.task).to_string();
            let paid = self.count(&source, day, 1, completion.at, now, |_| {
                (completion.task.clone(), completion.title.clone())
            });
            credited.kept += paid.kept;
            credited.forfeited += paid.forfeited;
        }
        self.forget_old_entries(today);
        credited
    }

    /// Takes the phone's running total of minutes for a Workout or Focus
    /// source on `day`, and pays one Voucher per `every` new minutes. Sending
    /// the same total again pays nothing. Only today and yesterday (for a
    /// report sent just after the Day turned) are accepted. `title` names
    /// the session for the log, such as a workout's name.
    pub fn report(
        &mut self,
        source: &str,
        day: Date,
        minutes: u32,
        title: Option<&str>,
        now: Timestamp,
    ) -> Credited {
        self.settle(now);
        let nothing = Credited {
            kept: 0,
            forfeited: 0,
        };
        let today = day_of(&self.state.settings, now);
        let fresh_day = day == today || Some(day) == today.yesterday().ok();
        let Some(kind) = self.state.settings.sources.get(source).map(|s| s.kind) else {
            return nothing;
        };
        if !fresh_day || kind == SourceKind::Tasks {
            return nothing;
        }
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        let before = score
            .reported
            .insert(source.to_string(), minutes)
            .unwrap_or(0);
        if minutes <= before {
            score.reported.insert(source.to_string(), before);
            return nothing;
        }
        let paid = self.count(source, day, minutes - before, now, now, |n| {
            let label = match (title, kind) {
                (Some(title), _) => title.to_string(),
                (None, SourceKind::Workout) => format!("{n} zone min"),
                (None, _) => format!("{n} min focused"),
            };
            (format!("{source}:{day}#{}", now.as_second()), label)
        });
        self.forget_old_entries(today);
        paid
    }

    /// Adds `units` (tasks or minutes) to a source's progress on `day`,
    /// paying a Voucher each time it reaches the source's `every`. Each
    /// Voucher is logged under the name `entry` gives it.
    fn count(
        &mut self,
        source: &str,
        day: Date,
        units: u32,
        at: Timestamp,
        now: Timestamp,
        entry: impl Fn(u32) -> (String, String),
    ) -> Credited {
        let mut credited = Credited {
            kept: 0,
            forfeited: 0,
        };
        let Some(config) = self.state.settings.sources.get(source).cloned() else {
            return credited;
        };
        if !config.on {
            return credited;
        }
        let every = config.every.max(1);
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        let progress = score.progress.entry(source.to_string()).or_insert(0);
        *progress += units;
        let vouchers = *progress / every;
        *progress %= every;
        for _ in 0..vouchers {
            // One at a time, so the log can say which ones the full Bank lost.
            let kept = self.credit(1, now).kept == 1;
            if kept {
                credited.kept += 1;
            } else {
                credited.forfeited += 1;
            }
            self.state.days.get_mut(&day).expect("created above").earned += 1;
            let (task, title) = entry(every);
            self.state.log.push(Entry::Earned {
                at,
                task,
                title,
                kept,
            });
        }
        credited
    }

    /// Spends one Voucher; see `redeem_many`.
    pub fn redeem(&mut self, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.redeem_many(1, now)
    }

    /// Spends `count` Vouchers and signs an Unlock: starting now, or stacked
    /// onto the end of the Unlock that is already running. All or nothing:
    /// if the Bank can't cover every ticket, none is torn.
    ///
    /// An Unlock never runs into Curfew. Tickets that would only add time
    /// past Curfew's start stay in the Bank; a ticket that adds no time at
    /// all is refused.
    pub fn redeem_many(&mut self, count: u32, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.settle(now);
        if count == 0 {
            return Err(Refusal::NoTickets);
        }
        if self.in_curfew(now) {
            return Err(Refusal::Curfew);
        }
        if self.state.bank < count {
            return Err(Refusal::EmptyBank);
        }
        let running = self
            .state
            .unlock
            .clone()
            .filter(|unlock| now < unlock.ends_at);
        let starts_from = running.as_ref().map_or(now, |unlock| unlock.ends_at);
        let curfew = self.next_local(now, self.state.settings.curfew_start);
        let room = starts_from.duration_until(curfew).as_secs();
        if room <= 0 {
            return Err(Refusal::Curfew);
        }
        let length = i64::from(self.state.settings.unlock_minutes) * 60;
        // Tickets needed to reach Curfew, rounding up: the last may be cut short.
        let fit = u32::try_from((room + length - 1) / length).unwrap_or(u32::MAX);
        let tickets = count.min(fit);
        let ends_at = starts_from
            .checked_add(SignedDuration::from_secs(length * i64::from(tickets)))
            .expect("an Unlock never ends past the year 9999")
            .min(curfew);
        self.state.bank -= tickets;
        let wire = sign(
            &Unlock {
                ends_at: ends_at.as_second(),
            },
            &self.key,
        );
        let redeemed = Redeemed {
            wire,
            ends_at,
            started_at: running.as_ref().map_or(now, |unlock| unlock.started_at),
            tickets: running.as_ref().map_or(0, |unlock| unlock.tickets) + tickets,
        };
        self.state.unlock = Some(redeemed.clone());
        let minutes = (starts_from.duration_until(ends_at).as_secs() + 30) / 60;
        let minutes = u32::try_from(minutes).unwrap_or(u32::MAX);
        let goal = self.state.settings.daily_goal;
        let today = self
            .state
            .days
            .entry(day_of(&self.state.settings, now))
            .or_insert(DayScore::new(goal));
        today.redeemed += tickets;
        today.unlocked_minutes += minutes;
        self.state.log.push(Entry::Redeemed {
            at: now,
            tickets,
            minutes,
        });
        Ok(redeemed)
    }

    /// The current Day's score, Streak, and log.
    pub fn today(&mut self, now: Timestamp) -> DaySummary {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        self.day(today, now)
    }

    /// Any Day's score and log. The log covers the last month; older Days
    /// keep their totals only.
    pub fn day(&mut self, day: Date, now: Timestamp) -> DaySummary {
        self.settle(now);
        let settings = &self.state.settings;
        let is_today = day == day_of(settings, now);
        let score = self
            .state
            .days
            .get(&day)
            .cloned()
            // Today's goal is the one in force; a Day that earned nothing never stored one.
            .unwrap_or(DayScore::new(settings.daily_goal));
        let goal = if is_today {
            settings.daily_goal
        } else {
            score.goal
        };
        let goal_met = score.earned >= goal;
        let before = self.streak_ending(day.yesterday().expect("not the year -9999"));
        let streak = match (goal_met, is_today) {
            (true, _) => before + 1,
            (false, true) => before,
            (false, false) => 0,
        };
        // Newest first; reversing before the stable sort keeps same-moment
        // entries newest-recorded first too.
        let mut log: Vec<Entry> = self
            .state
            .log
            .iter()
            .rev()
            .filter(|entry| day_of(settings, entry.at()) == day)
            .cloned()
            .collect();
        log.sort_by_key(|entry| Reverse(entry.at()));
        let mut by_source = BTreeMap::new();
        let mut so_far = 0;
        let mut goal_met_at = None;
        for entry in log.iter().rev() {
            if let Entry::Earned { task, at, .. } = entry {
                *by_source.entry(source_of(task).to_string()).or_insert(0) += 1;
                so_far += 1;
                if so_far == goal && goal > 0 {
                    goal_met_at = Some(*at);
                }
            }
        }
        let sources = settings
            .sources
            .iter()
            .map(|(id, source)| SourceProgress {
                id: id.clone(),
                kind: source.kind,
                on: source.on,
                every: source.every,
                progress: score.progress.get(id).copied().unwrap_or(0),
                // Task sources share their earnings through their own prefix.
                earned: by_source.get(id).copied().unwrap_or(0),
            })
            .collect();
        DaySummary {
            day,
            sources,
            earned: score.earned,
            redeemed: score.redeemed,
            unlocked_minutes: score.unlocked_minutes,
            goal,
            goal_met,
            goal_met_at,
            streak,
            by_source,
            log,
        }
    }

    /// The last `days` Days, oldest first, today included.
    pub fn history(&mut self, days: u32, now: Timestamp) -> Vec<DayTotal> {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        let goal_today = self.state.settings.daily_goal;
        (0..i64::from(days))
            .rev()
            .map(|back| {
                let day = days_before(today, back);
                let score = self.state.days.get(&day);
                let goal = if back == 0 {
                    goal_today
                } else {
                    score.map_or(goal_today, |s| s.goal)
                };
                let earned = score.map_or(0, |s| s.earned);
                let redeemed = score.map_or(0, |s| s.redeemed);
                DayTotal {
                    day,
                    earned,
                    redeemed,
                    goal_met: earned >= goal,
                }
            })
            .collect()
    }

    /// Goal Days in a row ending with `day`.
    fn streak_ending(&self, mut day: Date) -> u32 {
        let mut streak = 0;
        while let Some(score) = self.state.days.get(&day) {
            if score.earned < score.goal {
                break;
            }
            streak += 1;
            day = day.yesterday().expect("not the year -9999");
        }
        streak
    }

    /// Keeps a month of log entries; the Day scores keep the longer history.
    fn forget_old_entries(&mut self, today: Date) {
        let oldest = days_before(today, LOG_DAYS);
        let settings = &self.state.settings;
        self.state
            .log
            .retain(|entry| day_of(settings, entry.at()) >= oldest);
    }

    /// Whether Curfew is in force at `now`.
    pub fn curfew_active(&self, now: Timestamp) -> bool {
        self.in_curfew(now)
    }

    /// Whether `now`, in local time, falls in the Curfew window. The window
    /// usually crosses midnight (22:00 to 06:00), so it is "after the start OR
    /// before the end" rather than "between".
    fn in_curfew(&self, now: Timestamp) -> bool {
        let local = now.to_zoned(self.state.settings.time_zone.clone()).time();
        let (start, end) = (
            self.state.settings.curfew_start,
            self.state.settings.curfew_end,
        );
        if start <= end {
            start <= local && local < end
        } else {
            local >= start || local < end
        }
    }

    /// The next moment, strictly after `now`, when the local clock reads `time`.
    fn next_local(&self, now: Timestamp, time: Time) -> Timestamp {
        let tz = &self.state.settings.time_zone;
        let today = now.to_zoned(tz.clone()).date();
        let on = |date: jiff::civil::Date| {
            date.to_datetime(time)
                .to_zoned(tz.clone())
                .expect("a local time always maps to some moment")
                .timestamp()
        };
        let candidate = on(today);
        if candidate > now {
            candidate
        } else {
            on(today.tomorrow().expect("not the year 9999"))
        }
    }

    /// Requests a settings change. Tightenings apply now; Loosenings wait
    /// for the next Morning boundary, however urgently they are wanted.
    pub fn request(&mut self, change: Change, now: Timestamp) -> Effect {
        self.settle(now);
        if let Change::DailyGoal(_) = change {
            // A Day's goal is fixed once it starts, so raising or lowering it
            // waits for the next Day. The newest request replaces older ones.
            let effective_at = self.next_local(now, self.state.settings.curfew_end);
            self.state
                .pending
                .retain(|(queued, _)| !matches!(queued, Change::DailyGoal(_)));
            self.state.pending.push((change, effective_at));
            return Effect::At(effective_at);
        }
        if self.loosens(&change) {
            let effective_at = self.next_local(now, self.state.settings.morning_boundary);
            self.state.pending.push((change, effective_at));
            Effect::At(effective_at)
        } else {
            // Whatever is queued for this setting would undo this decision.
            self.state
                .pending
                .retain(|(queued, _)| !same_setting(queued, &change));
            self.apply(change);
            Effect::Now
        }
    }

    /// Whether a change would increase access compared with current settings.
    fn loosens(&self, change: &Change) -> bool {
        match *change {
            Change::UnlockMinutes(minutes) => minutes > self.state.settings.unlock_minutes,
            Change::BankLimit(limit) => limit > self.state.settings.bank_limit,
            Change::Curfew { start, end } => {
                // Shrinking Curfew at either end frees time, so it loosens.
                let (old_start, old_end) = (
                    self.state.settings.curfew_start,
                    self.state.settings.curfew_end,
                );
                from_noon(start) > from_noon(old_start) || from_noon(end) < from_noon(old_end)
            }
            Change::DailyGoal(goal) => goal < self.state.settings.daily_goal,
            Change::Source { ref id, on, every } => match self.state.settings.sources.get(id) {
                // Switching on, or earning faster, frees time.
                Some(old) => on && (!old.on || every < old.every),
                None => false,
            },
            Change::AddSource { .. } => true,
        }
    }

    fn apply(&mut self, change: Change) {
        match change {
            // A zero-minute ticket would spend Vouchers for nothing.
            Change::UnlockMinutes(minutes) => self.state.settings.unlock_minutes = minutes.max(1),
            Change::BankLimit(limit) => self.state.settings.bank_limit = limit,
            Change::Curfew { start, end } => {
                self.state.settings.curfew_start = start;
                self.state.settings.curfew_end = end;
            }
            Change::DailyGoal(goal) => self.state.settings.daily_goal = goal,
            Change::Source { id, on, every } => {
                if let Some(source) = self.state.settings.sources.get_mut(&id) {
                    source.on = on;
                    source.every = every.max(1);
                }
            }
            Change::AddSource { id, source } => {
                self.state.settings.sources.entry(id).or_insert(source);
            }
        }
    }

    /// Withdraws a pending change before it takes effect. Withdrawing a
    /// Loosening only tightens, so it is immediate. Returns false if there is
    /// no pending change at `index`.
    pub fn cancel_pending(&mut self, index: usize, now: Timestamp) -> bool {
        self.settle(now);
        if index >= self.state.pending.len() {
            return false;
        }
        self.state.pending.remove(index);
        true
    }

    /// Applies every pending Loosening whose Morning boundary has passed.
    fn settle(&mut self, now: Timestamp) {
        let (due, waiting) = std::mem::take(&mut self.state.pending)
            .into_iter()
            .partition(|&(_, effective_at)| effective_at <= now);
        self.state.pending = waiting;
        for (change, _) in due {
            self.apply(change);
        }
    }
}

/// The source an earning came from: the prefix of `todoist:123`.
fn source_of(task: &str) -> &str {
    task.split_once(':').map_or(task, |(source, _)| source)
}

/// Whether two changes set the same thing, so one replaces the other.
fn same_setting(a: &Change, b: &Change) -> bool {
    match (a, b) {
        (Change::Source { id: x, .. }, Change::Source { id: y, .. }) => x == y,
        _ => std::mem::discriminant(a) == std::mem::discriminant(b),
    }
}

/// How many Days back, besides today, a Completion can still earn.
const EARNING_WINDOW_DAYS: i64 = 2;

/// How many Days back, besides today, the log keeps entries.
const LOG_DAYS: i64 = 30;

/// The Day a moment belongs to. A Day runs from Curfew's end to the next
/// Curfew's end, so work at 01:00 still counts toward the evening before.
/// Assumes Curfew ends in the morning.
fn day_of(settings: &Settings, at: Timestamp) -> Date {
    let local = at.to_zoned(settings.time_zone.clone()).datetime();
    if local.time() < settings.curfew_end {
        local.date().yesterday().expect("not the year -9999")
    } else {
        local.date()
    }
}

fn days_before(day: Date, days: i64) -> Date {
    day.checked_sub(jiff::Span::new().days(days))
        .expect("not the year -9999")
}

/// Minutes since noon. Curfew is a night window that crosses midnight, so
/// measuring from noon puts its start before its end and makes "earlier" and
/// "later" compare naturally (22:00 is 600, 06:00 is 1080). Assumes a Curfew
/// never spans noon.
fn from_noon(time: Time) -> i32 {
    let minutes = i32::from(time.hour()) * 60 + i32::from(time.minute());
    (minutes - 12 * 60).rem_euclid(24 * 60)
}
