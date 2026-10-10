// Distraction minutes the phone measured, hour by hour, for Trends.
use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::{date, time}, tz::TimeZone};
use std::collections::BTreeMap;
use voucher_ledger::{Ledger, Settings};

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
    Ledger::new(settings(), SigningKey::from_bytes(&[7; 32]), at("2026-10-01T00:00-07:00"))
}

/// Minutes in the given clock hours, zero elsewhere.
fn hours(pairs: &[(usize, u32)]) -> Vec<u32> {
    let mut out = vec![0; 24];
    for &(h, m) in pairs {
        out[h] = m;
    }
    out
}

fn apps(list: &[(&str, Vec<u32>)]) -> BTreeMap<String, Vec<u32>> {
    list.iter().map(|(k, v)| (k.to_string(), v.clone())).collect()
}

#[test]
fn a_days_usage_shows_by_hour_and_in_the_history() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    assert!(ledger.report_usage("phone", day, apps(&[("Instagram", hours(&[(9, 12), (14, 30)])), ("YouTube", hours(&[(14, 8)]))]), now));
    let summary = ledger.day(day, now);
    assert_eq!(summary.usage["Instagram"], hours(&[(9, 12), (14, 30)]));
    assert_eq!(summary.usage["YouTube"], hours(&[(14, 8)]));
    let history = ledger.history(2, now);
    assert_eq!(history[1].used["Instagram"], 42);
    assert_eq!(history[1].used["YouTube"], 8);
    assert!(history[0].used.is_empty());
}

#[test]
fn a_new_report_replaces_that_devices_last_one_and_devices_add_up() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    ledger.report_usage("phone", day, apps(&[("Instagram", hours(&[(9, 12)]))]), now);
    ledger.report_usage("phone", day, apps(&[("Instagram", hours(&[(9, 20)]))]), now);
    ledger.report_usage("tablet", day, apps(&[("Instagram", hours(&[(9, 15)]))]), now);
    // Two screens in the same hour can't add past the hour.
    assert_eq!(ledger.day(day, now).usage["Instagram"], hours(&[(9, 35)]));
    ledger.report_usage("tablet", day, apps(&[("Instagram", hours(&[(9, 50)]))]), now);
    assert_eq!(ledger.day(day, now).usage["Instagram"], hours(&[(9, 60)]));
}

#[test]
fn only_today_and_yesterday_take_reports_and_bad_ones_are_refused() {
    let mut ledger = fresh();
    let now = at("2026-10-05T15:30-07:00");
    assert!(ledger.report_usage("phone", date(2026, 10, 4), apps(&[("X", hours(&[(23, 5)]))]), now));
    assert!(!ledger.report_usage("phone", date(2026, 10, 2), apps(&[("X", hours(&[(9, 5)]))]), now));
    assert!(!ledger.report_usage("phone", date(2026, 10, 5), apps(&[("X", vec![1; 25])]), now));
    assert!(!ledger.report_usage("phone", date(2026, 10, 5), apps(&[("X", hours(&[(9, 61)]))]), now));
}

#[test]
fn usage_is_kept_as_long_as_the_log() {
    let mut ledger = fresh();
    let day = date(2026, 10, 2);
    ledger.report_usage("phone", day, apps(&[("X", hours(&[(9, 5)]))]), at("2026-10-02T15:30-07:00"));
    // Half a year on, a new report lets the old Day's minutes go.
    let later = at("2027-04-10T12:00-07:00");
    ledger.report_usage("phone", date(2027, 4, 10), apps(&[("X", hours(&[(9, 1)]))]), later);
    assert!(ledger.day(day, later).usage.is_empty());
}

#[test]
fn the_history_counts_minutes_unlocked() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    ledger.credit(2, now);
    ledger.redeem_many(2, now).unwrap();
    assert_eq!(ledger.history(1, now)[0].unlocked_minutes, 20);
}

#[test]
fn the_history_has_each_days_goal_hours_and_first_tear() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    ledger.record(&[voucher_ledger::Completion { task: "todoist:a".into(), title: "A".into(), at: at("2026-10-02T09:10-07:00") }], at("2026-10-02T09:10-07:00"));
    ledger.record(&[voucher_ledger::Completion { task: "todoist:b".into(), title: "B".into(), at: at("2026-10-02T09:40-07:00") }], at("2026-10-02T09:40-07:00"));
    ledger.credit(2, at("2026-10-02T11:00-07:00"));
    ledger.redeem_many(1, at("2026-10-02T12:05-07:00")).unwrap();
    ledger.redeem_many(1, at("2026-10-02T14:00-07:00")).unwrap();
    let day = &ledger.history(1, now)[0];
    assert_eq!(day.goal, 3);
    assert_eq!(day.hours[9], 2);
    assert_eq!(day.hours.iter().sum::<u32>(), 2);
    assert_eq!(day.first_tear, Some(at("2026-10-02T12:05-07:00")));
}

#[test]
fn apps_keep_the_blocklist_their_device_named() {
    let mut ledger = fresh();
    let now = at("2026-10-02T15:30-07:00");
    let day = date(2026, 10, 2);
    let lists: BTreeMap<String, String> = [("Genshin Impact".to_string(), "games".to_string())].into();
    assert!(ledger.report_usage_in_lists("phone", day, apps(&[("Genshin Impact", hours(&[(20, 30)]))]), lists, now));
    assert_eq!(ledger.day(day, now).usage_lists["Genshin Impact"], "games");
    assert_eq!(ledger.history(1, now)[0].used_lists["Genshin Impact"], "games");
}
