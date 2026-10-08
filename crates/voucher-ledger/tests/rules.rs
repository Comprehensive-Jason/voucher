use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{Change, Completion, Credited, Effect, Ledger, Refusal, Settings};
use voucher_protocol::verify;

fn ledger_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

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

/// When every test Ledger was first started: the week before the tests' dates.
const STARTED: Timestamp = Timestamp::constant(1_790_838_000, 0); // 2026-10-01T00:00-07:00

/// A moment written as local Berkeley time with its UTC offset, e.g. "2026-10-06T15:00-07:00".
fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

#[test]
fn earned_vouchers_go_into_the_bank() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);

    ledger.credit(3, at("2026-10-06T15:00-07:00"));

    assert_eq!(ledger.bank(), 3);
}

#[test]
fn vouchers_earned_past_the_bank_limit_are_forfeited() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(10, at("2026-10-06T15:00-07:00"));

    let credited = ledger.credit(5, at("2026-10-06T16:00-07:00"));

    assert_eq!(ledger.bank(), 12);
    assert_eq!(
        credited,
        Credited {
            kept: 2,
            forfeited: 3
        }
    );
}

#[test]
fn redeeming_spends_one_voucher_for_a_signed_ten_minute_unlock() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(3, at("2026-10-06T15:00-07:00"));
    let now = at("2026-10-06T19:00-07:00");

    let redeemed = ledger.redeem(now).unwrap();

    assert_eq!(ledger.bank(), 2);
    assert_eq!(redeemed.ends_at, at("2026-10-06T19:10-07:00"));
    let unlock = verify(
        &redeemed.wire,
        &ledger_key().verifying_key(),
        now.as_second(),
    )
    .unwrap();
    assert_eq!(unlock.ends_at, redeemed.ends_at.as_second());
}

#[test]
fn an_empty_bank_cannot_be_redeemed() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);

    assert_eq!(
        ledger.redeem(at("2026-10-06T19:00-07:00")),
        Err(Refusal::EmptyBank)
    );
}

/// A Ledger with a full Bank, earned the morning before.
fn stocked() -> Ledger {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(12, at("2026-10-06T09:00-07:00"));
    ledger
}

#[test]
fn redeeming_during_an_unlock_stacks_another_unlock_length() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(3, at("2026-10-06T15:00-07:00"));
    ledger.redeem(at("2026-10-06T19:00-07:00")).unwrap();

    let stacked = ledger.redeem(at("2026-10-06T19:05-07:00")).unwrap();

    assert_eq!(stacked.ends_at, at("2026-10-06T19:20-07:00"));
    assert_eq!(ledger.bank(), 1);
}

#[test]
fn a_voucher_that_would_add_no_time_before_curfew_is_refused() {
    let mut ledger = stocked();
    ledger.redeem(at("2026-10-06T21:55-07:00")).unwrap();

    assert_eq!(
        ledger.redeem(at("2026-10-06T21:57-07:00")),
        Err(Refusal::Curfew)
    );
    assert_eq!(ledger.bank(), 11);
}

#[test]
fn nothing_can_be_redeemed_during_curfew() {
    assert!(stocked().redeem(at("2026-10-06T21:59-07:00")).is_ok());
    assert_eq!(
        stocked().redeem(at("2026-10-06T22:00-07:00")),
        Err(Refusal::Curfew)
    );
    assert_eq!(
        stocked().redeem(at("2026-10-07T05:59-07:00")),
        Err(Refusal::Curfew)
    );
    assert!(stocked().redeem(at("2026-10-07T06:00-07:00")).is_ok());
}

#[test]
fn an_unlock_redeemed_just_before_curfew_ends_when_curfew_starts() {
    let redeemed = stocked().redeem(at("2026-10-06T21:55-07:00")).unwrap();

    assert_eq!(redeemed.ends_at, at("2026-10-06T22:00-07:00"));
}

#[test]
fn curfew_follows_the_wall_clock_across_daylight_saving_changes() {
    // Clocks fell back at 02:00 on 2026-11-01: Berkeley is now UTC-8.
    assert!(stocked().redeem(at("2026-11-01T21:30-08:00")).is_ok());
    assert_eq!(
        stocked().redeem(at("2026-11-01T22:00-08:00")),
        Err(Refusal::Curfew)
    );
    // Clocks sprang forward at 02:00 on 2027-03-14: Berkeley is UTC-7 again.
    assert!(stocked().redeem(at("2027-03-14T21:30-07:00")).is_ok());
    assert_eq!(
        stocked().redeem(at("2027-03-14T22:00-07:00")),
        Err(Refusal::Curfew)
    );
}

#[test]
fn a_tightening_takes_effect_immediately() {
    let mut ledger = stocked();

    let effect = ledger.request(Change::UnlockMinutes(5), at("2026-10-06T21:00-07:00"));

    assert_eq!(effect, Effect::Now);
    let redeemed = ledger.redeem(at("2026-10-06T21:01-07:00")).unwrap();
    assert_eq!(redeemed.ends_at, at("2026-10-06T21:06-07:00"));
}

#[test]
fn a_loosening_requested_at_night_waits_for_the_morning_boundary() {
    let mut ledger = stocked();

    let effect = ledger.request(Change::UnlockMinutes(60), at("2026-10-06T21:00-07:00"));

    assert_eq!(effect, Effect::At(at("2026-10-07T06:00-07:00")));
    let before = ledger.redeem(at("2026-10-06T21:01-07:00")).unwrap();
    assert_eq!(before.ends_at, at("2026-10-06T21:11-07:00"));
    let after = ledger.redeem(at("2026-10-07T06:00-07:00")).unwrap();
    assert_eq!(after.ends_at, at("2026-10-07T07:00-07:00"));
}

#[test]
fn a_loosening_requested_after_the_morning_boundary_waits_for_tomorrows() {
    let mut ledger = stocked();

    let effect = ledger.request(Change::UnlockMinutes(60), at("2026-10-07T07:00-07:00"));

    assert_eq!(effect, Effect::At(at("2026-10-08T06:00-07:00")));
}

#[test]
fn raising_the_bank_limit_is_a_loosening() {
    let mut ledger = stocked();

    let effect = ledger.request(Change::BankLimit(20), at("2026-10-06T21:00-07:00"));

    assert_eq!(effect, Effect::At(at("2026-10-07T06:00-07:00")));
    assert_eq!(ledger.credit(1, at("2026-10-06T21:30-07:00")).forfeited, 1);
    assert_eq!(ledger.credit(8, at("2026-10-07T08:00-07:00")).forfeited, 0);
    assert_eq!(ledger.bank(), 20);
}

#[test]
fn shrinking_curfew_waits_but_widening_it_is_immediate() {
    let mut ledger = stocked();
    let later = Change::Curfew {
        start: time(23, 0, 0, 0),
        end: time(6, 0, 0, 0),
    };
    assert_eq!(
        ledger.request(later, at("2026-10-06T21:00-07:00")),
        Effect::At(at("2026-10-07T06:00-07:00"))
    );
    assert_eq!(
        ledger.redeem(at("2026-10-06T22:30-07:00")),
        Err(Refusal::Curfew)
    );

    let mut ledger = stocked();
    let earlier = Change::Curfew {
        start: time(21, 0, 0, 0),
        end: time(6, 0, 0, 0),
    };
    assert_eq!(
        ledger.request(earlier, at("2026-10-06T20:00-07:00")),
        Effect::Now
    );
    assert_eq!(
        ledger.redeem(at("2026-10-06T21:30-07:00")),
        Err(Refusal::Curfew)
    );
}

#[test]
fn a_tightening_cancels_a_pending_loosening_of_the_same_setting() {
    let mut ledger = stocked();
    ledger.request(Change::UnlockMinutes(60), at("2026-10-06T21:00-07:00"));

    ledger.request(Change::UnlockMinutes(10), at("2026-10-06T21:05-07:00"));

    let redeemed = ledger.redeem(at("2026-10-07T07:00-07:00")).unwrap();
    assert_eq!(redeemed.ends_at, at("2026-10-07T07:10-07:00"));
}

fn done(task: &str, moment: &str) -> Completion {
    Completion {
        task: task.into(),
        title: task.into(),
        at: at(moment),
    }
}

#[test]
fn a_task_earns_at_most_one_voucher_per_day() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);

    // Ticked, unticked, and ticked again; then the next poll sees it again.
    ledger.record(
        &[
            done("todoist:habit", "2026-10-06T08:00-07:00"),
            done("todoist:habit", "2026-10-06T08:05-07:00"),
        ],
        at("2026-10-06T08:10-07:00"),
    );
    ledger.record(
        &[done("todoist:habit", "2026-10-06T08:05-07:00")],
        at("2026-10-06T08:20-07:00"),
    );
    assert_eq!(ledger.bank(), 1);

    // The same recurring habit, done again the next day, earns again.
    ledger.record(
        &[done("todoist:habit", "2026-10-07T08:00-07:00")],
        at("2026-10-07T08:10-07:00"),
    );
    assert_eq!(ledger.bank(), 2);
}

#[test]
fn a_saved_ledger_reloads_exactly_as_it_was() {
    let mut original = Ledger::new(settings(), ledger_key(), STARTED);
    original.record(
        &[done("todoist:habit", "2026-10-06T08:00-07:00")],
        at("2026-10-06T08:10-07:00"),
    );
    original.credit(4, at("2026-10-06T09:00-07:00"));
    original.redeem(at("2026-10-06T19:00-07:00")).unwrap();
    original.request(Change::UnlockMinutes(30), at("2026-10-06T19:01-07:00"));

    let mut reloaded = Ledger::load(&original.save(), ledger_key()).unwrap();

    assert_eq!(reloaded.bank(), 4);
    // The running Unlock survived the restart: stacking extends it.
    assert_eq!(
        reloaded
            .redeem(at("2026-10-06T19:05-07:00"))
            .unwrap()
            .ends_at,
        at("2026-10-06T19:20-07:00")
    );
    // The habit is still remembered as having earned today.
    reloaded.record(
        &[done("todoist:habit", "2026-10-06T08:00-07:00")],
        at("2026-10-06T19:06-07:00"),
    );
    assert_eq!(reloaded.bank(), 3);
    // The queued Loosening still lands at 06:00.
    let redeemed = reloaded.redeem(at("2026-10-07T06:00-07:00")).unwrap();
    assert_eq!(redeemed.ends_at, at("2026-10-07T06:30-07:00"));
}

#[test]
fn completions_older_than_two_days_earn_nothing() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);

    ledger.record(
        &[
            done("todoist:old", "2026-10-03T23:00-07:00"),
            done("todoist:recent", "2026-10-04T08:00-07:00"),
        ],
        at("2026-10-06T08:00-07:00"),
    );

    assert_eq!(ledger.bank(), 1);
}

#[test]
fn work_done_before_the_ledger_started_earns_nothing() {
    let mut ledger = Ledger::new(settings(), ledger_key(), at("2026-10-06T02:48-07:00"));

    ledger.record(
        &[
            done("todoist:before", "2026-10-06T01:30-07:00"),
            done("todoist:after", "2026-10-06T09:00-07:00"),
        ],
        at("2026-10-06T09:05-07:00"),
    );

    assert_eq!(ledger.bank(), 1);
}

#[test]
fn several_vouchers_can_be_torn_at_once() {
    let mut ledger = stocked();

    let redeemed = ledger.redeem_many(3, at("2026-10-06T19:00-07:00")).unwrap();

    assert_eq!(redeemed.ends_at, at("2026-10-06T19:30-07:00"));
    assert_eq!(ledger.bank(), 9);
}

#[test]
fn tearing_more_vouchers_than_the_bank_holds_is_refused_whole() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(2, at("2026-10-06T09:00-07:00"));

    assert_eq!(
        ledger.redeem_many(3, at("2026-10-06T19:00-07:00")),
        Err(Refusal::EmptyBank)
    );
    assert_eq!(ledger.bank(), 2);
}

#[test]
fn a_pending_loosening_can_be_cancelled() {
    let mut ledger = stocked();
    ledger.request(Change::UnlockMinutes(15), at("2026-10-06T21:00-07:00"));

    assert!(ledger.cancel_pending(0, at("2026-10-06T21:05-07:00")));

    let redeemed = ledger.redeem(at("2026-10-07T07:00-07:00")).unwrap();
    assert_eq!(redeemed.ends_at, at("2026-10-07T07:10-07:00"));
}

#[test]
fn vouchers_that_would_only_run_past_curfew_stay_in_the_bank() {
    let mut ledger = stocked();

    let redeemed = ledger.redeem_many(5, at("2026-10-06T21:45-07:00")).unwrap();

    assert_eq!(redeemed.ends_at, at("2026-10-06T22:00-07:00"));
    assert_eq!(ledger.bank(), 10);
}

#[test]
fn a_state_saved_before_daily_goals_existed_still_loads() {
    let mut saved: serde_json::Value = serde_json::from_str(&stocked().save()).unwrap();
    let state = saved.as_object_mut().unwrap();
    state.remove("days");
    state.remove("log");
    state["settings"]
        .as_object_mut()
        .unwrap()
        .remove("daily_goal");

    let mut ledger = Ledger::load(&saved.to_string(), ledger_key()).unwrap();

    assert_eq!(ledger.settings(at("2026-10-06T09:00-07:00")).daily_goal, 16);
    assert_eq!(ledger.bank(), 12);
}

#[test]
fn during_setup_loosenings_apply_at_once_and_setup_never_reopens() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    let noon = at("2026-10-06T12:00-07:00");

    assert!(ledger.setup(
        vec![Change::UnlockMinutes(15), Change::BankLimit(30)],
        false,
        noon
    ));
    assert_eq!(ledger.settings(noon).unlock_minutes, 15);

    assert!(ledger.setup(vec![], true, noon));
    assert!(!ledger.setup(vec![Change::UnlockMinutes(30)], false, noon));
    assert_eq!(ledger.settings(noon).unlock_minutes, 15);
}

#[test]
fn a_ledger_saved_before_setup_existed_counts_as_set_up() {
    let mut saved: serde_json::Value = serde_json::from_str(&stocked().save()).unwrap();
    saved.as_object_mut().unwrap().remove("setup_complete");

    let mut ledger = Ledger::load(&saved.to_string(), ledger_key()).unwrap();

    assert!(!ledger.setup(
        vec![Change::UnlockMinutes(30)],
        false,
        at("2026-10-06T12:00-07:00")
    ));
}

#[test]
fn releasing_a_device_waits_for_morning_and_keeping_it_is_immediate() {
    let mut ledger = stocked();
    let evening = at("2026-10-06T21:00-07:00");

    let release = ledger.request(Change::ReleaseDevice("tablet".into()), evening);

    assert!(matches!(release, Effect::At(_)));
    assert!(!ledger.settings(evening).released_devices.contains("tablet"));
    assert!(
        ledger
            .settings(at("2026-10-07T06:00-07:00"))
            .released_devices
            .contains("tablet")
    );
    assert_eq!(
        ledger.request(
            Change::KeepDevice("tablet".into()),
            at("2026-10-07T07:00-07:00")
        ),
        Effect::Now
    );
    assert!(
        !ledger
            .settings(at("2026-10-07T07:00-07:00"))
            .released_devices
            .contains("tablet")
    );
}

#[test]
fn room_before_curfew_shrinks_as_unlocks_stack_and_is_zero_once_they_reach_it() {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.credit(5, at("2026-10-07T15:00-07:00"));
    // 21:30 with Curfew at 22:00: thirty minutes of room.
    assert_eq!(ledger.room_before_curfew(at("2026-10-07T21:30-07:00")), 30);
    ledger.redeem_many(2, at("2026-10-07T21:30-07:00")).unwrap();
    assert_eq!(ledger.room_before_curfew(at("2026-10-07T21:31-07:00")), 10);
    ledger.redeem(at("2026-10-07T21:32-07:00")).unwrap();
    assert_eq!(ledger.room_before_curfew(at("2026-10-07T21:33-07:00")), 0);
    assert_eq!(ledger.room_before_curfew(at("2026-10-07T23:00-07:00")), 0);
}

fn just_set_up(moment: &str) -> Ledger {
    let mut ledger = Ledger::new(settings(), ledger_key(), STARTED);
    ledger.setup(Vec::new(), true, at(moment));
    ledger
}

#[test]
fn for_two_days_after_setup_a_loosening_applies_at_once() {
    // Set up on a Thursday afternoon: grace runs to Sunday's Morning boundary,
    // the first one at least 48 hours away.
    let mut ledger = just_set_up("2026-10-08T15:00-07:00");
    assert_eq!(
        ledger.grace_until(at("2026-10-08T15:00-07:00")),
        Some(at("2026-10-11T06:00-07:00"))
    );

    let during = ledger.request(Change::BankLimit(30), at("2026-10-10T22:00-07:00"));
    let after = ledger.request(Change::BankLimit(40), at("2026-10-11T06:00-07:00"));

    assert_eq!(during, Effect::Now);
    assert_eq!(after, Effect::At(at("2026-10-12T06:00-07:00")));
    assert_eq!(ledger.grace_until(at("2026-10-11T06:00-07:00")), None);
}

#[test]
fn ending_grace_early_makes_loosenings_wait_again() {
    let mut ledger = just_set_up("2026-10-08T15:00-07:00");

    ledger.end_grace();
    let effect = ledger.request(Change::BankLimit(30), at("2026-10-08T16:00-07:00"));

    assert_eq!(effect, Effect::At(at("2026-10-09T06:00-07:00")));
}

#[test]
fn a_ledger_saved_before_grace_existed_has_none() {
    let ledger = stocked();
    let mut saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    saved.as_object_mut().unwrap().remove("grace_until");
    let mut reloaded = Ledger::load(&saved.to_string(), ledger_key()).unwrap();

    let effect = reloaded.request(Change::BankLimit(30), at("2026-10-06T21:00-07:00"));

    assert!(matches!(effect, Effect::At(_)));
}
