//! The Ledger's rules: crediting Vouchers to the Bank, Redeeming them for
//! signed Unlocks, Curfew, and holding Loosenings until the Morning boundary.
//! Pure logic: every method takes the current time, so tests can control it.

pub mod clickup;
pub mod todoist;

use std::collections::HashSet;

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
}

/// One finished task reported by an Activity source. `task` is prefixed with
/// its source (`todoist:`, `clickup:`) so IDs from different sources never clash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub task: String,
    pub at: Timestamp,
}

/// What happened to a batch of earned Vouchers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
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
}

/// Why a Redemption was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Refusal {
    EmptyBank,
    /// It is Curfew, or the Unlock already runs up to Curfew's start.
    Curfew,
}

/// A requested change to one setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Change {
    UnlockMinutes(u32),
    BankLimit(u32),
    Curfew { start: Time, end: Time },
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
    /// Which tasks have already earned on which local day.
    earned: HashSet<(String, Date)>,
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

    /// Credits one Voucher per Completion, but each task earns at most once
    /// per local day. Re-polling, or ticking a task off, on, and off again,
    /// earns nothing extra; a recurring habit done again tomorrow earns again.
    ///
    /// Only today and the two days before count. Older Completions are ignored
    /// and forgotten, which keeps the memory of what has earned from growing
    /// forever without ever letting an old Completion earn twice.
    pub fn record(&mut self, completions: &[Completion], now: Timestamp) -> Credited {
        let tz = self.state.settings.time_zone.clone();
        let oldest = now
            .to_zoned(tz.clone())
            .date()
            .checked_sub(jiff::Span::new().days(EARNING_WINDOW_DAYS))
            .expect("not the year -9999");
        self.state.earned.retain(|(_, day)| *day >= oldest);
        let mut fresh = 0;
        for completion in completions {
            let day = completion.at.to_zoned(tz.clone()).date();
            let counts = day >= oldest && completion.at >= self.state.started_at;
            if counts && self.state.earned.insert((completion.task.clone(), day)) {
                fresh += 1;
            }
        }
        self.credit(fresh, now)
    }

    /// Spends one Voucher and signs an Unlock: starting now, or stacked onto
    /// the end of the Unlock that is already running.
    pub fn redeem(&mut self, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.settle(now);
        if self.in_curfew(now) {
            return Err(Refusal::Curfew);
        }
        if self.state.bank == 0 {
            return Err(Refusal::EmptyBank);
        }
        // Tickets stack: redeeming during an Unlock extends it from its current end.
        let starts_from = match &self.state.unlock {
            Some(unlock) if now < unlock.ends_at => unlock.ends_at,
            _ => now,
        };
        let length = SignedDuration::from_mins(i64::from(self.state.settings.unlock_minutes));
        let full_length = starts_from
            .checked_add(length)
            .expect("an Unlock never ends past the year 9999");
        // Never let an Unlock run into Curfew, and never spend a Voucher that adds no time.
        let ends_at = full_length.min(self.next_local(now, self.state.settings.curfew_start));
        if ends_at <= starts_from {
            return Err(Refusal::Curfew);
        }
        self.state.bank -= 1;
        let wire = sign(
            &Unlock {
                ends_at: ends_at.as_second(),
            },
            &self.key,
        );
        let redeemed = Redeemed { wire, ends_at };
        self.state.unlock = Some(redeemed.clone());
        Ok(redeemed)
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
        if self.loosens(change) {
            let effective_at = self.next_local(now, self.state.settings.morning_boundary);
            self.state.pending.push((change, effective_at));
            Effect::At(effective_at)
        } else {
            // Whatever is queued for this setting would undo this decision.
            self.state.pending.retain(|(queued, _)| {
                std::mem::discriminant(queued) != std::mem::discriminant(&change)
            });
            self.apply(change);
            Effect::Now
        }
    }

    /// Whether a change would increase access compared with current settings.
    fn loosens(&self, change: Change) -> bool {
        match change {
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
        }
    }

    fn apply(&mut self, change: Change) {
        match change {
            Change::UnlockMinutes(minutes) => self.state.settings.unlock_minutes = minutes,
            Change::BankLimit(limit) => self.state.settings.bank_limit = limit,
            Change::Curfew { start, end } => {
                self.state.settings.curfew_start = start;
                self.state.settings.curfew_end = end;
            }
        }
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

/// How many days back, besides today, a Completion can still earn.
const EARNING_WINDOW_DAYS: i64 = 2;

/// Minutes since noon. Curfew is a night window that crosses midnight, so
/// measuring from noon puts its start before its end and makes "earlier" and
/// "later" compare naturally (22:00 is 600, 06:00 is 1080). Assumes a Curfew
/// never spans noon.
fn from_noon(time: Time) -> i32 {
    let minutes = i32::from(time.hour()) * 60 + i32::from(time.minute());
    (minutes - 12 * 60).rem_euclid(24 * 60)
}
