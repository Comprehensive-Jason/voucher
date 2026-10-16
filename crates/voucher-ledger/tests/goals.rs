use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{
    Change, Direction, Effect, GoalRefusal, Ledger, NewGoal, Period, Settings, goals::MAX_GOALS,
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
