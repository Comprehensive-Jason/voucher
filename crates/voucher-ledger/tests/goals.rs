use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{
    Change, Direction, Effect, ExternalRefusal, GoalRefusal, Ledger, NewExternalGoal, NewGoal,
    Owner, Period, Settings, goals::MAX_GOALS,
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

fn set_up() -> Ledger {
    let mut ledger = Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-10-01T00:00-07:00"),
    );
    ledger.setup(vec![], true, at("2026-10-01T09:00-07:00"));
    ledger.end_grace();
    ledger
}

fn goal(measure: &str, direction: Direction, target: f64, period: Period) -> NewGoal {
    NewGoal {
        id: None,
        measure: measure.into(),
        direction,
        target,
        period,
    }
}

const NOON: &str = "2026-10-14T12:00-07:00";

#[test]
fn the_daily_goal_is_listed_first_from_its_setting() {
    let mut ledger = set_up();

    let goals = ledger.goals(at(NOON));

    assert_eq!(goals.len(), 1);
    let daily = &goals[0];
    assert_eq!(daily.id, "daily");
    assert!(daily.daily);
    assert_eq!(daily.measure, "vouchers");
    assert_eq!(daily.direction, Direction::AtLeast);
    assert_eq!(daily.period, Period::Day);
    assert_eq!(daily.target, 16.0);
    assert_eq!(daily.pending, None);
}

#[test]
fn a_daily_goal_change_goes_through_change_and_waits_for_the_next_day() {
    let mut ledger = set_up();

    let effect = ledger.request(Change::DailyGoal(12), at(NOON));

    let next_day = at("2026-10-15T06:00-07:00");
    assert_eq!(effect, Effect::At(next_day));
    let goals = ledger.goals(at(NOON));
    // The setting is the one copy of the target: unchanged until 06:00.
    assert_eq!(goals[0].target, 16.0);
    let pending = goals[0].pending.as_ref().unwrap();
    assert_eq!((pending.target, pending.at), (12.0, next_day));
    // A rule Marker once it applies, like any rule change.
    let after = ledger.goals(at("2026-10-15T07:00-07:00"));
    assert_eq!(after[0].target, 12.0);
    assert_eq!(after[0].pending, None);
    assert!(ledger.markers().iter().any(|m| m.rule));
}

#[test]
fn the_daily_goal_cant_be_saved_or_removed_as_a_goal() {
    let mut ledger = set_up();
    let mut daily = goal("vouchers", Direction::AtLeast, 10.0, Period::Day);
    daily.id = Some("daily".into());

    assert_eq!(ledger.save_goal(daily, at(NOON)), Err(GoalRefusal::Daily));
    assert_eq!(ledger.remove_goal("daily"), Err(GoalRefusal::Daily));
}

#[test]
fn goals_are_added_edited_and_removed_at_once() {
    let mut ledger = set_up();

    let focus = ledger
        .save_goal(
            goal("focus", Direction::AtLeast, 90.0, Period::Day),
            at(NOON),
        )
        .unwrap();
    let sleep = ledger
        .save_goal(
            goal("asleep", Direction::AtLeast, 420.0, Period::Week),
            at(NOON),
        )
        .unwrap();
    assert_eq!((focus.id.as_str(), sleep.id.as_str()), ("g1", "g2"));

    let mut edit = goal("focus", Direction::AtLeast, 120.0, Period::Day);
    edit.id = Some("g1".into());
    let edited = ledger
        .save_goal(edit, at("2026-10-14T13:00-07:00"))
        .unwrap();
    assert_eq!(edited.target, 120.0);
    assert_eq!(edited.created_at, at(NOON));
    assert_eq!(edited.changed_at, at("2026-10-14T13:00-07:00"));

    ledger.remove_goal("g1").unwrap();
    let ids: Vec<String> = ledger.goals(at(NOON)).into_iter().map(|g| g.id).collect();
    assert_eq!(ids, ["daily", "g2"]);
    // Goals never change a rule, so they leave no Marker.
    assert!(ledger.markers().is_empty());
}

#[test]
fn an_id_is_never_given_out_twice() {
    let mut ledger = set_up();
    let first = ledger
        .save_goal(
            goal("focus", Direction::AtLeast, 90.0, Period::Day),
            at(NOON),
        )
        .unwrap();
    ledger.remove_goal(&first.id).unwrap();

    let next = ledger
        .save_goal(
            goal("focus", Direction::AtLeast, 90.0, Period::Day),
            at(NOON),
        )
        .unwrap();

    assert_eq!(next.id, "g2");
}

#[test]
fn bad_goals_are_refused() {
    let mut ledger = set_up();
    let now = at(NOON);
    let mut check = |g: NewGoal| ledger.save_goal(g, now).unwrap_err();

    assert_eq!(
        check(goal("mood", Direction::AtLeast, 3.0, Period::Day)),
        GoalRefusal::UnknownMeasure
    );
    assert_eq!(
        check(goal("source:nope", Direction::AtLeast, 3.0, Period::Day)),
        GoalRefusal::UnknownSource
    );
    assert_eq!(
        check(goal("focus", Direction::AtLeast, -1.0, Period::Day)),
        GoalRefusal::BadTarget
    );
    assert_eq!(
        check(goal("focus", Direction::AtLeast, f64::NAN, Period::Day)),
        GoalRefusal::BadTarget
    );
    assert_eq!(
        check(goal("bedtime", Direction::AtMost, 1440.0, Period::Day)),
        GoalRefusal::BadTarget
    );
    assert_eq!(
        check(goal(
            "source_days:workout",
            Direction::AtLeast,
            3.0,
            Period::Day
        )),
        GoalRefusal::BadPeriod
    );
    assert_eq!(
        check(goal(
            "source_days:workout",
            Direction::AtLeast,
            8.0,
            Period::Week
        )),
        GoalRefusal::BadPeriod
    );
    // Vouchers, at least, a Day: that's the Daily goal.
    assert_eq!(
        check(goal("vouchers", Direction::AtLeast, 10.0, Period::Day)),
        GoalRefusal::Duplicate
    );
    let mut unknown = goal("focus", Direction::AtLeast, 90.0, Period::Day);
    unknown.id = Some("g9".into());
    assert_eq!(check(unknown), GoalRefusal::Unknown);
    assert_eq!(ledger.remove_goal("g9"), Err(GoalRefusal::Unknown));
}

#[test]
fn the_same_goal_twice_is_refused_but_other_periods_and_directions_are_not() {
    let mut ledger = set_up();
    let now = at(NOON);
    ledger
        .save_goal(
            goal("source_days:workout", Direction::AtLeast, 3.0, Period::Week),
            now,
        )
        .unwrap();

    assert_eq!(
        ledger.save_goal(
            goal("source_days:workout", Direction::AtLeast, 4.0, Period::Week),
            now
        ),
        Err(GoalRefusal::Duplicate)
    );
    assert!(
        ledger
            .save_goal(
                goal("vouchers", Direction::AtLeast, 80.0, Period::Week),
                now
            )
            .is_ok()
    );
    assert!(
        ledger
            .save_goal(
                goal("distraction", Direction::AtMost, 60.0, Period::Day),
                now
            )
            .is_ok()
    );
    assert!(
        ledger
            .save_goal(
                goal("distraction", Direction::AtMost, 300.0, Period::Week),
                now
            )
            .is_ok()
    );
}

#[test]
fn there_is_a_limit_to_how_many() {
    let mut ledger = set_up();
    let now = at(NOON);
    for i in 0..MAX_GOALS {
        let direction = if i % 2 == 0 {
            Direction::AtLeast
        } else {
            Direction::AtMost
        };
        let period = if i % 4 < 2 { Period::Day } else { Period::Week };
        let measure = [
            "focus",
            "longest",
            "distraction",
            "unlocks",
            "asleep",
            "bedtime",
        ][i / 4];
        ledger
            .save_goal(goal(measure, direction, 1.0, period), now)
            .unwrap();
    }

    assert_eq!(
        ledger.save_goal(goal("wake", Direction::AtMost, 480.0, Period::Day), now),
        Err(GoalRefusal::TooMany)
    );
}

#[test]
fn goals_are_saved_and_an_older_state_without_them_loads() {
    let mut ledger = set_up();
    ledger
        .save_goal(
            goal("bedtime", Direction::AtMost, 1410.0, Period::Day),
            at(NOON),
        )
        .unwrap();

    let saved = ledger.save();
    let mut again = Ledger::load(&saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    assert_eq!(again.goals(at(NOON)).len(), 2);

    let mut older: serde_json::Value = serde_json::from_str(&saved).unwrap();
    older.as_object_mut().unwrap().remove("goals");
    older.as_object_mut().unwrap().remove("goal_ids");
    let mut old = Ledger::load(&older.to_string(), SigningKey::from_bytes(&[7; 32])).unwrap();
    assert_eq!(old.goals(at(NOON)).len(), 1);
    let next = old
        .save_goal(
            goal("focus", Direction::AtLeast, 60.0, Period::Day),
            at(NOON),
        )
        .unwrap();
    assert_eq!(next.id, "g1");
}

fn samsung(kind: &str, target: f64) -> NewExternalGoal {
    NewExternalGoal {
        kind: kind.into(),
        target,
    }
}

/// Samsung Health's sleep target (a bedtime and a wake-up time) and a step goal.
fn samsung_goals() -> Vec<NewExternalGoal> {
    vec![
        samsung("steps", 6000.0),
        samsung("bedtime", 1410.0),
        samsung("wake", 450.0),
    ]
}

#[test]
fn an_outside_apps_goals_are_listed_with_their_owner_and_measure() {
    let mut ledger = set_up();
    ledger
        .save_goal(
            goal("focus", Direction::AtLeast, 90.0, Period::Day),
            at(NOON),
        )
        .unwrap();

    ledger
        .report_external_goals(
            "phone-1",
            Owner::SamsungHealth,
            &samsung_goals(),
            false,
            at(NOON),
        )
        .unwrap();

    let goals = ledger.goals(at(NOON));
    let ids: Vec<&str> = goals.iter().map(|g| g.id.as_str()).collect();
    // The user's own first, then each outside app's in a fixed order.
    assert_eq!(
        ids,
        [
            "daily",
            "g1",
            "samsung_health:bedtime",
            "samsung_health:wake",
            "samsung_health:steps"
        ]
    );
    assert!(
        goals[..2]
            .iter()
            .all(|g| g.owner == Owner::User && g.tracked)
    );
    let bedtime = &goals[2];
    assert_eq!(bedtime.owner, Owner::SamsungHealth);
    assert_eq!(bedtime.measure, "bedtime");
    assert_eq!(bedtime.direction, Direction::AtMost);
    assert_eq!(bedtime.period, Period::Day);
    assert_eq!(bedtime.target, 1410.0);
    assert!(bedtime.tracked);
    assert_eq!(goals[3].measure, "wake");
    // Steps has no measure here yet: kept and listed, never counted.
    let steps = &goals[4];
    assert!(!steps.tracked);
    assert_eq!(steps.measure, "");
    assert_eq!(steps.kind.as_deref(), Some("steps"));
    assert_eq!(steps.unit.as_deref(), Some("steps"));
    assert_eq!(steps.target, 6000.0);
    assert_eq!(
        ledger
            .goal_reporters()
            .get(&Owner::SamsungHealth)
            .map(String::as_str),
        Some("phone-1")
    );
    // They change nothing, so they leave no Marker.
    assert!(ledger.markers().is_empty());
}

#[test]
fn an_outside_apps_goals_are_read_only_here() {
    let mut ledger = set_up();
    ledger
        .report_external_goals(
            "phone-1",
            Owner::SamsungHealth,
            &samsung_goals(),
            false,
            at(NOON),
        )
        .unwrap();

    let mut edit = goal("bedtime", Direction::AtMost, 1380.0, Period::Day);
    edit.id = Some("samsung_health:bedtime".into());
    assert_eq!(ledger.save_goal(edit, at(NOON)), Err(GoalRefusal::Owned));
    assert_eq!(
        ledger.remove_goal("samsung_health:steps"),
        Err(GoalRefusal::Owned)
    );
    assert_eq!(
        ledger.owner_of("samsung_health:bedtime"),
        Some(Owner::SamsungHealth)
    );
    assert_eq!(ledger.owner_of("g1"), None);
    // A goal of the user's own on a measure Samsung Health sets would count it twice.
    assert_eq!(
        ledger.save_goal(
            goal("wake", Direction::AtLeast, 420.0, Period::Week),
            at(NOON)
        ),
        Err(GoalRefusal::MeasureOwned)
    );
    assert_eq!(ledger.measure_owner("bedtime"), Some(Owner::SamsungHealth));
    assert_eq!(ledger.measure_owner("asleep"), None);
    assert!(
        ledger
            .save_goal(
                goal("asleep", Direction::AtLeast, 420.0, Period::Day),
                at(NOON)
            )
            .is_ok()
    );
    assert!(
        GoalRefusal::Owned
            .message(Some(Owner::SamsungHealth))
            .contains("set in Samsung Health")
    );
}

#[test]
fn only_the_reporting_device_sends_them_until_another_claims_them() {
    let mut ledger = set_up();
    let goals = samsung_goals();
    ledger
        .report_external_goals("phone-1", Owner::SamsungHealth, &goals, false, at(NOON))
        .unwrap();

    assert_eq!(
        ledger.report_external_goals(
            "tablet-2",
            Owner::SamsungHealth,
            &[samsung("steps", 9000.0)],
            false,
            at(NOON)
        ),
        Err(ExternalRefusal::NotReporter)
    );
    // Turning the switch on, on the tablet, claims them.
    ledger
        .report_external_goals(
            "tablet-2",
            Owner::SamsungHealth,
            &[samsung("steps", 9000.0)],
            true,
            at(NOON),
        )
        .unwrap();
    assert_eq!(
        ledger.report_external_goals("phone-1", Owner::SamsungHealth, &goals, false, at(NOON)),
        Err(ExternalRefusal::NotReporter)
    );
    let listed = ledger.goals(at(NOON));
    assert_eq!(listed.len(), 2);
    assert_eq!(listed[1].target, 9000.0);
}

#[test]
fn a_new_report_replaces_the_last_and_an_empty_one_clears_them() {
    let mut ledger = set_up();
    ledger
        .report_external_goals(
            "phone-1",
            Owner::SamsungHealth,
            &samsung_goals(),
            false,
            at(NOON),
        )
        .unwrap();
    let created = ledger.goals(at(NOON))[1].created_at;

    // The bedtime moved on the watch, and the step goal was dropped.
    let later = at("2026-10-15T08:00-07:00");
    ledger
        .report_external_goals(
            "phone-1",
            Owner::SamsungHealth,
            &[samsung("bedtime", 1380.0), samsung("wake", 450.0)],
            false,
            later,
        )
        .unwrap();
    let goals = ledger.goals(later);
    assert_eq!(goals.len(), 3);
    assert_eq!(goals[1].target, 1380.0);
    assert_eq!(goals[1].created_at, created);

    ledger
        .report_external_goals("phone-1", Owner::SamsungHealth, &[], false, later)
        .unwrap();
    assert_eq!(ledger.goals(later).len(), 1);
    // The measure is free for a goal of the user's own again.
    assert!(
        ledger
            .save_goal(
                goal("bedtime", Direction::AtMost, 1410.0, Period::Day),
                later
            )
            .is_ok()
    );
}

#[test]
fn bad_reports_are_refused() {
    let mut ledger = set_up();
    let now = at(NOON);
    let mut check = |device: &str, owner: Owner, goals: &[NewExternalGoal]| {
        ledger
            .report_external_goals(device, owner, goals, false, now)
            .unwrap_err()
    };

    assert_eq!(
        check("phone-1", Owner::User, &[samsung("steps", 1.0)]),
        ExternalRefusal::NotExternal
    );
    assert_eq!(
        check(" ", Owner::SamsungHealth, &[samsung("steps", 1.0)]),
        ExternalRefusal::NoDevice
    );
    for bad in [
        vec![samsung("mood", 3.0)],
        vec![samsung("bedtime", 1440.0)],
        vec![samsung("steps", -1.0)],
        vec![samsung("steps", f64::NAN)],
        vec![samsung("steps", 6000.0), samsung("steps", 7000.0)],
    ] {
        assert_eq!(
            check("phone-1", Owner::SamsungHealth, &bad),
            ExternalRefusal::BadGoal
        );
    }
    // Nothing was kept, so no device became the reporter either.
    assert!(ledger.goal_reporters().is_empty());
}

#[test]
fn outside_goals_are_saved_and_an_older_state_without_them_loads() {
    let mut ledger = set_up();
    ledger
        .report_external_goals(
            "phone-1",
            Owner::SamsungHealth,
            &samsung_goals(),
            false,
            at(NOON),
        )
        .unwrap();

    let saved = ledger.save();
    let mut again = Ledger::load(&saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    assert_eq!(again.goals(at(NOON)).len(), 4);

    let mut older: serde_json::Value = serde_json::from_str(&saved).unwrap();
    older.as_object_mut().unwrap().remove("external_goals");
    let mut old = Ledger::load(&older.to_string(), SigningKey::from_bytes(&[7; 32])).unwrap();
    assert_eq!(old.goals(at(NOON)).len(), 1);
    assert!(old.goal_reporters().is_empty());
}
