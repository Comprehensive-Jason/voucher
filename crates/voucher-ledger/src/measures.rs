//! What a Day was like besides its Vouchers: the night's sleep, the
//! calendar's load, and the answer to "How was your energy today?". None of
//! it earns or costs anything; Trends reads it beside the Day's score.
//!
//! Which Day a sleep counts toward: the local calendar date of its wake-up.
//! A Day runs from Curfew's end (06:00) to the next, so a wake-up at or after
//! 06:00 counts toward the Day it falls in. A wake-up during Curfew (05:30)
//! falls, strictly, in the Day before, the one the night began in; it counts
//! instead toward the Day starting at that morning's 06:00, because that is
//! the Day the night leads into. A session waking at 18:00 or later is an
//! evening nap and counts toward no Day.

use std::collections::BTreeMap;

use jiff::{
    SignedDuration, Timestamp,
    civil::{Date, Time},
    tz::TimeZone,
};
use serde::{Deserialize, Serialize};

use crate::{Entry, LOG_DAYS, Ledger, SourceKind, day_of, days_before, group_of};

/// One sleep session as a device read it from Health Connect.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct SleepSession {
    pub start: Timestamp,
    pub end: Timestamp,
    /// Minutes asleep: the session less its awake stages (awake, awake in
    /// bed, out of bed), or the whole session when it has no stages.
    pub asleep: u32,
    /// Whether the session came with sleep stages.
    #[serde(default)]
    pub stages: bool,
    /// The app that recorded it, by name where the device knew one.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
}

/// Where a Day's sleep figure came from.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SleepSource {
    /// A session from Health Connect.
    HealthConnect,
    /// Worked out from when devices were last and first in use (see `estimate`).
    Estimated,
}

/// A Day's sleep: the night that ended on its morning.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Sleep {
    pub bedtime: Timestamp,
    pub wake: Timestamp,
    /// Minutes asleep. An estimate counts the whole stretch, less any brief
    /// moments a device was used in the middle of it.
    pub asleep: u32,
    pub source: SleepSource,
    /// The app that recorded it (Health Connect only).
    #[serde(skip_serializing_if = "Option::is_none")]
    pub origin: Option<String>,
    /// The device that read it from Health Connect.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub device: Option<String>,
}

/// Which calendars count toward the calendar load, and the one device that
/// reads them: the device the choice was last saved on. One reporter means
/// the same meeting never counts twice from two devices.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarChoice {
    #[serde(default)]
    pub device: Option<String>,
    #[serde(default)]
    pub calendars: Vec<CalendarId>,
}

/// One calendar, named the way every device that syncs it names it: its
/// account and its display name. Android's own calendar numbers differ from
/// device to device, so they can't identify one.
#[derive(Debug, Clone, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
pub struct CalendarId {
    /// Such as "you@example.com".
    pub account: String,
    /// Such as "Classes".
    pub name: String,
    /// Its color, "#rrggbb", so a device that can't list calendars (Windows)
    /// can still show the choice. Not part of its identity.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

impl CalendarId {
    fn key(&self) -> (&str, &str) {
        (&self.account, &self.name)
    }
}

/// One Day's calendar load: timed events only (no all-day, declined, or
/// free ones, which the device leaves out), and no titles, people, or places.
#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
pub struct CalendarDay {
    /// Events starting in this Day.
    pub meetings: u32,
    /// Minutes with at least one event, overlaps counted once.
    pub busy_minutes: u32,
    /// Busy minutes in each clock hour (24, midnight first). Empty for Days
    /// older than the log keeps; the totals above stay.
    #[serde(default)]
    pub busy_hours: Vec<u32>,
    /// Events starting in each clock hour (24, midnight first). Empty for
    /// Days older than the log keeps.
    #[serde(default)]
    pub meeting_hours: Vec<u32>,
    /// The busy stretches, overlaps merged, oldest first, as [start, end].
    /// Empty for Days older than the log keeps.
    #[serde(default)]
    pub busy: Vec<(Timestamp, Timestamp)>,
}

/// Why a calendar report was turned down.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum CalendarRefusal {
    /// Another device reports calendars, or none has been chosen.
    NotReporter,
    /// The Days run backwards.
    BadRange,
}

/// Two sessions from the same app this close are one night with a wake-up in it.
const SPLIT_NIGHT: SignedDuration = SignedDuration::from_mins(60);
/// A session waking at or after this local time is an evening nap.
const NAP_FROM: Time = Time::constant(18, 0, 0, 0);
/// Activity moments closer together than this are kept as one.
const ACTIVITY_SPACING: u16 = 5;
/// An estimate looks for the night between these local times (the evening
/// before, and the morning of): about 20:00 to 12:00, with an hour's give.
const LOOK_FROM: Time = Time::constant(19, 0, 0, 0);
const LOOK_UNTIL: Time = Time::constant(13, 0, 0, 0);
/// A stillness at least this long is a candidate night; a burst of use
/// shorter than `BRIEF_USE` between two of them (checking the time at 03:00)
/// doesn't end the night.
const STILL: SignedDuration = SignedDuration::from_mins(60);
const BRIEF_USE: SignedDuration = SignedDuration::from_mins(15);
/// An estimated night is at least this long and at most this long: longer
/// means the devices were off or away, not a night's sleep.
const SHORTEST_NIGHT: SignedDuration = SignedDuration::from_hours(3);
const LONGEST_NIGHT: SignedDuration = SignedDuration::from_hours(14);

impl Ledger {
    /// One device's Health Connect sleep sessions that ended at or after
    /// `since`, replacing what it reported for that span before (so a session
    /// deleted on the device goes here too). False, keeping nothing, for a
    /// session that ends before it starts, lasts over a day, or claims more
    /// sleep than its length, or for a `since` in the future.
    pub fn report_sleep(
        &mut self,
        device: &str,
        since: Timestamp,
        sessions: Vec<SleepSession>,
        now: Timestamp,
    ) -> bool {
        let sane = |s: &SleepSession| {
            let length = s.start.duration_until(s.end);
            s.start < s.end
                && length <= SignedDuration::from_hours(24)
                && i64::from(s.asleep) <= length.as_mins() + 1
        };
        if device.is_empty() || since > now || !sessions.iter().all(sane) {
            return false;
        }
        let kept = self.state.sleep.entry(device.to_string()).or_default();
        kept.retain(|s| s.end < since);
        kept.extend(sessions.into_iter().filter(|s| s.end >= since));
        kept.sort_by_key(|s| (s.start, s.end));
        kept.dedup();
        true
    }

    /// Each Day's sleep from `from` to `to`: Health Connect's where any
    /// device reported a night, otherwise an estimate where the activity the
    /// Ledger keeps allows one.
    pub(crate) fn sleep_between(&self, from: Date, to: Date) -> BTreeMap<Date, Sleep> {
        let tz = &self.state.settings.time_zone;
        let mut out = self.health_sleep(from, to);
        let (Some(lo), Some(hi)) = (
            from.yesterday().ok().and_then(|d| moment(tz, d, LOOK_FROM)),
            moment(tz, to, LOOK_UNTIL),
        ) else {
            return out;
        };
        let points = self.activity_points(lo, hi);
        let mut day = from;
        while day <= to {
            if let std::collections::btree_map::Entry::Vacant(slot) = out.entry(day)
                && let Some(sleep) = estimate(&points, tz, day)
            {
                slot.insert(sleep);
            }
            let Ok(next) = day.tomorrow() else { break };
            day = next;
        }
        out
    }

    /// The Health Connect night for each Day from `from` to `to`. Several
    /// devices (or apps) recording the same night are one night: the one
    /// with sleep stages wins, then the longest asleep.
    fn health_sleep(&self, from: Date, to: Date) -> BTreeMap<Date, Sleep> {
        let tz = &self.state.settings.time_zone;
        let mut nights: BTreeMap<Date, Vec<(&str, SleepSession)>> = BTreeMap::new();
        for (device, sessions) in &self.state.sleep {
            for night in join_split_nights(sessions) {
                let local = night.end.to_zoned(tz.clone()).datetime();
                if local.time() >= NAP_FROM || local.date() < from || local.date() > to {
                    continue;
                }
                nights
                    .entry(local.date())
                    .or_default()
                    .push((device, night));
            }
        }
        nights
            .into_iter()
            .filter_map(|(day, found)| Some((day, pick_night(found)?)))
            .collect()
    }

    /// Moments any device was in use between `from` and `to`, oldest first:
    /// tasks finished and Vouchers torn (from the log), reasons given for
    /// Unlocks, focus minutes arriving from a device, and the middle of each
    /// clock hour that had Distraction minutes. Workouts and steps are left
    /// out: a watch syncs those while you sleep.
    fn activity_points(&self, from: Timestamp, to: Timestamp) -> Vec<Timestamp> {
        let settings = &self.state.settings;
        let tz = &settings.time_zone;
        let within = |at: &Timestamp| from <= *at && *at <= to;
        let mut points: Vec<Timestamp> = Vec::new();
        for entry in &self.state.log {
            match entry {
                Entry::Earned { at, task, .. } if within(at) => {
                    let kind = group_of(settings, task)
                        .and_then(|id| settings.sources.get(id))
                        .map(|s| s.kind);
                    if !matches!(kind, Some(SourceKind::Workout | SourceKind::Steps)) {
                        points.push(*at);
                    }
                }
                Entry::Redeemed { at, .. } if within(at) => points.push(*at),
                _ => {}
            }
        }
        points.extend(self.state.reasons.iter().map(|r| r.at).filter(within));
        let first = days_before(day_of(settings, from), 1);
        let last = day_of(settings, to);
        for (day, score) in self.state.days.range(first..=last) {
            let mut busy = [false; 24];
            for hours in score.usage.values().flat_map(|apps| apps.values()) {
                for (h, &m) in hours.iter().enumerate().take(24) {
                    busy[h] |= m > 0;
                }
            }
            for (h, _) in busy.iter().enumerate().filter(|(_, b)| **b) {
                // A Day's small hours (before Curfew ends) are the next date's.
                let middle = Time::constant(h as i8, 30, 0, 0);
                let date = if middle < settings.curfew_end {
                    day.tomorrow().ok()
                } else {
                    Some(*day)
                };
                points.extend(date.and_then(|d| moment(tz, d, middle)).filter(within));
            }
        }
        let first_date = from.to_zoned(tz.clone()).date();
        let last_date = to.to_zoned(tz.clone()).date();
        for (date, minutes) in self.state.activity.range(first_date..=last_date) {
            for &m in minutes {
                let time = Time::new((m / 60) as i8, (m % 60) as i8, 0, 0).ok();
                points.extend(time.and_then(|t| moment(tz, *date, t)).filter(within));
            }
        }
        points.sort();
        points.dedup();
        points
    }

    /// Notes that a device was in use at `at` (focus minutes just arrived),
    /// for estimating sleep. Kept as minutes of the local day, one per five
    /// minutes, for as long as the log.
    pub(crate) fn note_activity(&mut self, at: Timestamp) {
        let local = at
            .to_zoned(self.state.settings.time_zone.clone())
            .datetime();
        let minute = local.hour() as u16 * 60 + local.minute() as u16;
        let list = self.state.activity.entry(local.date()).or_default();
        let place = list.partition_point(|&m| m < minute);
        let near = |i: usize| {
            list.get(i)
                .is_some_and(|&m| m.abs_diff(minute) < ACTIVITY_SPACING)
        };
        if near(place) || (place > 0 && near(place - 1)) {
            return;
        }
        list.insert(place, minute);
    }

    /// The calendars that count, and the device that reports them.
    pub fn calendars(&self) -> &CalendarChoice {
        &self.state.calendars
    }

    /// Saves a choice of calendars made on `device`, which from now on is the
    /// one that reports them. Choosing other calendars clears the calendar
    /// load kept so far, so Days never mix two choices; the device sends the
    /// new choice's history next. Only the reporting device changing keeps
    /// it. False for a blank device or calendar.
    pub fn choose_calendars(&mut self, device: &str, mut calendars: Vec<CalendarId>) -> bool {
        if device.trim().is_empty()
            || calendars.len() > 200
            || calendars.iter().any(|c| c.name.trim().is_empty())
        {
            return false;
        }
        for c in &mut calendars {
            if !c.color.as_deref().is_some_and(crate::is_hex_color) {
                c.color = None;
            }
        }
        calendars.sort();
        calendars.dedup_by(|a, b| a.key() == b.key());
        let before: Vec<_> = self
            .state
            .calendars
            .calendars
            .iter()
            .map(CalendarId::key)
            .collect();
        let after: Vec<_> = calendars.iter().map(CalendarId::key).collect();
        if before != after {
            self.state.calendar.clear();
        }
        self.state.calendars = CalendarChoice {
            device: Some(device.trim().to_string()),
            calendars,
        };
        true
    }

    /// The reporting device's timed events for the Days `from` to `to`,
    /// replacing what those Days held. Each event counts as a meeting in the
    /// Day it starts in, and its minutes count in every Day it covers. Days
    /// outside what the log keeps, or after today, are left alone. Returns
    /// how many Days were kept.
    pub fn report_calendar(
        &mut self,
        device: &str,
        from: Date,
        to: Date,
        events: &[(Timestamp, Timestamp)],
        now: Timestamp,
    ) -> Result<u32, CalendarRefusal> {
        if self.state.calendars.device.as_deref() != Some(device)
            || self.state.calendars.calendars.is_empty()
        {
            return Err(CalendarRefusal::NotReporter);
        }
        if from > to {
            return Err(CalendarRefusal::BadRange);
        }
        let today = day_of(&self.state.settings, now);
        let (from, to) = (from.max(days_before(today, LOG_DAYS)), to.min(today));
        let events: Vec<(Timestamp, Timestamp)> = events
            .iter()
            .copied()
            .filter(|(s, e)| s < e && s.duration_until(*e) <= SignedDuration::from_hours(24))
            .collect();
        let mut kept = 0;
        let mut day = from;
        while day <= to {
            if let Some(load) = self.load_of(day, &events) {
                self.state.calendar.insert(day, load);
                kept += 1;
            }
            let Ok(next) = day.tomorrow() else { break };
            day = next;
        }
        Ok(kept)
    }

    /// One Day's calendar load from a list of events.
    fn load_of(&self, day: Date, events: &[(Timestamp, Timestamp)]) -> Option<CalendarDay> {
        let settings = &self.state.settings;
        let tz = &settings.time_zone;
        let open = moment(tz, day, settings.curfew_end)?;
        let close = moment(tz, day.tomorrow().ok()?, settings.curfew_end)?;
        let mut load = CalendarDay {
            busy_hours: vec![0; 24],
            meeting_hours: vec![0; 24],
            ..CalendarDay::default()
        };
        let mut covered = Vec::new();
        for &(start, end) in events {
            if open <= start && start < close {
                load.meetings += 1;
                load.meeting_hours[start.to_zoned(tz.clone()).hour() as usize] += 1;
            }
            let (a, b) = (start.max(open), end.min(close));
            if a < b {
                covered.push((a, b));
            }
        }
        load.busy = merge(covered);
        let mut seconds = [0i64; 24];
        for &(a, b) in &load.busy {
            for_each_hour(tz, a, b, |hour, s| seconds[hour] += s);
        }
        load.busy_hours = seconds
            .iter()
            .map(|&s| ((s + 30) / 60).min(60) as u32)
            .collect();
        let total: i64 = load
            .busy
            .iter()
            .map(|(a, b)| a.duration_until(*b).as_secs())
            .sum();
        load.busy_minutes = u32::try_from((total + 30) / 60).unwrap_or(u32::MAX);
        Some(load)
    }

    /// Answers "How was your energy today?" for `day`, 1 (drained) to 5
    /// (full of energy); None clears it. Like the Curfew question, only today
    /// and the six Days before can be answered.
    pub fn set_energy(&mut self, day: Date, energy: Option<u8>, now: Timestamp) -> bool {
        let today = day_of(&self.state.settings, now);
        if day > today
            || day < days_before(today, 6)
            || energy.is_some_and(|e| !(1..=5).contains(&e))
        {
            return false;
        }
        match energy {
            Some(e) => self.state.energy.insert(day, e),
            None => self.state.energy.remove(&day),
        };
        true
    }

    /// The Day's energy answer, if any.
    pub(crate) fn energy_of(&self, day: Date) -> Option<u8> {
        self.state.energy.get(&day).copied()
    }

    /// The Day's calendar load, if the reporting device sent one.
    pub(crate) fn calendar_of(&self, day: Date) -> Option<CalendarDay> {
        self.state.calendar.get(&day).cloned()
    }

    /// Drops what goes with the log once a Day is older than it: activity
    /// moments, and each calendar Day's hours and stretches (its totals stay).
    pub(crate) fn forget_old_measures(&mut self, oldest: Date) {
        if let Ok(before) = oldest.yesterday() {
            self.state.activity.retain(|date, _| *date >= before);
        }
        for (_, load) in self.state.calendar.range_mut(..oldest) {
            load.busy_hours.clear();
            load.meeting_hours.clear();
            load.busy.clear();
        }
    }
}

/// The moment the local clock reads `time` on `date`.
fn moment(tz: &TimeZone, date: Date, time: Time) -> Option<Timestamp> {
    date.to_datetime(time)
        .to_zoned(tz.clone())
        .ok()
        .map(|z| z.timestamp())
}

/// Calls `add(hour, seconds)` for each local clock hour [a, b) covers.
fn for_each_hour(tz: &TimeZone, a: Timestamp, b: Timestamp, mut add: impl FnMut(usize, i64)) {
    let mut at = a;
    while at < b {
        let local = at.to_zoned(tz.clone());
        let next = local
            .start_of_day()
            .ok()
            .and_then(|d| {
                d.checked_add(jiff::Span::new().hours(i64::from(local.hour()) + 1))
                    .ok()
            })
            .map(|z| z.timestamp())
            .filter(|n| *n > at)
            .unwrap_or(b)
            .min(b);
        add(local.hour() as usize, at.duration_until(next).as_secs());
        at = next;
    }
}

/// Stretches with overlaps (and touching ends) merged, oldest first.
fn merge(mut stretches: Vec<(Timestamp, Timestamp)>) -> Vec<(Timestamp, Timestamp)> {
    stretches.sort();
    let mut out: Vec<(Timestamp, Timestamp)> = Vec::new();
    for (a, b) in stretches {
        match out.last_mut() {
            Some(last) if a <= last.1 => last.1 = last.1.max(b),
            _ => out.push((a, b)),
        }
    }
    out
}

/// One device's sessions, with a night split by a wake-up (two sessions from
/// the same app under an hour apart) joined into one, and the same app
/// writing a night twice kept once.
fn join_split_nights(sessions: &[SleepSession]) -> Vec<SleepSession> {
    let mut sorted = sessions.to_vec();
    sorted.sort_by_key(|s| s.start);
    let mut out: Vec<SleepSession> = Vec::new();
    for s in sorted {
        let joined = out
            .iter_mut()
            .rev()
            .find(|o| o.origin == s.origin && o.end.duration_until(s.start) < SPLIT_NIGHT);
        match joined {
            // Overlapping: the same night written twice.
            Some(night) if s.start < night.end => {
                night.asleep = night.asleep.max(s.asleep);
                night.end = night.end.max(s.end);
                night.stages |= s.stages;
            }
            Some(night) => {
                night.asleep += s.asleep;
                night.end = s.end;
                night.stages |= s.stages;
            }
            None => out.push(s),
        }
    }
    out
}

/// A Day's night from every device's candidates: the longest asleep finds
/// the night; of the candidates overlapping it (the same night from another
/// device or app), one with sleep stages wins, then the longest asleep, then
/// the device first by name.
fn pick_night(found: Vec<(&str, SleepSession)>) -> Option<Sleep> {
    let main = found
        .iter()
        .map(|(_, s)| s)
        .max_by_key(|s| s.asleep)?
        .clone();
    let (device, best) = found
        .into_iter()
        .filter(|(_, s)| s.start < main.end && main.start < s.end)
        .max_by(|(da, a), (db, b)| {
            (a.stages, a.asleep)
                .cmp(&(b.stages, b.asleep))
                .then_with(|| db.cmp(da))
        })?;
    Some(Sleep {
        bedtime: best.start,
        wake: best.end,
        asleep: best.asleep,
        source: SleepSource::HealthConnect,
        origin: best.origin,
        device: Some(device.to_string()),
    })
}

/// The night ending on `date`, from moments of device use: the longest
/// stillness between 19:00 the evening before and 13:00 that day that
/// reaches into the small hours (00:00 to 06:00), with activity on both
/// sides of it. A burst of use under 15 minutes in the small hours between
/// two stillnesses of an hour or more (checking the time at 03:00) joins
/// them, its minutes taken off the sleep. None when there is no such stillness, or it is under
/// 3 hours or over 14.
fn estimate(points: &[Timestamp], tz: &TimeZone, date: Date) -> Option<Sleep> {
    let lo = moment(tz, date.yesterday().ok()?, LOOK_FROM)?;
    let hi = moment(tz, date, LOOK_UNTIL)?;
    let small_from = moment(tz, date, Time::midnight())?;
    let small_until = moment(tz, date, Time::constant(6, 0, 0, 0))?;
    let near = &points[points.partition_point(|p| *p < lo)..points.partition_point(|p| *p <= hi)];
    // Stillnesses of an hour or more, as (start, end, minutes of brief use inside).
    let mut still: Vec<(Timestamp, Timestamp, SignedDuration)> = Vec::new();
    for pair in near.windows(2) {
        let (a, b) = (pair[0], pair[1]);
        if a.duration_until(b) < STILL {
            continue;
        }
        match still.last_mut() {
            // A lone moment of use counts as brief, so only use in the
            // small hours joins stillnesses: the last use before bed isn't one.
            Some(last)
                if last.1.duration_until(a) < BRIEF_USE
                    && small_from <= last.1
                    && a <= small_until =>
            {
                last.2 += last.1.duration_until(a);
                last.1 = b;
            }
            _ => still.push((a, b, SignedDuration::ZERO)),
        }
    }
    let (bed, wake, used) = still
        .into_iter()
        .filter(|(a, b, _)| *a < small_until && small_from < *b)
        .max_by_key(|(a, b, used)| a.duration_until(*b) - *used)?;
    let length = bed.duration_until(wake);
    if length < SHORTEST_NIGHT || length > LONGEST_NIGHT {
        return None;
    }
    Some(Sleep {
        bedtime: bed,
        wake,
        asleep: u32::try_from((length - used).as_mins()).unwrap_or(0),
        source: SleepSource::Estimated,
        origin: None,
        device: None,
    })
}
