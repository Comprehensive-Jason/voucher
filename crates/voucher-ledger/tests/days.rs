use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{Change, Completion, Entry, Ledger, Settings};

fn settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").unwrap(),
        bank_limit: 24,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: 3,
    }
}

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

fn fresh() -> Ledger {
    Ledger::new(settings(), SigningKey::from_bytes(&[7; 32]), at("2026-10-01T00:00-07:00"))
}

fn done(task: &str, moment: &str) -> Completion {
    Completion {
        task: task.into(),
        at: at(moment),
    }
}

/// Earns `n` distinct tasks at `moment`, as one poll would report them.
fn earn(ledger: &mut Ledger, prefix: &str, n: u32, moment: &str) {
    let batch: Vec<Completion> = (0..n).map(|i| done(&format!("todoist:{prefix}{i}"), moment)).collect();
    ledger.record(&batch, at(moment));
}

#[test]
fn a_day_runs_from_curfews_end_not_midnight() {
    let mut ledger = fresh();

    earn(&mut ledger, "late", 1, "2026-10-07T05:59-07:00");
    earn(&mut ledger, "early", 2, "2026-10-07T06:00-07:00");

    let today = ledger.today(at("2026-10-07T09:00-07:00"));
    assert_eq!(today.day.to_string(), "2026-10-07");
    assert_eq!(today.earned, 2);
    assert_eq!(ledger.today(at("2026-10-07T05:59-07:00")).earned, 1);
}

#[test]
fn work_counts_toward_the_goal_even_when_the_bank_is_full() {
    let mut ledger = Ledger::new(Settings { bank_limit: 1, ..settings() }, SigningKey::from_bytes(&[7; 32]), at("2026-10-01T00:00-07:00"));

    earn(&mut ledger, "t", 3, "2026-10-07T10:00-07:00");

    assert_eq!(ledger.bank(), 1);
    let today = ledger.today(at("2026-10-07T11:00-07:00"));
    assert_eq!(today.earned, 3);
    assert!(today.goal_met);
}

#[test]
fn the_streak_counts_goal_days_and_today_joins_once_its_goal_is_met() {
    let mut ledger = fresh();
    earn(&mut ledger, "a", 3, "2026-10-05T10:00-07:00");
    earn(&mut ledger, "b", 3, "2026-10-06T10:00-07:00");
    earn(&mut ledger, "c", 2, "2026-10-07T10:00-07:00");

    assert_eq!(ledger.today(at("2026-10-07T11:00-07:00")).streak, 2);

    earn(&mut ledger, "d", 1, "2026-10-07T12:00-07:00");
    assert_eq!(ledger.today(at("2026-10-07T12:30-07:00")).streak, 3);
}

#[test]
fn a_missed_day_ends_the_streak() {
    let mut ledger = fresh();
    earn(&mut ledger, "a", 3, "2026-10-04T10:00-07:00");
    earn(&mut ledger, "b", 1, "2026-10-05T10:00-07:00");
    earn(&mut ledger, "c", 3, "2026-10-06T10:00-07:00");

    assert_eq!(ledger.today(at("2026-10-07T08:00-07:00")).streak, 1);
}

#[test]
fn a_daily_goal_change_applies_from_the_next_day() {
    let mut ledger = fresh();
    earn(&mut ledger, "a", 3, "2026-10-07T10:00-07:00");

    ledger.request(Change::DailyGoal(5), at("2026-10-07T12:00-07:00"));

    let today = ledger.today(at("2026-10-07T13:00-07:00"));
    assert_eq!((today.goal, today.goal_met), (3, true));
    assert_eq!(ledger.today(at("2026-10-08T07:00-07:00")).goal, 5);
}

#[test]
fn todays_log_lists_earnings_and_redemptions_newest_first() {
    let mut ledger = fresh();
    ledger.record(&[done("todoist:a", "2026-10-07T08:10-07:00")], at("2026-10-07T08:15-07:00"));
    ledger.record(&[done("clickup:b", "2026-10-07T09:00-07:00")], at("2026-10-07T09:05-07:00"));
    ledger.redeem(at("2026-10-07T12:00-07:00")).unwrap();

    let log = ledger.today(at("2026-10-07T13:00-07:00")).log;

    assert_eq!(
        log,
        vec![
            Entry::Redeemed { at: at("2026-10-07T12:00-07:00"), tickets: 1 },
            Entry::Earned { at: at("2026-10-07T09:00-07:00"), task: "clickup:b".into(), kept: true },
            Entry::Earned { at: at("2026-10-07T08:10-07:00"), task: "todoist:a".into(), kept: true },
        ]
    );
}

