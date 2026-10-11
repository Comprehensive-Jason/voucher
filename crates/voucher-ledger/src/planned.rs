//! Time blocks: tasks planned for a time, with a duration, in a task manager
//! (Todoist's due time and duration). Each block's minutes split four ways:
//! in an earning source, in Distraction or Unlocked, in anything else, and
//! not known (no device was reporting). Nothing here matches a task to an app.
//!
//! Blocks are snapshotted as the poller sees them, because a task manager
//! keeps only the present: a recurring task moves its due date forward when
//! it is done, so last week's block can't be read back later. No titles are
//! kept, only the service's own task id and the times.
//!
//! Edits: until a block starts, it follows its task (moved, lengthened, or
//! gone if the task is unscheduled or deleted). Once it has started, it stays
//! as it was planned at its start; a new time for the same task after that
//! is a new block.

use std::collections::{BTreeMap, BTreeSet};

use jiff::{SignedDuration, Timestamp, civil::Date};
use serde::{Deserialize, Serialize};

use crate::{
    Completion, Entry, GAP_MINUTES, Ledger, day_of, days_before, measures::moment, merge_spans,
};

/// A span of time, [from, to).
type Span = (Timestamp, Timestamp);

/// One time block as a task manager shows it now.
#[derive(Debug, Clone, PartialEq, Eq, Deserialize)]
pub struct Scheduled {
    /// The service's task id, prefixed with the service: `todoist:6XGgm…`.
    pub task: String,
    pub start: Timestamp,
    pub minutes: u32,
}

/// One planned block as the Ledger keeps it.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct PlannedBlock {
    /// The service's task id, prefixed with the service. Opaque: no title.
    pub task: String,
    pub start: Timestamp,
    pub minutes: u32,
    /// When its task was completed, if it was.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub done_at: Option<Timestamp>,
}

/// One planned block for the app: its times, and how its minutes went.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Planned {
    pub start: Timestamp,
    pub minutes: u32,
    /// When its task was completed, if it was.
    pub done_at: Option<Timestamp>,
    /// The task manager it came from, such as `todoist`.
    pub service: String,
    pub split: Split,
    /// Minutes each earning source was active in the block, outside
    /// Distraction and Unlocks. Two sources at once each count, so these can
    /// add up to more than `split.sources`.
    pub source_minutes: BTreeMap<String, u32>,
    /// Vouchers earned by finishing tasks inside the block, any task's
    /// (from the log, so none past it).
    pub task_vouchers: u32,
}

/// Where a block's minutes went. The four add up to its minutes.
#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Serialize)]
pub struct Split {
    /// In an earning source (a timed focus stretch), outside Distraction.
    pub sources: u32,
    /// In a Distraction app or site, or inside an Unlock.
    pub distraction: u32,
    /// Anything else while a device was reporting: other apps, or away from
    /// devices. Neutral.
    pub other: u32,
    /// No device was reporting: none sent anything for the Day, every one
    /// that did was silent then, or it hasn't happened yet.
    pub unknown: u32,
}

/// Splits the block [from, to) by what was going on. Each list may overlap
/// itself and run outside the block. Distraction comes first: a minute in a
/// source and in Distraction at once counts as Distraction. Of what's left,
/// minutes outside `covered` (when some device was reporting) are unknown.
pub fn split(block: Span, sources: &[Span], distraction: &[Span], covered: &[Span]) -> Split {
    let (from, to) = block;
    if from >= to {
        return Split::default();
    }
    let whole = vec![block];
    let lost = clip(distraction, block);
    let earning = subtract(&clip(sources, block), &lost);
    let rest = subtract(&subtract(&whole, &lost), &earning);
    let unseen = subtract(&rest, &clip(covered, block));
    let total = minutes_of(seconds(&whole));
    let mut parts = [
        minutes_of(seconds(&lost)),
        minutes_of(seconds(&earning)),
        minutes_of(seconds(&unseen)),
    ];
    // Rounding each part can overshoot the whole by a minute or two: take it
    // back from unknown first, then sources, then Distraction.
    let mut over = parts.iter().sum::<u32>().saturating_sub(total);
    for part in [2, 1, 0] {
        let cut = over.min(parts[part]);
        parts[part] -= cut;
        over -= cut;
    }
    let [distraction, sources, unknown] = parts;
    Split {
        sources,
        distraction,
        unknown,
        other: total - sources - distraction - unknown,
    }
}

/// Merged parts of `spans` inside `block`.
fn clip(spans: &[Span], (from, to): Span) -> Vec<Span> {
    let mut inside: Vec<Span> = spans
        .iter()
        .map(|&(a, b)| (a.max(from), b.min(to)))
        .filter(|(a, b)| a < b)
        .collect();
    inside.sort();
    merge_spans(inside)
}

/// `a` less `b`, both merged and sorted.
fn subtract(a: &[Span], b: &[Span]) -> Vec<Span> {
    let mut out = Vec::new();
    for &(mut from, to) in a {
        for &(x, y) in b {
            if y <= from || x >= to {
                continue;
            }
            if x > from {
                out.push((from, x));
            }
            from = from.max(y);
            if from >= to {
                break;
            }
        }
        if from < to {
            out.push((from, to));
        }
    }
    out
}

fn seconds(spans: &[Span]) -> i64 {
    spans
        .iter()
        .map(|(a, b)| a.duration_until(*b).as_secs())
        .sum()
}

fn minutes_of(seconds: i64) -> u32 {
    u32::try_from((seconds + 30) / 60).unwrap_or(0)
}

fn end_of(start: Timestamp, minutes: u32) -> Timestamp {
    start
        .checked_add(SignedDuration::from_mins(i64::from(minutes)))
        .unwrap_or(start)
}

/// The service a prefixed task id came from.
fn service_of(task: &str) -> &str {
    task.split_once(':').map_or(task, |(service, _)| service)
}

/// What a Day's blocks are split by, from that Day's own records.
#[derive(Default)]
struct DaySpans {
    sources: Vec<(Span, String)>,
    distraction: Vec<Span>,
    covered: Vec<Span>,
}

impl Ledger {
    /// Takes what a service shows of its time blocks now, `seen`, which is
    /// every block it has from `covers.0` to `covers.1`. Blocks that haven't
    /// started follow it: moved, resized, or dropped if no longer there
    /// (only inside `covers`, and never once done). Started ones stay as
    /// they were planned at their start. A block not kept yet is added if
    /// its Day is yesterday, today, or tomorrow. Returns whether anything
    /// changed.
    pub fn plan(
        &mut self,
        service: &str,
        seen: &[Scheduled],
        covers: Span,
        now: Timestamp,
    ) -> bool {
        let settings = &self.state.settings;
        let today = day_of(settings, now);
        let (first, last) = (days_before(today, 1), days_before(today, -1));
        let prefix = format!("{service}:");
        let mut fresh: BTreeMap<&str, &Scheduled> = BTreeMap::new();
        for s in seen {
            let day = day_of(settings, s.start);
            if s.task.starts_with(&prefix)
                && s.task.len() <= 200
                && (1..=24 * 60).contains(&s.minutes)
                && (first..=last).contains(&day)
            {
                fresh.entry(s.task.as_str()).or_insert(s);
            }
        }
        let mut changed = false;
        let mut moved: Vec<PlannedBlock> = Vec::new();
        for blocks in self.state.planned.values_mut() {
            blocks.retain(|b| {
                if !b.task.starts_with(&prefix) || b.start <= now || b.done_at.is_some() {
                    return true;
                }
                match fresh.remove(b.task.as_str()) {
                    Some(s) if s.start == b.start && s.minutes == b.minutes => true,
                    Some(s) => {
                        moved.push(PlannedBlock {
                            task: b.task.clone(),
                            start: s.start,
                            minutes: s.minutes,
                            done_at: None,
                        });
                        changed = true;
                        false
                    }
                    None if covers.0 <= b.start && b.start < covers.1 => {
                        changed = true;
                        false
                    }
                    None => true,
                }
            });
        }
        for s in fresh.into_values() {
            let kept = self
                .state
                .planned
                .get(&day_of(&self.state.settings, s.start))
                .is_some_and(|list| list.iter().any(|b| b.task == s.task && b.start == s.start));
            if !kept {
                moved.push(PlannedBlock {
                    task: s.task.clone(),
                    start: s.start,
                    minutes: s.minutes,
                    done_at: None,
                });
                changed = true;
            }
        }
        for block in moved {
            let list = self
                .state
                .planned
                .entry(day_of(&self.state.settings, block.start))
                .or_default();
            list.push(block);
            list.sort_by(|a, b| (a.start, &a.task).cmp(&(b.start, &b.task)));
        }
        self.state.planned.retain(|_, list| !list.is_empty());
        let oldest = days_before(today, crate::LOG_DAYS);
        self.state.planned.retain(|day, _| *day >= oldest);
        changed
    }

    /// Notes when each block's task was done. A completion goes to the
    /// latest block of its task that started by then and isn't done (done on
    /// time or late, an overdue one included); failing that, to the first
    /// one that hasn't started, if it's the same Day (done early). Seeing a
    /// completion again changes nothing.
    pub(crate) fn mark_done(&mut self, completions: &[Completion]) {
        for c in completions {
            let mine = |b: &&mut PlannedBlock| b.task == c.task;
            let mut blocks: Vec<&mut PlannedBlock> = self
                .state
                .planned
                .values_mut()
                .flatten()
                .filter(mine)
                .collect();
            if blocks.iter().any(|b| b.done_at == Some(c.at)) {
                continue;
            }
            blocks.retain(|b| b.done_at.is_none());
            let late = blocks
                .iter()
                .enumerate()
                .filter(|(_, b)| b.start <= c.at)
                .max_by_key(|(_, b)| b.start)
                .map(|(i, _)| i);
            let settings = &self.state.settings;
            let early = || {
                blocks
                    .iter()
                    .enumerate()
                    .filter(|(_, b)| {
                        b.start > c.at && day_of(settings, b.start) == day_of(settings, c.at)
                    })
                    .min_by_key(|(_, b)| b.start)
                    .map(|(i, _)| i)
            };
            if let Some(i) = late.or_else(early) {
                blocks[i].done_at = Some(c.at);
            }
        }
    }

    /// Each of `days`' planned blocks, with how its minutes went.
    pub(crate) fn planned_on(
        &self,
        days: &[Date],
        unlocks: &BTreeMap<Date, Vec<Span>>,
        now: Timestamp,
    ) -> BTreeMap<Date, Vec<Planned>> {
        // A block can run past its Day's end, and a stretch can start in the
        // Day before, so each block reads its Day and the ones either side.
        let wanted: BTreeSet<Date> = days
            .iter()
            .filter(|d| self.state.planned.contains_key(d))
            .flat_map(|d| [days_before(*d, 1), *d, days_before(*d, -1)])
            .collect();
        // Each device's Gaps in the log: when it stopped checking in.
        let mut gaps: BTreeMap<&str, Vec<Span>> = BTreeMap::new();
        for e in &self.state.log {
            if let Entry::Gap { at, device, until } = e {
                gaps.entry(device.as_str()).or_default().push((*at, *until));
            }
        }
        let spans: BTreeMap<Date, DaySpans> = wanted
            .into_iter()
            .map(|d| (d, self.spans_on(d, unlocks, &gaps, now)))
            .collect();
        let settings = &self.state.settings;
        let is_task = |task: &str| {
            crate::group_of(settings, task)
                .and_then(|g| settings.sources.get(g))
                .is_some_and(|s| s.kind == crate::SourceKind::Tasks)
        };
        let task_vouchers: Vec<Timestamp> = self
            .state
            .log
            .iter()
            .filter_map(|e| match e {
                Entry::Earned { at, task, .. } if is_task(task) => Some(*at),
                _ => None,
            })
            .collect();
        let mut out = BTreeMap::new();
        for day in days {
            let Some(blocks) = self.state.planned.get(day) else {
                continue;
            };
            let near: Vec<&DaySpans> = [days_before(*day, 1), *day, days_before(*day, -1)]
                .iter()
                .filter_map(|d| spans.get(d))
                .collect();
            let sources: Vec<(Span, String)> = near
                .iter()
                .flat_map(|s| s.sources.iter().cloned())
                .collect();
            let plain: Vec<Span> = sources.iter().map(|(span, _)| *span).collect();
            let distraction: Vec<Span> = near
                .iter()
                .flat_map(|s| s.distraction.iter().copied())
                .collect();
            let covered: Vec<Span> = near
                .iter()
                .flat_map(|s| s.covered.iter().copied())
                .collect();
            let list = blocks
                .iter()
                .map(|b| {
                    let block = (b.start, end_of(b.start, b.minutes));
                    let lost = clip(&distraction, block);
                    let mut source_minutes = BTreeMap::new();
                    for (_, id) in &sources {
                        if source_minutes.contains_key(id) {
                            continue;
                        }
                        let own: Vec<Span> = sources
                            .iter()
                            .filter(|(_, s)| s == id)
                            .map(|(span, _)| *span)
                            .collect();
                        let m = minutes_of(seconds(&subtract(&clip(&own, block), &lost)));
                        if m > 0 {
                            source_minutes.insert(id.clone(), m);
                        }
                    }
                    Planned {
                        start: b.start,
                        minutes: b.minutes,
                        done_at: b.done_at,
                        service: service_of(&b.task).to_string(),
                        split: split(block, &plain, &distraction, &covered),
                        source_minutes,
                        task_vouchers: u32::try_from(
                            task_vouchers
                                .iter()
                                .filter(|t| block.0 <= **t && **t < block.1)
                                .count(),
                        )
                        .unwrap_or(u32::MAX),
                    }
                })
                .collect();
            out.insert(*day, list);
        }
        out
    }

    /// One Day's focus stretches, Distraction (every device's spans, and the
    /// Unlocks), and when some device was reporting: from the Day's open
    /// (Curfew's end) to its close or `now`, for each device that sent
    /// anything for the Day, less its Gaps and any silence still running.
    fn spans_on(
        &self,
        day: Date,
        unlocks: &BTreeMap<Date, Vec<Span>>,
        gaps: &BTreeMap<&str, Vec<Span>>,
        now: Timestamp,
    ) -> DaySpans {
        let settings = &self.state.settings;
        let mut out = DaySpans {
            distraction: unlocks.get(&day).cloned().unwrap_or_default(),
            ..DaySpans::default()
        };
        let Some(score) = self.state.days.get(&day) else {
            return out;
        };
        for s in score.timed_stretches.values().flatten() {
            out.sources
                .push(((s.start, end_of(s.start, s.minutes)), s.source.clone()));
        }
        out.distraction
            .extend(score.distraction_spans.values().flatten().copied());
        let tz = &settings.time_zone;
        let (Some(open), Some(close)) = (
            moment(tz, day, settings.curfew_end),
            day.tomorrow()
                .ok()
                .and_then(|next| moment(tz, next, settings.curfew_end)),
        ) else {
            return out;
        };
        let close = close.min(now);
        if open >= close {
            return out;
        }
        let devices: BTreeSet<&str> = score
            .usage
            .keys()
            .chain(score.stretches.keys())
            .chain(score.timed_stretches.keys())
            .chain(score.distraction_spans.keys())
            .chain(score.blocked.keys())
            .map(String::as_str)
            .chain(
                score
                    .reported
                    .keys()
                    .filter_map(|k| k.split_once('@').map(|(_, d)| d)),
            )
            .collect();
        let gap = SignedDuration::from_mins(GAP_MINUTES);
        for device in devices {
            let mut silent: Vec<Span> = gaps.get(device).cloned().unwrap_or_default();
            if let Some(seen) = self.state.last_seen.get(device)
                && seen.duration_until(now) > gap
                && !settings.released_devices.contains(device)
            {
                silent.push((*seen, now));
            }
            let silent = clip(&silent, (open, close));
            out.covered.extend(subtract(&[(open, close)], &silent));
        }
        out
    }
}
