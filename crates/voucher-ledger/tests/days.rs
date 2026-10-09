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

fn done(task: &str, moment: &str) -> Completion {
    Completion {
        task: task.into(),
        title: format!("Title of {task}"),
        at: at(moment),
    }
}

/// Earns `n` distinct tasks at `moment`, as one poll would report them.
fn earn(ledger: &mut Ledger, prefix: &str, n: u32, moment: &str) {
    let batch: Vec<Completion> = (0..n)
        .map(|i| done(&format!("todoist:{prefix}{i}"), moment))
        .collect();
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
    let mut ledger = Ledger::new(
        Settings {
            bank_limit: 1,
            ..settings()
        },
        SigningKey::from_bytes(&[7; 32]),
        at("2026-10-01T00:00-07:00"),
    );

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
    ledger.record(
        &[done("todoist:a", "2026-10-07T08:10-07:00")],
        at("2026-10-07T08:15-07:00"),
    );
    ledger.record(
        &[done("clickup:b", "2026-10-07T09:00-07:00")],
        at("2026-10-07T09:05-07:00"),
    );
    ledger.redeem(at("2026-10-07T12:00-07:00")).unwrap();

    let log = ledger.today(at("2026-10-07T13:00-07:00")).log;

    assert_eq!(
        log,
        vec![
            Entry::Redeemed {
                at: at("2026-10-07T12:00-07:00"),
                vouchers: 1,
                minutes: 10
            },
            Entry::Earned {
                at: at("2026-10-07T09:00-07:00"),
                task: "clickup:b".into(),
                title: "Title of clickup:b".into(),
                kept: true
            },
            Entry::Earned {
                at: at("2026-10-07T08:10-07:00"),
                task: "todoist:a".into(),
                title: "Title of todoist:a".into(),
                kept: true
            },
        ]
    );
}

#[test]
fn a_past_day_keeps_its_totals_and_when_its_goal_was_met() {
    let mut ledger = fresh();
    earn(&mut ledger, "a", 2, "2026-10-06T09:00-07:00");
    earn(&mut ledger, "b", 1, "2026-10-06T11:30-07:00");
    earn(&mut ledger, "c", 1, "2026-10-06T14:00-07:00");
    ledger.redeem_many(2, at("2026-10-06T15:00-07:00")).unwrap();
    // Clipped by Curfew: one Voucher, but only 5 minutes.
    ledger.redeem(at("2026-10-06T21:55-07:00")).unwrap();

    let day = ledger.day("2026-10-06".parse().unwrap(), at("2026-10-07T09:00-07:00"));

    assert_eq!((day.earned, day.redeemed, day.unlocked_minutes), (4, 3, 25));
    assert_eq!(day.goal_met_at, Some(at("2026-10-06T11:30-07:00")));
    assert_eq!(day.streak, 1);
    assert_eq!(day.log.len(), 6);
}

#[test]
fn history_lists_each_day_oldest_first_including_empty_ones() {
    let mut ledger = fresh();
    earn(&mut ledger, "a", 3, "2026-10-05T10:00-07:00");
    earn(&mut ledger, "b", 1, "2026-10-07T10:00-07:00");

    let history = ledger.history(4, at("2026-10-07T12:00-07:00"));

    let summary: Vec<(String, u32, bool)> = history
        .iter()
        .map(|d| (d.day.to_string(), d.earned, d.goal_met))
        .collect();
    assert_eq!(
        summary,
        vec![
            ("2026-10-04".into(), 0, false),
            ("2026-10-05".into(), 3, true),
            ("2026-10-06".into(), 0, false),
            ("2026-10-07".into(), 1, false),
        ]
    );
    // Each Day also says where its Vouchers came from: Todoist counts toward Tasks.
    assert_eq!(history[1].by_source.get("tasks"), Some(&3));
    assert!(history[2].by_source.is_empty());
}

#[test]
fn an_enforcer_that_stops_checking_in_leaves_a_gap_in_the_log() {
    let mut ledger = fresh();
    ledger.check_in("laptop", at("2026-10-07T09:00-07:00"));
    ledger.check_in("laptop", at("2026-10-07T09:01-07:00"));
    ledger.check_in("laptop", at("2026-10-07T09:40-07:00"));

    let log = ledger.today(at("2026-10-07T10:00-07:00")).log;

    assert_eq!(
        log,
        vec![Entry::Gap {
            at: at("2026-10-07T09:01-07:00"),
            device: "laptop".into(),
            until: at("2026-10-07T09:40-07:00"),
        }]
    );
}

#[test]
fn a_short_pause_between_check_ins_is_not_a_gap() {
    let mut ledger = fresh();
    ledger.check_in("laptop", at("2026-10-07T09:00-07:00"));
    ledger.check_in("laptop", at("2026-10-07T09:08-07:00"));

    assert!(ledger.today(at("2026-10-07T10:00-07:00")).log.is_empty());
}

#[test]
fn torn_vouchers_keep_their_stored_name() {
    // Saved states and older apps read `tickets`; renaming it would lose them.
    let entry = Entry::Redeemed {
        at: at("2026-10-07T12:00-07:00"),
        vouchers: 2,
        minutes: 20,
    };
    let json = serde_json::to_value(&entry).unwrap();
    assert_eq!(json["tickets"], 2);
    let back: Entry = serde_json::from_value(json).unwrap();
    assert_eq!(back, entry);
}

#[test]
fn history_starts_at_the_first_day_and_the_log_keeps_half_a_year() {
    let mut ledger = fresh(); // started 2026-10-01 at 00:00, the Day of 2026-09-30
    assert_eq!(
        ledger.first_day(at("2026-10-07T09:00-07:00")).to_string(),
        "2026-09-30"
    );
    assert_eq!(
        ledger
            .log_first_day(at("2026-10-07T09:00-07:00"))
            .to_string(),
        "2026-09-30"
    );
    assert_eq!(
        ledger
            .log_first_day(at("2027-06-15T09:00-07:00"))
            .to_string(),
        "2026-12-14"
    );
}
