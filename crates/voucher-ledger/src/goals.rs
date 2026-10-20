//! Goals: a target for any measure the Ledger keeps, each over a Day or a
//! week. "At least 90 focus minutes a Day", "Distraction at most 300
//! minutes a week", "in bed by 23:30".
//!
//! The Daily goal is one of them, but it isn't kept here: its target is the
//! `daily_goal` setting, changed only through `POST /change` like any rule,
//! so a lower one waits for the Morning boundary and every change leaves a
//! rule Marker. `goals()` lists it first, made from the setting, so the
//! apps and the coach code see one list.
//!
//! The other goals motivate and nothing more: they never change what is
//! blocked or earned, so adding, editing, or removing one applies at once
//! and leaves no Marker. The Ledger only keeps them; the apps work out from
//! the history which Days and weeks met each one.
//!
//! Every goal has an owner: the user (set in Voucher, Counterfoil, or
//! through the coach code), or an outside app that keeps goals of its own,
//! so far Samsung Health. An outside app's goals arrive from the one device
//! that reports them (`POST /goals/external`, the same one-reporter rule as
//! calendars) and are read-only here: they change where they were set, and
//! `POST /goal` and `/goal/remove` refuse them. Each maps to one of
//! MEASURES where there is one (Samsung Health's sleep target is a bedtime
//! and a wake-up time); one with no measure here yet (steps, active time)
//! is kept and listed as not tracked, never counted.

use std::collections::BTreeMap;

use jiff::Timestamp;
use serde::{Deserialize, Serialize};

use crate::{Change, Ledger};

/// The Daily goal's id in the list.
pub const DAILY: &str = "daily";
/// The most goals kept besides the Daily goal.
pub const MAX_GOALS: usize = 24;
/// The largest target any goal may have.
const MAX_TARGET: f64 = 100_000.0;

/// The measures a goal can have, besides a source's (`source:<id>` for its
/// Vouchers, `source_days:<id>` for the Days it earned, weekly only). Each
/// is something `GET /history` carries for every Day:
/// - `vouchers`: Vouchers earned.
/// - `focus`: focus minutes, every focus stretch added up.
/// - `longest`: the longest focus stretch, in minutes.
/// - `distraction`: Distraction minutes, every app and site together.
/// - `unlocks`: Unlocks (tears).
/// - `asleep`: minutes asleep the night before.
/// - `bedtime` and `wake`: clock times, as minutes after midnight.
pub const MEASURES: [&str; 8] = [
    "vouchers",
    "focus",
    "longest",
    "distraction",
    "unlocks",
    "asleep",
    "bedtime",
    "wake",
];

/// Which way a goal points.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Direction {
    AtLeast,
    AtMost,
}

/// What a goal is counted over: each Day, or each Monday-to-Sunday week.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Period {
    Day,
    Week,
}

/// Who sets a goal: the user, or an outside app whose goals are read-only here.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Owner {
    /// Set in Voucher or Counterfoil, or through the coach code.
    User,
    /// Samsung Health's own goals, read on the phone through its Health Data SDK.
    SamsungHealth,
}

impl Owner {
    /// As `GET /goals` and goal ids write it: "user", "samsung_health".
    pub fn id(self) -> &'static str {
        match self {
            Owner::User => "user",
            Owner::SamsungHealth => "samsung_health",
        }
    }

    /// As people read it: "Samsung Health".
    pub fn name(self) -> &'static str {
        match self {
            Owner::User => "you",
            Owner::SamsungHealth => "Samsung Health",
        }
    }

    const OUTSIDE: [Owner; 1] = [Owner::SamsungHealth];
}

/// A kind of goal an outside app keeps, and what it is here: the measure it
/// counts on (None while the Ledger has none for it), which way it points,
/// and the unit of its target.
struct Kind {
    kind: &'static str,
    measure: Option<&'static str>,
    direction: Direction,
    unit: &'static str,
}

/// Every kind of outside goal the Ledger takes, in the order they're listed.
/// Clock times are minutes after midnight, like a bedtime goal's.
const KINDS: [Kind; 6] = [
    Kind {
        kind: "bedtime",
        measure: Some("bedtime"),
        direction: Direction::AtMost,
        unit: "clock",
    },
    Kind {
        kind: "wake",
        measure: Some("wake"),
        direction: Direction::AtMost,
        unit: "clock",
    },
    Kind {
        kind: "steps",
        measure: None,
        direction: Direction::AtLeast,
        unit: "steps",
    },
    Kind {
        kind: "active_time",
        measure: None,
        direction: Direction::AtLeast,
        unit: "minutes",
    },
    Kind {
        kind: "active_calories",
        measure: None,
        direction: Direction::AtLeast,
        unit: "kcal",
    },
    Kind {
        kind: "water",
        measure: None,
        direction: Direction::AtLeast,
        unit: "ml",
    },
];

fn kind_of(kind: &str) -> Option<&'static Kind> {
    KINDS.iter().find(|k| k.kind == kind)
}

/// One goal an outside app keeps, as its reporting device last read it.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalGoal {
    /// One of KINDS: "bedtime", "wake", "steps", …
    pub kind: String,
    /// In the kind's unit; a clock time is minutes after midnight.
    pub target: f64,
    pub created_at: Timestamp,
    pub changed_at: Timestamp,
}

/// One outside app's goals, and the one device that reports them.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct ExternalGoals {
    pub device: String,
    pub goals: Vec<ExternalGoal>,
    /// When the device last sent them.
    pub reported_at: Timestamp,
}

/// One goal in a device's report: `{"kind": "bedtime", "target": 1410}`.
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct NewExternalGoal {
    pub kind: String,
    pub target: f64,
}

/// Why a report of an outside app's goals was turned down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ExternalRefusal {
    /// Another device reports this app's goals; a device takes over only
    /// with `"claim": true`, sent when its switch is turned on.
    NotReporter,
    /// The source isn't an outside app (it was "user").
    NotExternal,
    /// No device name.
    NoDevice,
    /// A kind the Ledger doesn't know, the same kind twice, or a target that
    /// is negative, not a number, too big, or a clock time outside the Day.
    BadGoal,
}

/// A goal the Ledger keeps (every one but the Daily goal).
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Goal {
    /// "g1", "g2", …: never reused, so a dismissed finding about a removed
    /// goal can't come back on a new one.
    pub id: String,
    pub measure: String,
    pub direction: Direction,
    /// In the measure's units: Vouchers, minutes, Unlocks, Days, or for a
    /// clock time, minutes after midnight.
    pub target: f64,
    pub period: Period,
    pub created_at: Timestamp,
    pub changed_at: Timestamp,
}

/// A new goal, or an edit to one (with its `id`).
#[derive(Debug, Clone, PartialEq, Deserialize)]
pub struct NewGoal {
    #[serde(default)]
    pub id: Option<String>,
    pub measure: String,
    pub direction: Direction,
    pub target: f64,
    pub period: Period,
}

/// A Daily goal change waiting for the next Day.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct PendingTarget {
    pub target: f64,
    pub at: Timestamp,
}

/// One goal as `GET /goals` lists it: the Daily goal first, then the rest.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct GoalView {
    pub id: String,
    pub measure: String,
    pub direction: Direction,
    pub target: f64,
    pub period: Period,
    /// True for the Daily goal, whose target changes only through `POST /change`.
    pub daily: bool,
    /// Who sets it. Any owner but the user makes it read-only here.
    pub owner: Owner,
    /// False for an outside app's goal with no measure here yet: listed, but
    /// never counted. Its `measure` is then "".
    pub tracked: bool,
    /// An outside app's goal: its kind ("bedtime", "steps", …) and the unit
    /// of its target ("clock", "steps", "minutes", "kcal", "ml").
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub unit: Option<String>,
    /// The Daily goal's next target and when it takes effect, while one waits.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pending: Option<PendingTarget>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created_at: Option<Timestamp>,
}

/// Why a goal wasn't saved or removed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum GoalRefusal {
    /// The Daily goal changes only through `POST /change` (`{"DailyGoal": n}`),
    /// and can't be removed.
    Daily,
    /// Not one of MEASURES, `source:<id>`, or `source_days:<id>`.
    UnknownMeasure,
    /// A source measure names no source.
    UnknownSource,
    /// Negative, not a number, too big, or a clock time outside the Day.
    BadTarget,
    /// Days a source earned are counted per week only, at most 7.
    BadPeriod,
    /// The same measure, direction, and period as another goal (or as the
    /// Daily goal: Vouchers, at least, a Day).
    Duplicate,
    /// MAX_GOALS already.
    TooMany,
    /// No goal has that id.
    Unknown,
    /// That goal is set in an outside app (see `Ledger::owner_of`), so it
    /// changes there, not here.
    Owned,
    /// An outside app already sets a goal on this measure (see
    /// `Ledger::measure_owner`), so a second one here would count twice.
    MeasureOwned,
}

impl GoalRefusal {
    /// Why, in words, for the apps and the coach code. `owner` names the
    /// outside app for `Owned` and `MeasureOwned`.
    pub fn message(self, owner: Option<Owner>) -> String {
        let app = owner.map_or("another app", Owner::name);
        match self {
            GoalRefusal::Daily => {
                "the Daily goal changes only through /change, and can't be removed".into()
            }
            GoalRefusal::UnknownMeasure => "not a measure the Ledger keeps".into(),
            GoalRefusal::UnknownSource => "that source doesn't exist".into(),
            GoalRefusal::BadTarget => "that target is out of range".into(),
            GoalRefusal::BadPeriod => "Days a source earned are counted per week, at most 7".into(),
            GoalRefusal::Duplicate => "there's a goal like this already".into(),
            GoalRefusal::TooMany => format!("at most {MAX_GOALS} goals besides the Daily goal"),
            GoalRefusal::Unknown => "no goal has that id".into(),
            GoalRefusal::Owned => {
                format!("this goal is set in {app}, so it's read-only here: change it in {app}")
            }
            GoalRefusal::MeasureOwned => {
                format!("a goal on this measure is set in {app}, so it can't be set here too")
            }
        }
    }
}

impl Ledger {
    /// Every goal, the Daily goal first (from the `daily_goal` setting, with
    /// any change to it still waiting), then the rest, oldest first.
    pub fn goals(&mut self, now: Timestamp) -> Vec<GoalView> {
        self.settle(now);
        let pending = self.state.pending.iter().rev().find_map(|(c, at)| match c {
            Change::DailyGoal(n) => Some(PendingTarget {
                target: f64::from(*n),
                at: *at,
            }),
            _ => None,
        });
        let daily = GoalView {
            id: DAILY.into(),
            measure: "vouchers".into(),
            direction: Direction::AtLeast,
            target: f64::from(self.state.settings.daily_goal),
            period: Period::Day,
            daily: true,
            owner: Owner::User,
            tracked: true,
            kind: None,
            unit: None,
            pending,
            created_at: None,
        };
        let own = self.state.goals.iter().map(|g| GoalView {
            id: g.id.clone(),
            measure: g.measure.clone(),
            direction: g.direction,
            target: g.target,
            period: g.period,
            daily: false,
            owner: Owner::User,
            tracked: true,
            kind: None,
            unit: None,
            pending: None,
            created_at: Some(g.created_at),
        });
        std::iter::once(daily)
            .chain(own)
            .chain(self.external_views())
            .collect()
    }

    /// Every outside app's goals, by app, each in the order of KINDS.
    fn external_views(&self) -> Vec<GoalView> {
        let mut out = Vec::new();
        for (owner, kept) in &self.state.external_goals {
            for k in &KINDS {
                let Some(g) = kept.goals.iter().find(|g| g.kind == k.kind) else {
                    continue;
                };
                out.push(GoalView {
                    id: format!("{}:{}", owner.id(), k.kind),
                    measure: k.measure.unwrap_or_default().into(),
                    direction: k.direction,
                    target: g.target,
                    period: Period::Day,
                    daily: false,
                    owner: *owner,
                    tracked: k.measure.is_some(),
                    kind: Some(k.kind.into()),
                    unit: Some(k.unit.into()),
                    pending: None,
                    created_at: Some(g.created_at),
                });
            }
        }
        out
    }

    /// Who sets the goal with this id: an outside app for one of its goals
    /// (or any id in its name, "samsung_health:…"), else None.
    pub fn owner_of(&self, id: &str) -> Option<Owner> {
        let prefix = id.split_once(':').map(|(p, _)| p)?;
        Owner::OUTSIDE.into_iter().find(|o| o.id() == prefix)
    }

    /// The outside app that sets a goal on this measure, if one does.
    pub fn measure_owner(&self, measure: &str) -> Option<Owner> {
        self.state.external_goals.iter().find_map(|(owner, kept)| {
            kept.goals
                .iter()
                .any(|g| kind_of(&g.kind).and_then(|k| k.measure) == Some(measure))
                .then_some(*owner)
        })
    }

    /// The device that reports each outside app's goals.
    pub fn goal_reporters(&self) -> BTreeMap<Owner, String> {
        self.state
            .external_goals
            .iter()
            .map(|(o, kept)| (*o, kept.device.clone()))
            .collect()
    }

    /// An outside app's goals as `device` read them, replacing what was kept:
    /// a kind left out is gone, so an empty list clears them. Only the
    /// device that reports this app's goals may send them; the first device
    /// to send becomes that one, and another takes over only with `claim`
    /// (its switch just turned on), as choosing calendars moves calendars.
    /// A goal whose target didn't change keeps when it was changed.
    pub fn report_external_goals(
        &mut self,
        device: &str,
        owner: Owner,
        goals: &[NewExternalGoal],
        claim: bool,
        now: Timestamp,
    ) -> Result<(), ExternalRefusal> {
        if owner == Owner::User {
            return Err(ExternalRefusal::NotExternal);
        }
        let device = device.trim();
        if device.is_empty() {
            return Err(ExternalRefusal::NoDevice);
        }
        let kept = self.state.external_goals.get(&owner);
        if kept.is_some_and(|k| k.device != device) && !claim {
            return Err(ExternalRefusal::NotReporter);
        }
        for (i, g) in goals.iter().enumerate() {
            let Some(k) = kind_of(&g.kind) else {
                return Err(ExternalRefusal::BadGoal);
            };
            let t = g.target;
            if !t.is_finite() || t < 0.0 || t > MAX_TARGET || (k.unit == "clock" && t >= 1440.0) {
                return Err(ExternalRefusal::BadGoal);
            }
            if goals[..i].iter().any(|o| o.kind == g.kind) {
                return Err(ExternalRefusal::BadGoal);
            }
        }
        let before = kept.map(|k| k.goals.clone()).unwrap_or_default();
        let goals = goals
            .iter()
            .map(|g| match before.iter().find(|b| b.kind == g.kind) {
                Some(b) if b.target == g.target => b.clone(),
                Some(b) => ExternalGoal {
                    target: g.target,
                    changed_at: now,
                    ..b.clone()
                },
                None => ExternalGoal {
                    kind: g.kind.clone(),
                    target: g.target,
                    created_at: now,
                    changed_at: now,
                },
            })
            .collect();
        self.state.external_goals.insert(
            owner,
            ExternalGoals {
                device: device.to_string(),
                goals,
                reported_at: now,
            },
        );
        Ok(())
    }

    /// Adds a goal, or with an `id` edits one. Applies at once: goals other
    /// than the Daily goal never change access.
    pub fn save_goal(&mut self, goal: NewGoal, now: Timestamp) -> Result<Goal, GoalRefusal> {
        if goal.id.as_deref() == Some(DAILY) {
            return Err(GoalRefusal::Daily);
        }
        if goal
            .id
            .as_deref()
            .and_then(|id| self.owner_of(id))
            .is_some()
        {
            return Err(GoalRefusal::Owned);
        }
        self.check_goal(&goal)?;
        if let Some(id) = &goal.id {
            let existing = self
                .state
                .goals
                .iter_mut()
                .find(|g| &g.id == id)
                .ok_or(GoalRefusal::Unknown)?;
            existing.measure = goal.measure;
            existing.direction = goal.direction;
            existing.target = goal.target;
            existing.period = goal.period;
            existing.changed_at = now;
            return Ok(existing.clone());
        }
        if self.state.goals.len() >= MAX_GOALS {
            return Err(GoalRefusal::TooMany);
        }
        self.state.goal_ids += 1;
        let saved = Goal {
            id: format!("g{}", self.state.goal_ids),
            measure: goal.measure,
            direction: goal.direction,
            target: goal.target,
            period: goal.period,
            created_at: now,
            changed_at: now,
        };
        self.state.goals.push(saved.clone());
        Ok(saved)
    }

    /// Removes a goal. The Daily goal can't be removed.
    pub fn remove_goal(&mut self, id: &str) -> Result<(), GoalRefusal> {
        if id == DAILY {
            return Err(GoalRefusal::Daily);
        }
        if self.owner_of(id).is_some() {
            return Err(GoalRefusal::Owned);
        }
        let i = self
            .state
            .goals
            .iter()
            .position(|g| g.id == id)
            .ok_or(GoalRefusal::Unknown)?;
        self.state.goals.remove(i);
        Ok(())
    }

    fn check_goal(&self, goal: &NewGoal) -> Result<(), GoalRefusal> {
        let source = goal
            .measure
            .strip_prefix("source:")
            .or_else(|| goal.measure.strip_prefix("source_days:"));
        match source {
            Some(id) if !self.state.settings.sources.contains_key(id) => {
                return Err(GoalRefusal::UnknownSource);
            }
            Some(_) => {}
            None if !MEASURES.contains(&goal.measure.as_str()) => {
                return Err(GoalRefusal::UnknownMeasure);
            }
            None => {}
        }
        let t = goal.target;
        if !t.is_finite() || t < 0.0 || t > MAX_TARGET {
            return Err(GoalRefusal::BadTarget);
        }
        if matches!(goal.measure.as_str(), "bedtime" | "wake") && t >= 1440.0 {
            return Err(GoalRefusal::BadTarget);
        }
        if goal.measure.starts_with("source_days:") && (goal.period != Period::Week || t > 7.0) {
            return Err(GoalRefusal::BadPeriod);
        }
        let daily_twin = goal.measure == "vouchers"
            && goal.direction == Direction::AtLeast
            && goal.period == Period::Day;
        let twin = self.state.goals.iter().any(|g| {
            Some(&g.id) != goal.id.as_ref()
                && g.measure == goal.measure
                && g.direction == goal.direction
                && g.period == goal.period
        });
        if daily_twin || twin {
            return Err(GoalRefusal::Duplicate);
        }
        if self.measure_owner(&goal.measure).is_some() {
            return Err(GoalRefusal::MeasureOwned);
        }
        Ok(())
    }
}
