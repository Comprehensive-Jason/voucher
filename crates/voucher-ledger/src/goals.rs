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
            pending,
            created_at: None,
        };
        std::iter::once(daily)
            .chain(self.state.goals.iter().map(|g| GoalView {
                id: g.id.clone(),
                measure: g.measure.clone(),
                direction: g.direction,
                target: g.target,
                period: g.period,
                daily: false,
                pending: None,
                created_at: Some(g.created_at),
            }))
            .collect()
    }

    /// Adds a goal, or with an `id` edits one. Applies at once: goals other
    /// than the Daily goal never change access.
    pub fn save_goal(&mut self, goal: NewGoal, now: Timestamp) -> Result<Goal, GoalRefusal> {
        if goal.id.as_deref() == Some(DAILY) {
            return Err(GoalRefusal::Daily);
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
        Ok(())
    }
}
