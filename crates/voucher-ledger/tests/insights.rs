use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::date, civil::time, tz::TimeZone};
use voucher_ledger::{
    BlockedSite, Change, Effect, ExperimentRefusal, ExperimentStatus, Ledger, Settings,
};

fn settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").unwrap(),
        bank_limit: 12,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: 16,
        sources: voucher_ledger::default_sources(),
        blocklists: voucher_ledger::default_blocklists(),
        released_devices: Default::default(),
    }
}

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

fn key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

fn set_up() -> Ledger {
    let mut ledger = Ledger::new(settings(), key(), at("2026-10-01T00:00-07:00"));
    ledger.setup(vec![], true, at("2026-10-01T09:00-07:00"));
    ledger.end_grace();
    ledger
}

fn curfew(h: i8, m: i8) -> Change {
    Change::Curfew {
        start: time(h, m, 0, 0),
        end: time(6, 0, 0, 0),
    }
}

#[test]
fn a_tightening_experiment_starts_at_once_with_one_marker_in_its_words() {
    let mut ledger = set_up();
    let now = at("2026-10-12T15:00-07:00");

    let e = ledger
        .start_experiment(curfew(21, 30), "Curfew at 21:30", "late", "shift:late", now)
        .unwrap();

    assert_eq!(ledger.settings(now).curfew_start, time(21, 30, 0, 0));
    assert_eq!(e.status, ExperimentStatus::Running);
    assert_eq!(e.starts_at, now);
    assert_eq!(e.start_day, date(2026, 10, 12));
    // Three Days settle, fourteen are measured, and the verdict is due the Day after.
    assert_eq!(e.verdict_day, date(2026, 10, 29));
    assert_eq!(e.undo, curfew(22, 0));
    let markers = ledger.markers();
    assert_eq!(markers.len(), 1);
    assert_eq!(markers[0].text, "Trying Curfew at 21:30");
    assert!(markers[0].rule);
    assert_eq!(e.marker_at, Some(markers[0].at));
}

#[test]
fn an_experiment_minutes_after_another_change_shares_its_marker() {
    let mut ledger = set_up();
    ledger.request(Change::UnlockMinutes(5), at("2026-10-12T15:00-07:00"));

    let e = ledger
        .start_experiment(
            curfew(21, 30),
            "Curfew at 21:30",
            "late",
            "",
            at("2026-10-12T15:04-07:00"),
        )
        .unwrap();

    let markers = ledger.markers();
    assert_eq!(markers.len(), 1);
    assert_eq!(
        markers[0].text,
        "Unlocks last 5 min; Trying Curfew at 21:30"
    );
    assert_eq!(e.marker_at, Some(at("2026-10-12T15:00-07:00")));
}

#[test]
fn a_daily_goal_experiment_waits_for_the_next_day_and_marks_it_then() {
    let mut ledger = set_up();
    let now = at("2026-10-12T15:00-07:00");

    let e = ledger
        .start_experiment(
            Change::DailyGoal(14),
            "a Daily goal of 14",
            "went_well",
            "",
            now,
        )
        .unwrap();

    assert_eq!(e.starts_at, at("2026-10-13T06:00-07:00"));
    assert_eq!(e.start_day, date(2026, 10, 13));
    assert_eq!(e.verdict_day, date(2026, 10, 30));
    assert_eq!(e.marker_at, None);
    assert!(ledger.markers().is_empty());

    // The morning: the goal changes and the Experiment's Marker goes on.
    let morning = at("2026-10-13T06:01-07:00");
    assert_eq!(ledger.settings(morning).daily_goal, 14);
    let markers = ledger.markers().to_vec();
    assert_eq!(markers.len(), 1);
    assert_eq!(markers[0].text, "Trying a Daily goal of 14");
    assert_eq!(markers[0].at, at("2026-10-13T06:00-07:00"));
    assert_eq!(ledger.experiments()[0].marker_at, Some(markers[0].at));
}

#[test]
fn one_experiment_at_a_time_and_only_rules_it_can_undo() {
    let mut ledger = set_up();
    let now = at("2026-10-12T15:00-07:00");
    assert_eq!(
        ledger.start_experiment(
            Change::SourceColor {
                id: "steps".into(),
                color: None
            },
            "a new colour",
            "earned",
            "",
            now
        ),
        Err(ExperimentRefusal::NotTriable)
    );
    // Trying what's already the rule isn't an experiment either.
    assert_eq!(
        ledger.start_experiment(
            Change::UnlockMinutes(10),
            "Unlocks of 10 min",
            "unlocks",
            "",
            now
        ),
        Err(ExperimentRefusal::NotTriable)
    );
    assert_eq!(
        ledger.start_experiment(Change::UnlockMinutes(5), " ", "unlocks", "", now),
        Err(ExperimentRefusal::BadText)
    );
    ledger
        .start_experiment(
            Change::UnlockMinutes(5),
            "Unlocks of 5 min",
            "unlocks",
            "",
            now,
        )
        .unwrap();
    assert_eq!(
        ledger.start_experiment(curfew(21, 30), "Curfew at 21:30", "late", "", now),
        Err(ExperimentRefusal::AlreadyRunning)
    );
}

#[test]
fn the_verdict_is_taken_only_once_its_day_has_come() {
    let mut ledger = set_up();
    let e = ledger
        .start_experiment(
            curfew(21, 30),
            "Curfew at 21:30",
            "late",
            "",
            at("2026-10-12T15:00-07:00"),
        )
        .unwrap();

    // 05:00 on the verdict Day's date still belongs to the Day before.
    assert_eq!(
        ledger
            .judge_experiment(
                e.id,
                "Curfew at 21:30 helped",
                "",
                "helped",
                "Go back to 22:00",
                at("2026-10-29T05:00-07:00")
            )
            .map(|e| e.status),
        Err(ExperimentRefusal::NotNow)
    );
    let judged = ledger
        .judge_experiment(
            e.id,
            "Curfew at 21:30 helped",
            "Late Distraction fell.",
            "helped",
            "Go back to 22:00",
            at("2026-10-29T06:30-07:00"),
        )
        .unwrap();
    assert_eq!(judged.status, ExperimentStatus::Ready);
    assert_eq!(judged.verdict.as_ref().unwrap().back, "Go back to 22:00");
    assert_eq!(ledger.open_experiments().len(), 1);
    // Judged once.
    assert_eq!(
        ledger
            .judge_experiment(
                e.id,
                "again",
                "",
                "helped",
                "",
                at("2026-10-29T07:00-07:00")
            )
            .map(|e| e.status),
        Err(ExperimentRefusal::NotNow)
    );
}

#[test]
fn going_back_after_the_verdict_waits_for_the_morning_and_keeping_changes_nothing() {
    let mut ledger = set_up();
    let e = ledger
        .start_experiment(
            curfew(21, 30),
            "Curfew at 21:30",
            "late",
            "",
            at("2026-10-12T15:00-07:00"),
        )
        .unwrap();
    ledger
        .judge_experiment(
            e.id,
            "Curfew at 21:30 helped",
            "",
            "helped",
            "Go back to 22:00",
            at("2026-10-29T08:00-07:00"),
        )
        .unwrap();
    // Keep it before the verdict isn't a thing: only a judged one can be kept.
    let now = at("2026-10-29T09:00-07:00");

    let (ended, effect) = ledger.end_experiment(e.id, false, now).unwrap();

    assert_eq!(ended.status, ExperimentStatus::Reverted);
    assert_eq!(effect, Effect::At(at("2026-10-30T06:00-07:00")));
    assert_eq!(ledger.settings(now).curfew_start, time(21, 30, 0, 0));
    assert_eq!(
        ledger.settings(at("2026-10-30T06:01-07:00")).curfew_start,
        time(22, 0, 0, 0)
    );
    assert!(ledger.open_experiments().is_empty());

    // Another, kept.
    let e = ledger
        .start_experiment(
            Change::UnlockMinutes(5),
            "Unlocks of 5 min",
            "unlocks",
            "",
            at("2026-11-01T10:00-07:00"),
        )
        .unwrap();
    assert_eq!(
        ledger
            .end_experiment(e.id, true, at("2026-11-02T10:00-07:00"))
            .map(|(e, _)| e.status),
        Err(ExperimentRefusal::NotNow)
    );
    ledger
        .judge_experiment(
            e.id,
            "Unlocks of 5 min: too close to call",
            "",
            "unclear",
            "Go back to 10 min",
            at("2026-11-18T10:00-08:00"),
        )
        .unwrap();
    let (kept, effect) = ledger
        .end_experiment(e.id, true, at("2026-11-18T11:00-08:00"))
        .unwrap();
    assert_eq!(kept.status, ExperimentStatus::Kept);
    assert_eq!(effect, Effect::Now);
    assert_eq!(
        ledger.settings(at("2026-11-20T11:00-08:00")).unlock_minutes,
        5
    );
}

#[test]
fn ending_early_undoes_the_change_as_a_loosening() {
    let mut ledger = set_up();
    let site = BlockedSite {
        site: "news.example.com".into(),
        note: None,
        on: true,
        added: true,
    };
    let add = Change::BlockSite {
        list: "reddit".into(),
        site,
    };
    let e = ledger
        .start_experiment(
            add,
            "news.example.com on Reddit",
            "other",
            "",
            at("2026-10-12T15:00-07:00"),
        )
        .unwrap();
    assert_eq!(
        e.undo,
        Change::RemoveSite {
            list: "reddit".into(),
            site: "news.example.com".into()
        }
    );
    let now = at("2026-10-15T20:00-07:00");
    assert!(
        ledger
            .blocked(now)
            .sites
            .contains(&"news.example.com".to_string())
    );

    let (ended, effect) = ledger.end_experiment(e.id, false, now).unwrap();

    assert_eq!(ended.status, ExperimentStatus::Ended);
    assert_eq!(effect, Effect::At(at("2026-10-16T06:00-07:00")));
    assert!(
        ledger
            .blocked(now)
            .sites
            .contains(&"news.example.com".to_string())
    );
    assert!(
        !ledger
            .blocked(at("2026-10-16T06:01-07:00"))
            .sites
            .contains(&"news.example.com".to_string())
    );
}

#[test]
fn ending_one_still_waiting_to_start_withdraws_it() {
    let mut ledger = set_up();
    let e = ledger
        .start_experiment(
            Change::DailyGoal(18),
            "a Daily goal of 18",
            "went_well",
            "",
            at("2026-10-12T15:00-07:00"),
        )
        .unwrap();

    let (_, effect) = ledger
        .end_experiment(e.id, false, at("2026-10-12T16:00-07:00"))
        .unwrap();

    assert_eq!(effect, Effect::Now);
    assert!(ledger.pending(at("2026-10-12T16:00-07:00")).is_empty());
    assert_eq!(ledger.settings(at("2026-10-13T07:00-07:00")).daily_goal, 16);
    assert!(ledger.markers().is_empty());
}

#[test]
fn dismissals_are_kept_replaced_and_removed() {
    let mut ledger = set_up();
    let now = at("2026-10-12T15:00-07:00");
    assert!(ledger.dismiss("shift:distraction", "shift", 0.4, now));
    assert!(ledger.dismiss("shift:distraction", "shift", 0.6, now));
    assert!(!ledger.dismiss("", "shift", 0.4, now));
    assert!(!ledger.dismiss("record:most", "record", f64::NAN, now));
    assert_eq!(ledger.dismissed().len(), 1);
    assert_eq!(ledger.dismissed()["shift:distraction"].value, 0.6);
    assert!(ledger.undismiss("shift:distraction"));
    assert!(!ledger.undismiss("shift:distraction"));
    assert!(ledger.dismissed().is_empty());
}

#[test]
fn an_older_state_loads_with_no_dismissals_or_experiments_and_keeps_new_ones() {
    let saved = include_str!("fixtures/state-before-planned.json");
    assert!(!saved.contains("experiments") && !saved.contains("dismissed"));
    let mut ledger = Ledger::load(saved, key()).unwrap();
    assert!(ledger.dismissed().is_empty());
    assert!(ledger.experiments().is_empty());

    let now = at("2026-10-12T15:00-07:00");
    ledger.end_grace();
    ledger.dismiss("lapse:goal", "lapse", 3.0, now);
    ledger
        .start_experiment(
            Change::UnlockMinutes(5),
            "Unlocks of 5 min",
            "unlocks",
            "shift:per_unlock",
            now,
        )
        .unwrap();
    let again = Ledger::load(&ledger.save(), key()).unwrap();
    assert_eq!(again.dismissed()["lapse:goal"].kind, "lapse");
    assert_eq!(again.experiments().len(), 1);
    assert_eq!(again.experiments()[0].finding, "shift:per_unlock");
    assert_eq!(again.experiments()[0].undo, Change::UnlockMinutes(10));
}
