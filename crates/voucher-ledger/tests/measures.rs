// Sleep, calendar load, and energy: what a Day was like besides its
// Vouchers, and how an existing Ledger's saved state takes them on.
use ed25519_dalek::SigningKey;
use jiff::{
    Timestamp,
    civil::{Date, date, time},
    tz::TimeZone,
};
use voucher_ledger::{
    CalendarId, CalendarRefusal, Completion, Ledger, Settings, SleepSession, SleepSource,
};

fn settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").unwrap(),
        bank_limit: 24,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: 3,
        sources: voucher_ledger::default_sources(),
        blocklists: voucher_ledger::default_blocklists(),
        released_devices: Default::default(),
    }
}

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

fn set_up() -> Ledger {
    let mut ledger = Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-09-01T00:00-07:00"),
    );
    ledger.setup(vec![], true, at("2026-09-01T09:00-07:00"));
    ledger
}

fn session(start: &str, end: &str, asleep: u32, stages: bool, origin: &str) -> SleepSession {
    SleepSession {
        start: at(start),
        end: at(end),
        asleep,
        stages,
        origin: Some(origin.into()),
    }
}

fn history_day(ledger: &mut Ledger, day: Date, now: Timestamp) -> voucher_ledger::DayTotal {
    ledger
        .history(14, now)
        .into_iter()
        .find(|d| d.day == day)
        .unwrap()
}

fn calendar(account: &str, name: &str) -> CalendarId {
    CalendarId {
        account: account.into(),
        name: name.into(),
        color: Some("#4285f4".into()),
    }
}

// ---- The migration ----

#[test]
fn a_state_saved_before_these_measures_loads_and_keeps_everything() {
    let saved = include_str!("fixtures/state-before-sleep.json");
    let mut ledger = Ledger::load(saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    let now = at("2026-10-10T23:30-07:00");
    let day = ledger.history(1, now).pop().unwrap();
    assert_eq!(day.day, date(2026, 10, 10));
    // What the old state held is all still there.
    assert_eq!(day.earned, 2);
    assert_eq!(day.verdict, Some(voucher_ledger::Verdict::Mostly));
    assert_eq!(day.used.get("Instagram"), Some(&5));
    assert_eq!(ledger.markers().len(), 1);
    assert_eq!(ledger.bank(), 2);
    // The new measures start empty.
    assert_eq!(day.energy, None);
    assert_eq!(day.calendar, None);
    assert!(ledger.calendars().calendars.is_empty());
    // And the upgraded state saves, takes the new measures, and loads again.
    assert!(ledger.set_energy(date(2026, 10, 10), Some(4), now));
    assert!(ledger.choose_calendars("phone", vec![calendar("a@example.com", "Classes")]));
    let again = Ledger::load(&ledger.save(), SigningKey::from_bytes(&[7; 32]));
    let mut again = again.unwrap();
    let day = again.history(1, now).pop().unwrap();
    assert_eq!(day.energy, Some(4));
    assert_eq!(day.earned, 2);
    assert_eq!(again.calendars().device.as_deref(), Some("phone"));
}

#[test]
fn an_older_ledger_reading_the_new_state_ignores_the_new_fields() {
    // A downgrade must not fail on load: the state has no unknown-field guard.
    let mut ledger = set_up();
    ledger.set_energy(date(2026, 10, 5), Some(3), at("2026-10-05T23:00-07:00"));
    let saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    for key in ["energy", "sleep", "calendars", "calendar", "activity"] {
        assert!(saved.get(key).is_some(), "{key} is saved");
    }
}

// ---- Sleep from Health Connect ----

#[test]
fn a_night_counts_toward_the_day_it_wakes_into() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let sessions = vec![
        // Woke at 07:10: the Day of the 5th.
        session(
            "2026-10-04T23:40-07:00",
            "2026-10-05T07:10-07:00",
            430,
            true,
            "Samsung Health",
        ),
        // Woke at 05:30, during Curfew: still the 6th's night, not the 5th's.
        session(
            "2026-10-05T23:00-07:00",
            "2026-10-06T05:30-07:00",
            380,
            true,
            "Samsung Health",
        ),
        // An evening nap counts toward no Day.
        session(
            "2026-10-06T18:10-07:00",
            "2026-10-06T18:50-07:00",
            40,
            false,
            "Samsung Health",
        ),
    ];
    assert!(ledger.report_sleep("phone", at("2026-10-01T00:00Z"), sessions, now));
    let fifth = history_day(&mut ledger, date(2026, 10, 5), now)
        .sleep
        .unwrap();
    assert_eq!(fifth.wake, at("2026-10-05T07:10-07:00"));
    assert_eq!(fifth.asleep, 430);
    assert_eq!(fifth.source, SleepSource::HealthConnect);
    assert_eq!(fifth.origin.as_deref(), Some("Samsung Health"));
    assert_eq!(fifth.device.as_deref(), Some("phone"));
    let sixth = history_day(&mut ledger, date(2026, 10, 6), now)
        .sleep
        .unwrap();
    assert_eq!(sixth.bedtime, at("2026-10-05T23:00-07:00"));
    assert_eq!(sixth.asleep, 380);
}

#[test]
fn a_night_split_by_a_wake_up_is_one_night() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let sessions = vec![
        session(
            "2026-10-05T23:30-07:00",
            "2026-10-06T03:00-07:00",
            200,
            true,
            "Fitbit",
        ),
        session(
            "2026-10-06T03:40-07:00",
            "2026-10-06T07:30-07:00",
            220,
            true,
            "Fitbit",
        ),
    ];
    ledger.report_sleep("phone", at("2026-10-01T00:00Z"), sessions, now);
    let night = history_day(&mut ledger, date(2026, 10, 6), now)
        .sleep
        .unwrap();
    assert_eq!(night.bedtime, at("2026-10-05T23:30-07:00"));
    assert_eq!(night.wake, at("2026-10-06T07:30-07:00"));
    assert_eq!(night.asleep, 420);
}

#[test]
fn the_same_night_from_two_devices_counts_once_preferring_stages() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    // The phone's sleep tracker: longer, but no stages.
    ledger.report_sleep(
        "phone",
        at("2026-10-01T00:00Z"),
        vec![session(
            "2026-10-05T23:00-07:00",
            "2026-10-06T07:00-07:00",
            480,
            false,
            "Sleep as Android",
        )],
        now,
    );
    // The tablet sees the watch's night, with stages.
    ledger.report_sleep(
        "tablet",
        at("2026-10-01T00:00Z"),
        vec![session(
            "2026-10-05T23:20-07:00",
            "2026-10-06T06:50-07:00",
            410,
            true,
            "Samsung Health",
        )],
        now,
    );
    let night = history_day(&mut ledger, date(2026, 10, 6), now)
        .sleep
        .unwrap();
    assert_eq!(night.device.as_deref(), Some("tablet"));
    assert_eq!(night.asleep, 410);
}

#[test]
fn a_new_report_replaces_the_devices_sessions_since_its_start() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    ledger.report_sleep(
        "phone",
        at("2026-10-01T00:00Z"),
        vec![
            session(
                "2026-10-04T23:00-07:00",
                "2026-10-05T07:00-07:00",
                450,
                true,
                "A",
            ),
            session(
                "2026-10-05T23:00-07:00",
                "2026-10-06T07:00-07:00",
                450,
                true,
                "A",
            ),
        ],
        now,
    );
    // The 6th's night was deleted on the phone; the 5th's is outside this report.
    ledger.report_sleep("phone", at("2026-10-06T00:00-07:00"), vec![], now);
    assert!(
        history_day(&mut ledger, date(2026, 10, 5), now)
            .sleep
            .is_some()
    );
    assert!(
        history_day(&mut ledger, date(2026, 10, 6), now)
            .sleep
            .is_none()
    );
}

#[test]
fn impossible_sessions_are_refused() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let backwards = session(
        "2026-10-06T07:00-07:00",
        "2026-10-05T23:00-07:00",
        10,
        false,
        "A",
    );
    let oversleeps = session(
        "2026-10-05T23:00-07:00",
        "2026-10-06T01:00-07:00",
        300,
        false,
        "A",
    );
    assert!(!ledger.report_sleep("phone", at("2026-10-01T00:00Z"), vec![backwards], now));
    assert!(!ledger.report_sleep("phone", at("2026-10-01T00:00Z"), vec![oversleeps], now));
    assert!(!ledger.report_sleep("phone", at("2026-10-08T00:00Z"), vec![], now));
}

// ---- Estimated sleep ----

/// Focus minutes arriving at `moment`, as a phone reports them.
fn focus_at(ledger: &mut Ledger, moment: &str, total: u32) {
    let now = at(moment);
    let day = ledger.today(now).day;
    ledger.report_from("phone", "obsidian", day, total, None, now);
}

#[test]
fn without_health_connect_sleep_is_estimated_from_device_use() {
    let mut ledger = set_up();
    focus_at(&mut ledger, "2026-10-05T21:10-07:00", 5);
    focus_at(&mut ledger, "2026-10-05T23:42-07:00", 10);
    // A glance at 03:05 doesn't end the night.
    focus_at(&mut ledger, "2026-10-06T03:05-07:00", 11);
    ledger.record(
        &[Completion {
            task: "todoist:1".into(),
            title: "Make bed".into(),
            at: at("2026-10-06T07:55-07:00"),
        }],
        at("2026-10-06T08:00-07:00"),
    );
    let now = at("2026-10-06T12:00-07:00");
    let night = history_day(&mut ledger, date(2026, 10, 6), now)
        .sleep
        .unwrap();
    assert_eq!(night.source, SleepSource::Estimated);
    assert_eq!(night.bedtime, at("2026-10-05T23:42-07:00"));
    assert_eq!(night.wake, at("2026-10-06T07:55-07:00"));
    assert_eq!(night.asleep, 8 * 60 + 13);
    assert_eq!(night.device, None);
}

#[test]
fn health_connect_wins_over_an_estimate_and_no_use_means_no_estimate() {
    let mut ledger = set_up();
    focus_at(&mut ledger, "2026-10-05T23:00-07:00", 5);
    focus_at(&mut ledger, "2026-10-06T07:30-07:00", 10);
    let now = at("2026-10-06T12:00-07:00");
    ledger.report_sleep(
        "phone",
        at("2026-10-01T00:00Z"),
        vec![session(
            "2026-10-05T23:15-07:00",
            "2026-10-06T07:20-07:00",
            460,
            true,
            "A",
        )],
        now,
    );
    let night = history_day(&mut ledger, date(2026, 10, 6), now)
        .sleep
        .unwrap();
    assert_eq!(night.source, SleepSource::HealthConnect);
    // The night before had no use on either side, so nothing is guessed.
    assert!(
        history_day(&mut ledger, date(2026, 10, 5), now)
            .sleep
            .is_none()
    );
}

// ---- Calendar load ----

#[test]
fn only_the_device_the_calendars_were_chosen_on_reports_them() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let day = date(2026, 10, 6);
    assert_eq!(
        ledger.report_calendar("phone", day, day, &[], now),
        Err(CalendarRefusal::NotReporter)
    );
    ledger.choose_calendars("phone", vec![calendar("a@example.com", "Classes")]);
    assert_eq!(
        ledger.report_calendar("tablet", day, day, &[], now),
        Err(CalendarRefusal::NotReporter)
    );
    assert_eq!(ledger.report_calendar("phone", day, day, &[], now), Ok(1));
    // Measured and empty is zero events, not "not measured".
    let load = history_day(&mut ledger, day, now).calendar.unwrap();
    assert_eq!(load.events, 0);
}

#[test]
fn busy_minutes_merge_overlaps_and_split_by_hour() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let day = date(2026, 10, 6);
    ledger.choose_calendars("phone", vec![calendar("a@example.com", "Classes")]);
    let events = [
        (at("2026-10-06T09:00-07:00"), at("2026-10-06T10:00-07:00")),
        // Overlaps the first by half an hour.
        (at("2026-10-06T09:30-07:00"), at("2026-10-06T10:30-07:00")),
        (at("2026-10-06T14:15-07:00"), at("2026-10-06T14:45-07:00")),
        // Runs past the Day's end at 06:00: its minutes split between Days.
        (at("2026-10-07T05:30-07:00"), at("2026-10-07T06:30-07:00")),
    ];
    let next = date(2026, 10, 7);
    let kept = ledger.report_calendar("phone", day, next, &events, at("2026-10-07T09:00-07:00"));
    assert_eq!(kept, Ok(2));
    let load = history_day(&mut ledger, day, now).calendar.unwrap();
    assert_eq!(load.events, 4);
    assert_eq!(load.busy_minutes, 90 + 30 + 30);
    assert_eq!(load.busy_hours[9], 60);
    assert_eq!(load.busy_hours[10], 30);
    assert_eq!(load.busy_hours[14], 30);
    assert_eq!(load.busy_hours[5], 30);
    assert_eq!(load.event_hours[9], 2);
    assert_eq!(
        load.busy[0],
        (at("2026-10-06T09:00-07:00"), at("2026-10-06T10:30-07:00"))
    );
    let after = history_day(&mut ledger, next, at("2026-10-07T09:00-07:00"))
        .calendar
        .unwrap();
    assert_eq!(after.events, 0);
    assert_eq!(after.busy_minutes, 30);
}

#[test]
fn a_state_that_called_events_meetings_still_loads() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let day = date(2026, 10, 6);
    ledger.choose_calendars("phone", vec![calendar("a@example.com", "Classes")]);
    let events = [(at("2026-10-06T09:00-07:00"), at("2026-10-06T10:00-07:00"))];
    assert_eq!(ledger.report_calendar("phone", day, day, &events, now), Ok(1));
    // Saved the way the first calendar Ledger saved it.
    let saved = ledger
        .save()
        .replace("\"events\":", "\"meetings\":")
        .replace("\"event_hours\":", "\"meeting_hours\":");
    assert!(saved.contains("\"meetings\": 1"));
    let mut old = Ledger::load(&saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    let load = history_day(&mut old, day, now).calendar.unwrap();
    assert_eq!(load.events, 1);
    assert_eq!(load.event_hours[9], 1);
    // And it saves under the new names.
    assert!(old.save().contains("\"events\": 1"));
}

#[test]
fn choosing_other_calendars_clears_the_load_but_changing_the_reporter_keeps_it() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    let day = date(2026, 10, 6);
    let classes = calendar("a@example.com", "Classes");
    ledger.choose_calendars("phone", vec![classes.clone()]);
    let events = [(at("2026-10-06T09:00-07:00"), at("2026-10-06T10:00-07:00"))];
    assert_eq!(
        ledger.report_calendar("phone", day, day, &events, now),
        Ok(1)
    );
    // The tablet takes over the same calendar (its color differs there).
    let mut on_tablet = classes.clone();
    on_tablet.color = Some("#0b8043".into());
    ledger.choose_calendars("tablet", vec![on_tablet]);
    assert_eq!(ledger.calendars().device.as_deref(), Some("tablet"));
    assert!(history_day(&mut ledger, day, now).calendar.is_some());
    ledger.choose_calendars("tablet", vec![classes, calendar("a@example.com", "Work")]);
    assert!(history_day(&mut ledger, day, now).calendar.is_none());
}

#[test]
fn a_calendar_report_reaches_back_only_as_far_as_the_log() {
    let mut ledger = set_up();
    let now = at("2026-10-06T20:00-07:00");
    ledger.choose_calendars("phone", vec![calendar("a@example.com", "Classes")]);
    let kept = ledger.report_calendar("phone", date(2025, 1, 1), date(2026, 12, 31), &[], now);
    // 183 Days back, plus today.
    assert_eq!(kept, Ok(184));
}

// ---- Energy ----

#[test]
fn energy_is_one_to_five_for_the_last_week() {
    let mut ledger = set_up();
    let now = at("2026-10-06T22:30-07:00");
    assert!(ledger.set_energy(date(2026, 10, 6), Some(2), now));
    assert!(!ledger.set_energy(date(2026, 10, 6), Some(6), now));
    assert!(!ledger.set_energy(date(2026, 10, 6), Some(0), now));
    assert!(!ledger.set_energy(date(2026, 9, 29), Some(3), now));
    assert!(!ledger.set_energy(date(2026, 10, 7), Some(3), now));
    assert_eq!(ledger.day(date(2026, 10, 6), now).energy, Some(2));
    assert!(ledger.set_energy(date(2026, 10, 6), None, now));
    assert_eq!(
        history_day(&mut ledger, date(2026, 10, 6), now).energy,
        None
    );
}

#[test]
fn the_csv_carries_sleep_and_calendar_but_not_energy() {
    let mut ledger = set_up();
    let now = at("2026-10-06T22:30-07:00");
    ledger.set_energy(date(2026, 10, 6), Some(4), now);
    ledger.report_sleep(
        "phone",
        at("2026-10-01T00:00Z"),
        vec![session(
            "2026-10-05T23:15-07:00",
            "2026-10-06T07:20-07:00",
            460,
            true,
            "A",
        )],
        now,
    );
    let csv = ledger.days_csv(now);
    let header = csv.lines().next().unwrap();
    assert!(
        header.contains(",bedtime,wake,asleep_minutes,sleep_source,events,busy_minutes")
    );
    // Energy is deprecated: still kept, no longer exported.
    assert!(!header.contains("energy"), "{header}");
    let row = csv.lines().find(|l| l.starts_with("2026-10-06,")).unwrap();
    assert!(row.contains(",23:15,07:20,460,health_connect,,"), "{row}");
    assert_eq!(row.split(',').count(), header.split(',').count(), "{row}");
}
