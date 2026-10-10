use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use std::collections::BTreeMap;

use voucher_ledger::{
    Change, Completion, Effect, Ledger, Settings, Source, SourceKind, default_sources,
};

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
fn tasks_from_both_services_share_one_counter() {
    let mut ledger = fresh();
    change(&mut ledger, "tasks", true, 2, "2026-10-07T07:00-07:00");

    ledger.record(
        &[done("todoist:a", "2026-10-07T08:00-07:00")],
        at("2026-10-07T08:01-07:00"),
    );
    assert_eq!(ledger.bank(), 0);
    ledger.record(
        &[done("clickup:b", "2026-10-07T09:00-07:00")],
        at("2026-10-07T09:01-07:00"),
    );
    assert_eq!(ledger.bank(), 1);
}

#[test]
fn a_switched_off_source_earns_nothing_and_never_back_pays() {
    let mut ledger = fresh();
    assert_eq!(
        change(&mut ledger, "tasks", false, 1, "2026-10-07T07:00-07:00"),
        Effect::Now
    );

    ledger.record(
        &[done("clickup:a", "2026-10-07T08:00-07:00")],
        at("2026-10-07T08:01-07:00"),
    );
    let effect = change(&mut ledger, "tasks", true, 1, "2026-10-07T09:00-07:00");
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
            labels: BTreeMap::new(),
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
            labels: BTreeMap::new(),
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

fn group(name: &str, packages: &[&str]) -> Source {
    Source {
        name: name.into(),
        kind: SourceKind::Focus,
        on: true,
        every: 30,
        packages: packages.iter().map(|p| p.to_string()).collect(),
        labels: BTreeMap::new(),
        max_heart_rate: None,
        color: None,
    }
}

#[test]
fn a_new_group_waits_for_morning_then_its_apps_add_up_toward_one_voucher() {
    let mut ledger = fresh();
    let effect = ledger.request(
        Change::AddSource {
            id: "chinese".into(),
            source: group("Chinese", &["com.pleco.chinesesystem", "com.duolingo"]),
        },
        at("2026-10-07T10:00-07:00"),
    );
    assert!(matches!(effect, Effect::At(_)));

    // The phone sends the group's running total: 20 min of Pleco, then 10 of Duolingo.
    let day = "2026-10-08".parse().unwrap();
    ledger.report("chinese", day, 20, None, at("2026-10-08T09:00-07:00"));
    assert_eq!(ledger.bank(), 0);
    ledger.report("chinese", day, 30, None, at("2026-10-08T09:10-07:00"));
    assert_eq!(ledger.bank(), 1);
    assert_eq!(
        ledger.settings(at("2026-10-08T09:10-07:00")).sources["chinese"].name,
        "Chinese"
    );
}

#[test]
fn an_app_already_in_one_group_is_left_out_of_another() {
    let mut ledger = fresh();
    ledger.request(
        Change::AddSource {
            id: "notes".into(),
            source: group("Notes", &["md.obsidian", "com.samsung.android.app.notes"]),
        },
        at("2026-10-07T10:00-07:00"),
    );
    let settings = ledger.settings(at("2026-10-08T06:00-07:00"));
    assert_eq!(
        settings.sources["notes"].packages,
        ["com.samsung.android.app.notes"]
    );
    assert_eq!(settings.sources["obsidian"].packages[0], "md.obsidian");
}

#[test]
fn a_site_member_round_trips_and_only_one_group_can_count_it() {
    let mut ledger = fresh();
    let mut reading = group(
        "Reading online",
        &["site:readwise.io", "com.readermobile.web"],
    );
    reading
        .labels
        .insert("site:readwise.io".into(), "readwise.io".into());
    ledger.request(
        Change::AddSource {
            id: "online".into(),
            source: reading,
        },
        at("2026-10-07T10:00-07:00"),
    );
    // Another group asking for the same site later doesn't get it.
    ledger.request(
        Change::SourceApps {
            id: "obsidian".into(),
            packages: vec!["md.obsidian".into(), "site:readwise.io".into()],
            labels: BTreeMap::new(),
        },
        at("2026-10-08T07:00-07:00"),
    );

    let saved = ledger.save();
    let mut ledger = Ledger::load(&saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    let settings = ledger.settings(at("2026-10-09T06:00-07:00"));
    let online = &settings.sources["online"];
    assert_eq!(
        online.packages,
        ["site:readwise.io", "com.readermobile.web"]
    );
    assert_eq!(online.labels["site:readwise.io"], "readwise.io");
    assert_eq!(settings.sources["obsidian"].packages, ["md.obsidian"]);
}

#[test]
fn renaming_or_deleting_a_group_applies_now() {
    let mut ledger = fresh();
    let now = at("2026-10-07T10:00-07:00");
    let renamed = ledger.request(
        Change::RenameSource {
            id: "reading".into(),
            name: "Books".into(),
        },
        now,
    );
    let deleted = ledger.request(Change::DeleteSource("anki".into()), now);

    assert_eq!((renamed, deleted), (Effect::Now, Effect::Now));
    let settings = ledger.settings(now);
    assert_eq!(settings.sources["reading"].name, "Books");
    assert!(!settings.sources.contains_key("anki"));
}

#[test]
fn a_service_taken_out_of_the_tasks_group_stops_earning() {
    let mut ledger = fresh();
    ledger.request(
        Change::SourceApps {
            id: "tasks".into(),
            packages: vec!["todoist".into()],
            labels: BTreeMap::new(),
        },
        at("2026-10-07T07:00-07:00"),
    );
    ledger.record(
        &[
            done("todoist:a", "2026-10-07T08:00-07:00"),
            done("clickup:b", "2026-10-07T08:00-07:00"),
        ],
        at("2026-10-07T08:01-07:00"),
    );
    assert_eq!(ledger.bank(), 1);
    assert_eq!(
        ledger.settings(at("2026-10-07T08:01-07:00")).sources["tasks"].labels["todoist"],
        "Todoist"
    );
}

#[test]
fn sources_saved_before_groups_load_as_groups() {
    let ledger = fresh();
    let mut saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    saved["settings"]["sources"] = serde_json::json!({
        "todoist": { "kind": "tasks", "on": true, "every": 1, "color": "#123456" },
        "clickup": { "kind": "tasks", "on": false, "every": 1 },
        "moonreader": { "kind": "focus", "on": true, "every": 30, "packages": ["com.flyersoft.moonreaderp"] },
        "app.pleco": { "kind": "focus", "on": true, "every": 30, "packages": ["com.pleco.chinesesystem"] }
    });
    saved["pending"] = serde_json::json!([[{ "Source": { "id": "clickup", "on": true, "every": 1 } }, "2026-10-08T13:00:00Z"]]);

    let mut ledger = Ledger::load(&saved.to_string(), SigningKey::from_bytes(&[7; 32])).unwrap();
    let settings = ledger.settings(at("2026-10-07T10:00-07:00")).clone();

    let tasks = &settings.sources["tasks"];
    assert_eq!((tasks.name.as_str(), tasks.on), ("Tasks", true));
    // Only the service that was earning joins; the waiting switch-on carries over.
    assert_eq!(tasks.packages, ["todoist"]);
    assert_eq!(tasks.color.as_deref(), Some("#123456"));
    assert!(!settings.sources.contains_key("todoist"));
    assert_eq!(settings.sources["moonreader"].name, "Moon+ Reader");
    assert_eq!(
        settings.sources["moonreader"].labels["com.flyersoft.moonreaderp"],
        "Moon+ Reader Pro"
    );
    assert_eq!(settings.sources["app.pleco"].name, "pleco");
    assert!(matches!(
        &ledger.pending(at("2026-10-07T10:00-07:00"))[0].0,
        Change::Source { id, .. } if id == "tasks"
    ));
}
