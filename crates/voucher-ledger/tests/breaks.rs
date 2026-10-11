// When focus stretches started, and when Unlocks and Distraction happened:
// what "a break before a stretch" (What goes with a good Day) is read from.
use ed25519_dalek::SigningKey;
use jiff::{
    Timestamp,
    civil::{date, time},
    tz::TimeZone,
};
use std::collections::BTreeMap;
use voucher_ledger::{Ledger, Settings, Stretch};

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

fn fresh() -> Ledger {
    Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-10-01T00:00-07:00"),
    )
}

fn stretch(start: &str, minutes: u32, source: &str) -> Stretch {
    Stretch {
        start: at(start),
        minutes,
        source: source.into(),
    }
}

fn some_usage() -> BTreeMap<String, Vec<u32>> {
    let mut hours = vec![0; 24];
    hours[13] = 12;
    BTreeMap::from([("Instagram".to_string(), hours)])
}

// ---- The migration ----

#[test]
fn a_state_saved_with_stretch_lengths_only_loads_and_takes_starts() {
    let saved = include_str!("fixtures/state-before-stretch-starts.json");
    let mut ledger = Ledger::load(saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    let now = at("2026-10-10T23:30-07:00");
    let day = ledger.history(1, now).pop().unwrap();
    assert_eq!(day.day, date(2026, 10, 10));
    // The lengths are still there; their starts were never sent.
    assert_eq!(day.stretches, vec![12, 40]);
    assert!(day.timed_stretches.is_empty());
    // The phone's Distraction minutes came without spans: not known.
    assert_eq!(day.used.get("Instagram"), Some(&5));
    assert_eq!(day.distraction_spans, None);
    // The log's two tears, the second stacked onto the first, are one Unlock.
    assert_eq!(
        day.unlocks,
        vec![(at("2026-10-10T12:00-07:00"), at("2026-10-10T12:20-07:00"))]
    );

    // A newer phone sends the starts and spans, which save and load again.
    let d = date(2026, 10, 10);
    assert!(ledger.report_timed_stretches(
        "phone",
        d,
        vec![
            stretch("2026-10-10T09:00-07:00", 12, "obsidian"),
            stretch("2026-10-10T14:00-07:00", 45, "reading"),
        ],
        now
    ));
    assert!(ledger.report_distraction_spans(
        "phone",
        d,
        vec![(at("2026-10-10T12:01-07:00"), at("2026-10-10T12:06-07:00"))],
        now
    ));
    let mut again = Ledger::load(&ledger.save(), SigningKey::from_bytes(&[7; 32])).unwrap();
    let day = again.history(1, now).pop().unwrap();
    // The lengths follow the timed report, so the two agree.
    assert_eq!(day.stretches, vec![12, 45]);
    assert_eq!(day.timed_stretches.len(), 2);
    assert_eq!(day.timed_stretches[1].source, "reading");
    assert_eq!(
        day.distraction_spans,
        Some(vec![(
            at("2026-10-10T12:01-07:00"),
            at("2026-10-10T12:06-07:00")
        )])
    );
}

#[test]
fn an_older_ledger_reading_the_new_state_finds_the_new_fields_beside_the_old() {
    // An older Ledger has no unknown-field guard, so it skips these and still
    // reads the lengths it knows.
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_usage("phone", day, some_usage(), now));
    assert!(ledger.report_timed_stretches(
        "phone",
        day,
        vec![stretch("2026-10-02T09:00-07:00", 30, "obsidian")],
        now
    ));
    assert!(ledger.report_distraction_spans(
        "phone",
        day,
        vec![(at("2026-10-02T13:00-07:00"), at("2026-10-02T13:12-07:00"))],
        now
    ));
    let saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    let score = &saved["days"]["2026-10-02"];
    assert_eq!(score["stretches"]["phone"], serde_json::json!([30]));
    assert!(score["timed_stretches"]["phone"].is_array());
    assert!(score["distraction_spans"]["phone"].is_array());
}

// ---- Stretches ----

#[test]
fn an_older_enforcer_still_sends_lengths_alone() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_focus_and_opens("tablet", day, Some(vec![25]), None, now));
    assert!(ledger.report_timed_stretches(
        "phone",
        day,
        vec![stretch("2026-10-02T10:00-07:00", 40, "anki")],
        now
    ));
    let d = &ledger.history(1, now)[0];
    let mut lengths = d.stretches.clone();
    lengths.sort();
    // Both devices' lengths count; only the phone's stretch has a start.
    assert_eq!(lengths, vec![25, 40]);
    assert_eq!(
        d.timed_stretches,
        vec![stretch("2026-10-02T10:00-07:00", 40, "anki")]
    );
}

#[test]
fn stretches_outside_the_day_or_of_no_length_are_dropped() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_timed_stretches(
        "phone",
        day,
        vec![
            stretch("2026-10-02T14:00-07:00", 20, "obsidian"),
            // 05:30 is still the Day before.
            stretch("2026-10-02T05:30-07:00", 20, "obsidian"),
            stretch("2026-10-02T08:00-07:00", 0, "obsidian"),
            stretch("2026-10-02T09:00-07:00", 15, " "),
            stretch("2026-10-02T07:00-07:00", 10, "reading"),
        ],
        now
    ));
    let d = &ledger.history(1, now)[0];
    // Oldest first.
    assert_eq!(
        d.timed_stretches,
        vec![
            stretch("2026-10-02T07:00-07:00", 10, "reading"),
            stretch("2026-10-02T14:00-07:00", 20, "obsidian"),
        ]
    );
    // Only today and yesterday are taken.
    assert!(!ledger.report_timed_stretches("phone", date(2026, 9, 29), vec![], now));
}

// ---- Unlocks ----

#[test]
fn unlocks_run_from_each_tear_and_a_stacked_tear_continues_one() {
    let mut ledger = fresh();
    ledger.credit(6, at("2026-10-02T08:00-07:00"));
    ledger.redeem(at("2026-10-02T10:00-07:00")).unwrap();
    // Torn again five minutes in: it runs on from 10:10.
    ledger.redeem_many(2, at("2026-10-02T10:05-07:00")).unwrap();
    ledger.redeem(at("2026-10-02T15:00-07:00")).unwrap();
    // Curfew cuts the last one short.
    ledger.redeem(at("2026-10-02T21:55-07:00")).unwrap();
    let d = &ledger.history(1, at("2026-10-02T23:00-07:00"))[0];
    assert_eq!(
        d.unlocks,
        vec![
            (at("2026-10-02T10:00-07:00"), at("2026-10-02T10:30-07:00")),
            (at("2026-10-02T15:00-07:00"), at("2026-10-02T15:10-07:00")),
            (at("2026-10-02T21:55-07:00"), at("2026-10-02T22:00-07:00")),
        ]
    );
}

// ---- Distraction spans ----

#[test]
fn spans_merge_across_devices_and_count_only_when_every_device_sent_them() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_usage("phone", day, some_usage(), now));
    assert!(ledger.report_distraction_spans(
        "phone",
        day,
        vec![
            (at("2026-10-02T13:10-07:00"), at("2026-10-02T13:20-07:00")),
            (at("2026-10-02T13:00-07:00"), at("2026-10-02T13:05-07:00")),
            // Starts in the Day before: dropped.
            (at("2026-10-02T05:00-07:00"), at("2026-10-02T06:30-07:00")),
            // Runs past now: cut there.
            (at("2026-10-02T15:20-07:00"), at("2026-10-02T16:00-07:00")),
        ],
        now
    ));
    assert_eq!(
        ledger.history(1, now)[0].distraction_spans,
        Some(vec![
            (at("2026-10-02T13:00-07:00"), at("2026-10-02T13:05-07:00")),
            (at("2026-10-02T13:10-07:00"), at("2026-10-02T13:20-07:00")),
            (at("2026-10-02T15:20-07:00"), at("2026-10-02T15:30-07:00")),
        ])
    );
    // A tablet reports minutes but no spans: the Day's spans are unknown.
    assert!(ledger.report_usage("tablet", day, some_usage(), now));
    assert_eq!(ledger.history(1, now)[0].distraction_spans, None);
    // Once it sends them too, both devices' spans are merged.
    assert!(ledger.report_distraction_spans(
        "tablet",
        day,
        vec![(at("2026-10-02T13:04-07:00"), at("2026-10-02T13:12-07:00"))],
        now
    ));
    assert_eq!(
        ledger.history(1, now)[0].distraction_spans,
        Some(vec![
            (at("2026-10-02T13:00-07:00"), at("2026-10-02T13:20-07:00")),
            (at("2026-10-02T15:20-07:00"), at("2026-10-02T15:30-07:00")),
        ])
    );
}

#[test]
fn a_day_with_no_distraction_report_has_no_spans_and_a_quiet_one_has_none_in_them() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert_eq!(ledger.history(1, now)[0].distraction_spans, None);
    // Measured, and nothing used: known to be empty.
    assert!(ledger.report_usage("phone", day, BTreeMap::new(), now));
    assert!(ledger.report_distraction_spans("phone", day, vec![], now));
    assert_eq!(ledger.history(1, now)[0].distraction_spans, Some(vec![]));
}

#[test]
fn starts_and_spans_are_forgotten_with_the_hourly_log() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_usage("phone", day, some_usage(), now));
    assert!(ledger.report_timed_stretches(
        "phone",
        day,
        vec![stretch("2026-10-02T09:00-07:00", 30, "obsidian")],
        now
    ));
    assert!(ledger.report_distraction_spans(
        "phone",
        day,
        vec![(at("2026-10-02T13:00-07:00"), at("2026-10-02T13:12-07:00"))],
        now
    ));
    // 183 Days on, it is still kept; a Day later it is gone.
    let kept = at("2027-04-03T12:00-07:00");
    assert!(ledger.report_usage("phone", date(2027, 4, 3), some_usage(), kept));
    let old = ledger.history(184, kept).into_iter().next().unwrap();
    assert_eq!(old.day, day);
    assert_eq!(old.timed_stretches.len(), 1);
    assert!(old.distraction_spans.is_some());
    let later = at("2027-04-04T12:00-07:00");
    assert!(ledger.report_usage("phone", date(2027, 4, 4), some_usage(), later));
    let old = ledger.history(185, later).into_iter().next().unwrap();
    assert_eq!(old.day, day);
    assert!(old.timed_stretches.is_empty());
    assert!(old.stretches.is_empty());
    assert_eq!(old.distraction_spans, None);
}
