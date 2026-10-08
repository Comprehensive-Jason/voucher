use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{Change, Completion, Effect, Ledger, Settings, default_sources};

fn settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").unwrap(),
        bank_limit: 24,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: 16,
        sources: default_sources(),
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
        title: task.into(),
        at: at(moment),
    }
}

fn change(ledger: &mut Ledger, source: &str, on: bool, every: u32, moment: &str) -> Effect {
    ledger.request(
        Change::Source {
            id: source.into(),
            on,
            every,
        },
        at(moment),
    )
}

#[test]
fn a_task_source_set_to_one_voucher_per_two_tasks_pays_on_every_second_task() {
    let mut ledger = fresh();
    change(&mut ledger, "todoist", true, 2, "2026-10-07T07:00-07:00");

    ledger.record(
        &[done("todoist:a", "2026-10-07T08:00-07:00")],
        at("2026-10-07T08:01-07:00"),
    );
    assert_eq!(ledger.bank(), 0);
    ledger.record(
        &[done("todoist:b", "2026-10-07T09:00-07:00")],
        at("2026-10-07T09:01-07:00"),
    );
    assert_eq!(ledger.bank(), 1);
}

#[test]
fn a_switched_off_source_earns_nothing_and_never_back_pays() {
    let mut ledger = fresh();
    assert_eq!(
        change(&mut ledger, "clickup", false, 1, "2026-10-07T07:00-07:00"),
        Effect::Now
    );

    ledger.record(
        &[done("clickup:a", "2026-10-07T08:00-07:00")],
        at("2026-10-07T08:01-07:00"),
    );
    let effect = change(&mut ledger, "clickup", true, 1, "2026-10-07T09:00-07:00");
    ledger.record(
        &[done("clickup:a", "2026-10-07T08:00-07:00")],
        at("2026-10-08T06:30-07:00"),
    );

    assert!(matches!(effect, Effect::At(_)));
    assert_eq!(ledger.bank(), 0);
}

#[test]
fn a_faster_rate_waits_for_morning_and_a_slower_one_applies_now() {
    let mut ledger = fresh();

    assert_eq!(
        change(&mut ledger, "obsidian", true, 45, "2026-10-07T10:00-07:00"),
        Effect::Now
    );
    assert!(matches!(
        change(&mut ledger, "obsidian", true, 20, "2026-10-07T10:05-07:00"),
        Effect::At(_)
    ));
    assert_eq!(
        ledger.settings(at("2026-10-07T11:00-07:00")).sources["obsidian"].every,
        45
    );
    assert_eq!(
        ledger.settings(at("2026-10-08T06:00-07:00")).sources["obsidian"].every,
        20
    );
}

#[test]
fn focused_minutes_earn_one_voucher_per_thirty_and_resending_a_total_pays_nothing() {
    let mut ledger = fresh();
    let day = "2026-10-07".parse().unwrap();

    ledger.report("obsidian", day, 25, None, at("2026-10-07T10:00-07:00"));
    assert_eq!(ledger.bank(), 0);
    ledger.report("obsidian", day, 64, None, at("2026-10-07T11:00-07:00"));
    ledger.report("obsidian", day, 64, None, at("2026-10-07T11:05-07:00"));
    assert_eq!(ledger.bank(), 2);

    let today = ledger.today(at("2026-10-07T11:10-07:00"));
    let obsidian = today.sources.iter().find(|s| s.id == "obsidian").unwrap();
    assert_eq!(
        (obsidian.earned, obsidian.progress, obsidian.every),
        (2, 4, 30)
    );
}

#[test]
fn a_report_for_a_day_already_over_is_ignored() {
    let mut ledger = fresh();

    ledger.report(
        "anki",
        "2026-10-05".parse().unwrap(),
        90,
        None,
        at("2026-10-07T10:00-07:00"),
    );

    assert_eq!(ledger.bank(), 0);
}

#[test]
fn a_workout_report_carries_its_session_name_into_the_log() {
    let mut ledger = fresh();
    let day = "2026-10-07".parse().unwrap();

    ledger.report(
        "workout",
        day,
        16,
        Some("Fitbod upper body"),
        at("2026-10-07T15:00-07:00"),
    );

    let today = ledger.today(at("2026-10-07T15:10-07:00"));
    assert_eq!(ledger.bank(), 1);
    assert!(
        matches!(&today.log[0], voucher_ledger::Entry::Earned { title, .. } if title == "Fitbod upper body")
    );
}

#[test]
fn each_device_reports_its_own_running_total_and_they_add_up() {
    let mut ledger = fresh();
    let day = "2026-10-07".parse().unwrap();

    ledger.report_from(
        "phone",
        "obsidian",
        day,
        20,
        None,
        at("2026-10-07T10:00-07:00"),
    );
    ledger.report_from(
        "laptop",
        "obsidian",
        day,
        15,
        None,
        at("2026-10-07T10:05-07:00"),
    );
    ledger.report_from(
        "phone",
        "obsidian",
        day,
        25,
        None,
        at("2026-10-07T11:00-07:00"),
    );

    // 25 + 15 = 40 minutes: one Voucher at 30, 10 toward the next.
    let today = ledger.today(at("2026-10-07T11:05-07:00"));
    let obsidian = today.sources.iter().find(|s| s.id == "obsidian").unwrap();
    assert_eq!((obsidian.earned, obsidian.progress), (1, 10));
}

#[test]
fn adding_an_app_to_a_source_waits_for_morning_and_removing_one_applies_now() {
    let mut ledger = fresh();
    let more = vec![
        "md.obsidian".to_string(),
        "win:Obsidian.exe".to_string(),
        "win:ObsidianPortable.exe".to_string(),
    ];

    let effect = ledger.request(
        Change::SourceApps {
            id: "obsidian".into(),
            packages: more.clone(),
        },
        at("2026-10-07T10:00-07:00"),
    );
    assert!(matches!(effect, Effect::At(_)));
    assert_eq!(
        ledger.settings(at("2026-10-08T06:00-07:00")).sources["obsidian"].packages,
        more
    );

    let fewer = vec!["win:Obsidian.exe".to_string()];
    let effect = ledger.request(
        Change::SourceApps {
            id: "obsidian".into(),
            packages: fewer.clone(),
        },
        at("2026-10-08T07:00-07:00"),
    );
    assert_eq!(effect, Effect::Now);
    assert_eq!(
        ledger.settings(at("2026-10-08T07:00-07:00")).sources["obsidian"].packages,
        fewer
    );
}

#[test]
fn steps_earn_by_the_step_once_switched_on() {
    let mut ledger = fresh();
    let day = "2026-10-07".parse().unwrap();
    let noon = at("2026-10-07T12:00-07:00");
    // Off by default: steps reported then earn nothing.
    ledger.report_from("phone", "steps", day, 2500, None, noon);
    assert_eq!(ledger.bank(), 0);

    ledger.setup(
        vec![Change::Source {
            id: "steps".into(),
            on: true,
            every: 2000,
        }],
        false,
        noon,
    );
    ledger.report_from(
        "phone",
        "steps",
        day,
        4500,
        None,
        at("2026-10-07T13:00-07:00"),
    );

    // 4,500 steps reported after switching on: the 2,000 more since the
    // last report earn one Voucher.
    let today = ledger.today(at("2026-10-07T13:05-07:00"));
    let steps = today.sources.iter().find(|s| s.id == "steps").unwrap();
    assert_eq!(ledger.bank(), 1);
    assert_eq!(steps.earned, 1);
}
