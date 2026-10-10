// Markers, the Curfew question, Unlock reasons, Replay guesses, silences,
// and the export: what Trends uses to tell a rule change, a lapse, or a
// missing report apart from real behaviour.
use ed25519_dalek::SigningKey;
use jiff::{
    Timestamp,
    civil::{date, time},
    tz::TimeZone,
};
use voucher_ledger::{Change, Ledger, Settings, Verdict};

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
        at("2026-10-01T00:00-07:00"),
    );
    ledger.setup(vec![], true, at("2026-10-01T09:00-07:00"));
    ledger
}

#[test]
fn a_rule_change_leaves_a_marker_and_cosmetic_ones_do_not() {
    let mut ledger = set_up();
    ledger.request(Change::DailyGoal(5), at("2026-10-01T10:00-07:00"));
    ledger.request(
        Change::SourceColor {
            id: "steps".into(),
            color: Some("#112233".into()),
        },
        at("2026-10-01T10:30-07:00"),
    );
    let markers = ledger.markers();
    assert_eq!(markers.len(), 1);
    assert!(markers[0].rule);
    assert_eq!(markers[0].text, "Daily goal 5");
}

#[test]
fn changes_minutes_apart_share_one_marker() {
    let mut ledger = set_up();
    ledger.request(Change::UnlockMinutes(15), at("2026-10-01T10:00-07:00"));
    ledger.request(Change::BankLimit(20), at("2026-10-01T10:03-07:00"));
    ledger.request(Change::BankLimit(18), at("2026-10-01T11:00-07:00"));
    let texts: Vec<_> = ledger.markers().iter().map(|m| m.text.as_str()).collect();
    assert_eq!(texts, ["Unlocks last 15 min; Bank holds 20", "Bank holds 18"]);
}

#[test]
fn setup_leaves_no_markers() {
    let mut ledger = Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-10-01T00:00-07:00"),
    );
    ledger.setup(vec![Change::DailyGoal(4)], false, at("2026-10-01T09:00-07:00"));
    assert!(ledger.markers().is_empty());
}

#[test]
fn hand_written_markers_sort_and_only_they_can_be_removed() {
    let mut ledger = set_up();
    let now = at("2026-10-03T12:00-07:00");
    ledger.request(Change::DailyGoal(5), at("2026-10-02T08:00-07:00"));
    assert!(ledger.add_marker("New term", None, now).is_some());
    assert!(ledger.add_marker("  Dose up ", Some(at("2026-10-01T20:00-07:00")), now).is_some());
    assert!(ledger.add_marker("", None, now).is_none());
    assert!(ledger.add_marker("later", Some(at("2026-10-04T12:00-07:00")), now).is_none());
    let texts: Vec<_> = ledger.markers().iter().map(|m| m.text.as_str()).collect();
    assert_eq!(texts, ["Dose up", "Daily goal 5", "New term"]);
    assert!(!ledger.remove_marker(at("2026-10-02T08:00-07:00")));
    assert!(ledger.remove_marker(at("2026-10-01T20:00-07:00")));
    assert_eq!(ledger.markers().len(), 2);
    let day = ledger.day(date(2026, 10, 3), now);
    assert_eq!(day.markers.len(), 1);
}

#[test]
fn the_curfew_question_takes_the_last_week_only() {
    let mut ledger = set_up();
    let now = at("2026-10-09T22:30-07:00");
    assert!(ledger.set_verdict(date(2026, 10, 9), Some(Verdict::Mostly), now));
    assert!(ledger.set_verdict(date(2026, 10, 3), Some(Verdict::No), now));
    assert!(!ledger.set_verdict(date(2026, 10, 2), Some(Verdict::No), now));
    assert!(!ledger.set_verdict(date(2026, 10, 10), Some(Verdict::Yes), now));
    let history = ledger.history(7, now);
    assert_eq!(history.last().unwrap().verdict, Some(Verdict::Mostly));
    assert_eq!(history[0].verdict, Some(Verdict::No));
    assert!(ledger.set_verdict(date(2026, 10, 9), None, now));
    assert_eq!(ledger.history(1, now)[0].verdict, None);
}

#[test]
fn a_reason_changed_within_a_minute_replaces_the_first() {
    let mut ledger = set_up();
    assert!(ledger.add_reason("bored", at("2026-10-02T14:10:00-07:00")));
    assert!(ledger.add_reason("tired", at("2026-10-02T14:10:30-07:00")));
    assert!(ledger.add_reason("anxious", at("2026-10-02T16:00-07:00")));
    assert!(!ledger.add_reason(" ", at("2026-10-02T16:30-07:00")));
    let day = ledger.history(1, at("2026-10-02T20:00-07:00")).pop().unwrap();
    assert_eq!(day.reasons, [(14, "tired".to_string()), (16, "anxious".to_string())]);
}

#[test]
fn the_first_guess_stands() {
    let mut ledger = set_up();
    assert!(ledger.guess("week 2026-10-05", 4));
    assert!(!ledger.guess("week 2026-10-05", 6));
    assert_eq!(ledger.guesses()["week 2026-10-05"], 4);
}

#[test]
fn a_silence_is_spread_over_its_hours() {
    let mut ledger = set_up();
    ledger.check_in("phone", at("2026-10-02T13:40-07:00"));
    ledger.check_in("phone", at("2026-10-02T15:20-07:00"));
    let day = ledger.history(1, at("2026-10-02T20:00-07:00")).pop().unwrap();
    let hours = &day.silent["phone"];
    assert_eq!((hours[13], hours[14], hours[15]), (20, 60, 20));
    assert!(!day.reported);
}

#[test]
fn a_silence_over_the_morning_splits_between_days() {
    let mut ledger = set_up();
    ledger.check_in("phone", at("2026-10-02T05:30-07:00"));
    ledger.check_in("phone", at("2026-10-02T06:30-07:00"));
    let days = ledger.history(2, at("2026-10-02T20:00-07:00"));
    assert_eq!(days[0].silent["phone"][5], 30);
    assert_eq!(days[1].silent["phone"][6], 30);
}

#[test]
fn the_csv_has_a_row_per_day_with_the_unmeasured_left_blank() {
    let mut ledger = set_up();
    let now = at("2026-10-03T12:00-07:00");
    ledger.add_marker("New term, week 1", Some(at("2026-10-02T09:00-07:00")), now);
    ledger.set_verdict(date(2026, 10, 2), Some(Verdict::Yes), now);
    let csv = ledger.days_csv(now);
    let lines: Vec<_> = csv.lines().collect();
    assert!(lines[0].starts_with("day,goal,earned,goal_met,"));
    assert_eq!(lines.len(), 5, "header, then 2026-09-30 to 2026-10-03: {csv}");
    let oct2 = lines.iter().find(|l| l.starts_with("2026-10-02")).unwrap();
    assert!(oct2.contains(",yes,"), "{oct2}");
    assert!(oct2.contains("\"09:00 New term, week 1\""), "{oct2}");
    assert!(oct2.contains(",0,0,,false,"), "unmeasured minutes are blank: {oct2}");
}
