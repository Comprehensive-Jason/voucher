//! What Insights keeps in the Ledger, so the tablet and the phone agree:
//! the findings dismissed from the card, and Experiments, the rule changes
//! tried on purpose for two weeks and judged by Before and after.
//!
//! The findings themselves are worked out by the apps from the history; the
//! Ledger only remembers which were dismissed and how big each was then, so
//! one that changes a lot can come back. An Experiment applies its change
//! the way any rule change applies (a Tightening now, a Loosening at the
//! Morning boundary), and its rule Marker carries the Experiment's words, so
//! there is one Marker for it. The apps judge it once its Days are in and
//! send the verdict back; Voucher's Android side then raises one
//! notification for it.

use std::collections::BTreeMap;

use jiff::{Timestamp, civil::Date};
use serde::{Deserialize, Serialize};

use crate::{Change, Effect, Ledger, day_of, same_setting};

/// Days after an Experiment starts that aren't measured, while things settle.
pub const SETTLE_DAYS: u32 = 3;
/// Days measured after the settling ones.
pub const MEASURE_DAYS: u32 = 14;
/// The most dismissals kept; past it the oldest go.
const MAX_DISMISSED: usize = 500;

/// A finding dismissed from the Insights card.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Dismissal {
    pub at: Timestamp,
    /// The kind of finding ("shift", "correlation", …): a kind dismissed
    /// often ranks lower.
    pub kind: String,
    /// How big it was when dismissed, in its own units: it comes back once
    /// it has changed a lot from this.
    pub value: f64,
}

/// Where an Experiment stands.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ExperimentStatus {
    /// Waiting to start, settling, or being measured.
    Running,
    /// Judged: the verdict is in and waits for Keep it or Go back.
    Ready,
    /// Judged, and the change kept.
    Kept,
    /// Judged, and the change undone (a Loosening, so at the Morning boundary).
    Reverted,
    /// Ended before its verdict, the change undone.
    Ended,
}

/// An Experiment's verdict, in the words the apps' templates gave it, so the
/// phone's notification says what the card says.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct ExperimentVerdict {
    pub title: String,
    pub text: String,
    /// "helped", "unclear", or "worse".
    pub outcome: String,
    /// The Go back action's words, such as "Go back to 22:00".
    pub back: String,
    pub at: Timestamp,
}

/// A rule change made on purpose and tied to a Marker, so Before and after
/// can say whether it worked.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Experiment {
    pub id: u32,
    pub change: Change,
    /// What puts the setting back as it was, worked out when it started.
    pub undo: Change,
    /// What it tries, as its Marker and the card say it: "Curfew at 21:30".
    pub text: String,
    /// The Before and after measure it is judged on, such as "distraction".
    pub measure: String,
    /// The finding it came from, so the card doesn't suggest it again.
    #[serde(default)]
    pub finding: String,
    pub requested_at: Timestamp,
    /// When the change took effect, or will: at once, or the Morning boundary.
    pub starts_at: Timestamp,
    /// The Day it starts on; that Day and the next SETTLE_DAYS - 1 settle,
    /// the MEASURE_DAYS after them are measured, and the verdict is due on
    /// `verdict_day`, the Day after the last measured one.
    pub start_day: Date,
    pub settle_days: u32,
    pub measure_days: u32,
    pub verdict_day: Date,
    /// Its Marker's moment once the change has applied; None while it waits.
    pub marker_at: Option<Timestamp>,
    pub status: ExperimentStatus,
    pub verdict: Option<ExperimentVerdict>,
    pub ended_at: Option<Timestamp>,
}

/// Why an Experiment wasn't started or changed.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum ExperimentRefusal {
    /// Another is running: two at once would muddle both verdicts.
    AlreadyRunning,
    /// Only Curfew, Unlock length, the Daily goal, the Bank limit, and
    /// adding to a blocklist can be tried.
    NotTriable,
    /// Its words are empty or too long.
    BadText,
    /// No Experiment has that id.
    Unknown,
    /// It isn't in a state that allows this (a verdict before it's due, Keep
    /// it before the verdict).
    NotNow,
}

impl Ledger {
    /// Findings dismissed from the Insights card, by finding id.
    pub fn dismissed(&self) -> &BTreeMap<String, Dismissal> {
        &self.state.dismissed
    }

    /// Hides a finding until it changes a lot. A second dismissal of the
    /// same finding replaces the first. Refuses an empty or overlong id.
    pub fn dismiss(&mut self, id: &str, kind: &str, value: f64, now: Timestamp) -> bool {
        if id.is_empty()
            || id.chars().count() > 160
            || kind.chars().count() > 40
            || !value.is_finite()
        {
            return false;
        }
        self.state.dismissed.insert(
            id.to_string(),
            Dismissal {
                at: now,
                kind: kind.to_string(),
                value,
            },
        );
        while self.state.dismissed.len() > MAX_DISMISSED {
            let oldest = self
                .state
                .dismissed
                .iter()
                .min_by_key(|(_, d)| d.at)
                .map(|(id, _)| id.clone());
            if let Some(id) = oldest {
                self.state.dismissed.remove(&id);
            }
        }
        true
    }

    /// Shows a dismissed finding again. False if it wasn't dismissed.
    pub fn undismiss(&mut self, id: &str) -> bool {
        self.state.dismissed.remove(id).is_some()
    }

    /// Every Experiment, oldest first.
    pub fn experiments(&self) -> &[Experiment] {
        &self.state.experiments
    }

    /// The Experiments still open: running, or judged and waiting for Keep
    /// it or Go back.
    pub fn open_experiments(&self) -> Vec<Experiment> {
        self.state
            .experiments
            .iter()
            .filter(|e| {
                matches!(
                    e.status,
                    ExperimentStatus::Running | ExperimentStatus::Ready
                )
            })
            .cloned()
            .collect()
    }

    /// Starts an Experiment: requests `change` like any rule change (a
    /// Tightening applies now, a Loosening at the Morning boundary) and,
    /// when it applies, writes its rule Marker with `text` in place of the
    /// usual words, so the Experiment has one Marker.
    pub fn start_experiment(
        &mut self,
        change: Change,
        text: &str,
        measure: &str,
        finding: &str,
        now: Timestamp,
    ) -> Result<Experiment, ExperimentRefusal> {
        self.settle(now);
        let text = text.trim();
        if text.is_empty()
            || text.chars().count() > 120
            || measure.is_empty()
            || measure.len() > 40
            || finding.len() > 160
        {
            return Err(ExperimentRefusal::BadText);
        }
        if self
            .state
            .experiments
            .iter()
            .any(|e| e.status == ExperimentStatus::Running)
        {
            return Err(ExperimentRefusal::AlreadyRunning);
        }
        let undo = self.undo_of(&change).ok_or(ExperimentRefusal::NotTriable)?;
        let id = self
            .state
            .experiments
            .iter()
            .map(|e| e.id)
            .max()
            .unwrap_or(0)
            + 1;
        let start_day = day_of(&self.state.settings, now);
        self.state.experiments.push(Experiment {
            id,
            change: change.clone(),
            undo,
            text: text.to_string(),
            measure: measure.to_string(),
            finding: finding.to_string(),
            requested_at: now,
            starts_at: now,
            start_day,
            settle_days: SETTLE_DAYS,
            measure_days: MEASURE_DAYS,
            verdict_day: add_days(start_day, SETTLE_DAYS + MEASURE_DAYS),
            marker_at: None,
            status: ExperimentStatus::Running,
            verdict: None,
            ended_at: None,
        });
        // Applying it now writes the Marker (see `experiment_marker`).
        let effect = self.request(change, now);
        let starts_at = match effect {
            Effect::Now => now,
            Effect::At(at) => at,
        };
        let start_day = day_of(&self.state.settings, starts_at);
        let experiment = self
            .state
            .experiments
            .iter_mut()
            .find(|e| e.id == id)
            .expect("just added");
        experiment.starts_at = starts_at;
        experiment.start_day = start_day;
        experiment.verdict_day = add_days(start_day, SETTLE_DAYS + MEASURE_DAYS);
        Ok(experiment.clone())
    }

    /// The Experiment's verdict, worked out by an app once its Days are in.
    /// Accepted only for a running Experiment whose verdict Day has come.
    pub fn judge_experiment(
        &mut self,
        id: u32,
        title: &str,
        text: &str,
        outcome: &str,
        back: &str,
        now: Timestamp,
    ) -> Result<Experiment, ExperimentRefusal> {
        if title.trim().is_empty()
            || title.chars().count() > 120
            || text.chars().count() > 400
            || back.chars().count() > 60
            || outcome.len() > 20
        {
            return Err(ExperimentRefusal::BadText);
        }
        let today = day_of(&self.state.settings, now);
        let e = self
            .state
            .experiments
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or(ExperimentRefusal::Unknown)?;
        if e.status != ExperimentStatus::Running || today < e.verdict_day {
            return Err(ExperimentRefusal::NotNow);
        }
        e.status = ExperimentStatus::Ready;
        e.verdict = Some(ExperimentVerdict {
            title: title.trim().to_string(),
            text: text.trim().to_string(),
            outcome: outcome.to_string(),
            back: back.trim().to_string(),
            at: now,
        });
        Ok(e.clone())
    }

    /// Ends an Experiment. Judged, `keep` keeps the change and otherwise it
    /// is undone; running, it can only be undone (ending it early). Undoing
    /// requests the reverse change like any other, so undoing a Tightening
    /// is a Loosening and waits for the Morning boundary. Returns when the
    /// undo takes effect (Now when nothing is undone).
    pub fn end_experiment(
        &mut self,
        id: u32,
        keep: bool,
        now: Timestamp,
    ) -> Result<(Experiment, Effect), ExperimentRefusal> {
        self.settle(now);
        let e = self
            .state
            .experiments
            .iter_mut()
            .find(|e| e.id == id)
            .ok_or(ExperimentRefusal::Unknown)?;
        let next = match (e.status, keep) {
            (ExperimentStatus::Ready, true) => ExperimentStatus::Kept,
            (ExperimentStatus::Ready, false) => ExperimentStatus::Reverted,
            (ExperimentStatus::Running, false) => ExperimentStatus::Ended,
            _ => return Err(ExperimentRefusal::NotNow),
        };
        e.status = next;
        e.ended_at = Some(now);
        let undo = e.undo.clone();
        let waiting = e.marker_at.is_none();
        let change = e.change.clone();
        let ended = e.clone();
        if keep {
            return Ok((ended, Effect::Now));
        }
        // Not started yet (a Loosening still waiting): withdrawing it is enough.
        let queued = self.state.pending.iter().position(|(c, _)| *c == change);
        if let Some(i) = queued.filter(|_| waiting) {
            self.state.pending.remove(i);
            return Ok((ended, Effect::Now));
        }
        Ok((ended, self.request(undo, now)))
    }

    /// The words for the rule Marker of `change` when a running Experiment is
    /// waiting for it to apply, and that Experiment's id.
    pub(crate) fn experiment_marker(&self, change: &Change) -> Option<(u32, String)> {
        self.state
            .experiments
            .iter()
            .find(|e| {
                e.status == ExperimentStatus::Running
                    && e.marker_at.is_none()
                    && e.change == *change
            })
            .map(|e| (e.id, format!("Trying {}", e.text)))
    }

    /// Records where an Experiment's Marker went.
    pub(crate) fn mark_experiment(&mut self, id: u32, at: Timestamp) {
        if let Some(e) = self.state.experiments.iter_mut().find(|e| e.id == id) {
            e.marker_at = Some(at);
        }
    }

    /// The change that puts back what `change` would alter, or None for a
    /// change an Experiment can't try.
    fn undo_of(&self, change: &Change) -> Option<Change> {
        let s = &self.state.settings;
        // A change already waiting for the same setting would muddle the before.
        if self
            .state
            .pending
            .iter()
            .any(|(c, _)| same_setting(c, change))
        {
            return None;
        }
        Some(match change {
            Change::UnlockMinutes(m) if *m != s.unlock_minutes => {
                Change::UnlockMinutes(s.unlock_minutes)
            }
            Change::BankLimit(n) if *n != s.bank_limit => Change::BankLimit(s.bank_limit),
            Change::DailyGoal(n) if *n != s.daily_goal => Change::DailyGoal(s.daily_goal),
            Change::Curfew { start, end } if (*start, *end) != (s.curfew_start, s.curfew_end) => {
                Change::Curfew {
                    start: s.curfew_start,
                    end: s.curfew_end,
                }
            }
            Change::BlockApp { list, app } if app.on => {
                let l = s.blocklists.get(list)?;
                match l.apps.iter().find(|a| a.package == app.package) {
                    Some(existing) if existing.on => return None,
                    Some(existing) => Change::BlockApp {
                        list: list.clone(),
                        app: existing.clone(),
                    },
                    None => Change::RemoveApp {
                        list: list.clone(),
                        package: app.package.clone(),
                    },
                }
            }
            Change::BlockSite { list, site } if site.on => {
                let l = s.blocklists.get(list)?;
                match l.sites.iter().find(|x| x.site == site.site) {
                    Some(existing) if existing.on => return None,
                    Some(existing) => Change::BlockSite {
                        list: list.clone(),
                        site: existing.clone(),
                    },
                    None => Change::RemoveSite {
                        list: list.clone(),
                        site: site.site.clone(),
                    },
                }
            }
            _ => return None,
        })
    }
}

fn add_days(day: Date, days: u32) -> Date {
    day.checked_add(jiff::Span::new().days(i64::from(days)))
        .expect("not the year 9999")
}
