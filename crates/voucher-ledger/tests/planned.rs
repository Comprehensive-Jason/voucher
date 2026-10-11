// Time blocks planned in a task manager: how they are snapshotted as they're
// seen, how edits and completions land, and how each block's minutes split
// into sources, Distraction, everything else, and not known.
use ed25519_dalek::SigningKey;
use jiff::{
    Timestamp,
    civil::{Date, date, time},
    tz::TimeZone,
};
use std::collections::BTreeMap;
use voucher_ledger::{
    Completion, DayTotal, Ledger, Planned, Scheduled, Settings, Split, Stretch, planned, todoist,
};

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
    let mut ledger = Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-09-01T00:00-07:00"),
    );
    ledger.setup(vec![], true, at("2026-09-01T09:00-07:00"));
    ledger
}

fn block(task: &str, start: &str, minutes: u32) -> Scheduled {
    Scheduled {
        task: format!("todoist:{task}"),
        start: at(start),
        minutes,
    }
}

/// Today and tomorrow by calendar date, as Todoist's "today | tomorrow" covers.
fn covers(today: &str) -> (Timestamp, Timestamp) {
    let d: Date = today.parse().unwrap();
    let tz = TimeZone::get("America/Los_Angeles").unwrap();
    let from = d.to_zoned(tz.clone()).unwrap().timestamp();
    let to = d
        .tomorrow()
        .unwrap()
        .tomorrow()
        .unwrap()
        .to_zoned(tz)
        .unwrap()
        .timestamp();
    (from, to)
}

fn planned_on(ledger: &mut Ledger, day: Date, now: Timestamp) -> Vec<Planned> {
    history_day(ledger, day, now).planned
}

fn history_day(ledger: &mut Ledger, day: Date, now: Timestamp) -> DayTotal {
    ledger
        .history(14, now)
        .into_iter()
        .find(|d| d.day == day)
        .unwrap()
}

fn done(task: &str, moment: &str) -> Completion {
    Completion {
        task: format!("todoist:{task}"),
        title: "A task".into(),
        at: at(moment),
    }
}

fn stretch(start: &str, minutes: u32, source: &str) -> Stretch {
    Stretch {
        start: at(start),
        minutes,
        source: source.into(),
    }
}

/// The phone reporting a Day (some Distraction minutes, so it counts as
/// reporting), with these stretches and Distraction spans.
fn phone_reports(
    ledger: &mut Ledger,
    day: Date,
    stretches: Vec<Stretch>,
    spans: Vec<(&str, &str)>,
    now: Timestamp,
) {
    let mut hours = vec![0; 24];
    hours[13] = 5;
    let apps = BTreeMap::from([("Instagram".to_string(), hours)]);
    assert!(ledger.report_usage("phone", day, apps, now));
    assert!(ledger.report_timed_stretches("phone", day, stretches, now));
    let spans = spans.into_iter().map(|(a, b)| (at(a), at(b))).collect();
    assert!(ledger.report_distraction_spans("phone", day, spans, now));
}

fn split_of(sources: u32, distraction: u32, other: u32, unknown: u32) -> Split {
    Split {
        sources,
        distraction,
        other,
        unknown,
    }
}

// ---- The migration ----

#[test]
fn a_state_saved_before_time_blocks_loads_and_takes_them() {
    let saved = include_str!("fixtures/state-before-planned.json");
    let mut ledger = Ledger::load(saved, SigningKey::from_bytes(&[7; 32])).unwrap();
    let now = at("2026-10-10T23:30-07:00");
    let day = history_day(&mut ledger, date(2026, 10, 10), now);
    // What the old state held is all still there, and no blocks yet.
    assert_eq!(day.earned, 2);
    assert_eq!(day.timed_stretches.len(), 2);
    assert_eq!(day.energy, Some(3));
    assert!(day.planned.is_empty());
    assert!(ledger.day(date(2026, 10, 10), now).planned.is_empty());

    // The upgraded state takes blocks for the Day, saves, and loads again.
    // (`now` is 23:30, so a block from 13:30 has started and stays.)
    assert!(ledger.plan(
        "todoist",
        &[block("6XGgmA", "2026-10-10T13:30-07:00", 60)],
        covers("2026-10-10"),
        now
    ));
    let mut again = Ledger::load(&ledger.save(), SigningKey::from_bytes(&[7; 32])).unwrap();
    let planned = planned_on(&mut again, date(2026, 10, 10), now);
    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].service, "todoist");
    assert_eq!(planned[0].minutes, 60);
    // The fixture's phone: the reading stretch 14:00 to 14:40 and a Gap from
    // 15:00 to 16:00, so 13:30 to 14:00 is other, 14:00 to 14:30 in sources.
    assert_eq!(planned[0].split, split_of(30, 0, 30, 0));
    assert_eq!(planned[0].source_minutes.get("reading"), Some(&30));
}

#[test]
fn an_older_ledger_reading_the_new_state_finds_blocks_beside_the_old() {
    let mut ledger = fresh();
    let now = at("2026-10-05T09:00-07:00");
    ledger.plan(
        "todoist",
        &[block("6XGgmA", "2026-10-05T10:00-07:00", 60)],
        covers("2026-10-05"),
        now,
    );
    let saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    let kept = &saved["planned"]["2026-10-05"][0];
    assert_eq!(kept["task"], "todoist:6XGgmA");
    assert_eq!(kept["minutes"], 60);
    assert!(kept.get("done_at").is_none());
}

// ---- Todoist's tasks ----

#[test]
fn todoist_tasks_with_a_time_and_a_duration_become_blocks() {
    let page = include_str!("fixtures/todoist-tasks.json");
    let zone = TimeZone::get("America/Los_Angeles").unwrap();
    let blocks = todoist::scheduled(page, &["LEISURE-PROJECT"], &zone).unwrap();
    assert_eq!(
        blocks,
        vec![
            // A floating time is read in the Ledger's zone.
            block("6XGgmFloating01", "2026-10-06T09:00-07:00", 90),
            // A fixed zone's time is in UTC already.
            block("6XGgmFixedZone1", "2026-10-06T21:00:00Z", 45),
            // The older API's `due.datetime`, where it is sent.
            block("6XGgmDatetime01", "2026-10-06T14:00-07:00", 30),
        ]
    );
}

#[test]
fn no_title_is_kept() {
    let page = include_str!("fixtures/todoist-tasks.json");
    let zone = TimeZone::get("America/Los_Angeles").unwrap();
    let blocks = todoist::scheduled(page, &[], &zone).unwrap();
    let mut ledger = fresh();
    let now = at("2026-10-06T07:00-07:00");
    ledger.plan("todoist", &blocks, covers("2026-10-06"), now);
    let saved = ledger.save();
    assert!(saved.contains("6XGgmFloating01"));
    assert!(!saved.contains("Example floating task"));
}

// ---- Snapshots and edits ----

#[test]
fn a_block_follows_its_task_until_it_starts() {
    let mut ledger = fresh();
    let day = date(2026, 10, 5);
    let a = "2026-10-05T14:00-07:00";
    ledger.plan(
        "todoist",
        &[block("t1", a, 60)],
        covers("2026-10-05"),
        at("2026-10-05T09:00-07:00"),
    );
    // Moved and lengthened before it starts: the block moves with it.
    ledger.plan(
        "todoist",
        &[block("t1", "2026-10-05T15:00-07:00", 90)],
        covers("2026-10-05"),
        at("2026-10-05T10:00-07:00"),
    );
    let now = at("2026-10-05T15:30-07:00");
    // Edited again after it started: the block stays as it was at its start,
    // and the new time is a new block.
    ledger.plan(
        "todoist",
        &[block("t1", "2026-10-05T17:00-07:00", 30)],
        covers("2026-10-05"),
        now,
    );
    let later = at("2026-10-05T23:00-07:00");
    let planned = planned_on(&mut ledger, day, later);
    let times: Vec<(Timestamp, u32)> = planned.iter().map(|p| (p.start, p.minutes)).collect();
    assert_eq!(
        times,
        vec![
            (at("2026-10-05T15:00-07:00"), 90),
            (at("2026-10-05T17:00-07:00"), 30)
        ]
    );
}

#[test]
fn an_unscheduled_task_takes_its_block_with_it_only_before_it_starts() {
    let mut ledger = fresh();
    let seen = [
        block("early", "2026-10-05T09:00-07:00", 30),
        block("late", "2026-10-05T16:00-07:00", 30),
    ];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    // At noon neither is there any more (taken off the plan, or done and gone).
    let noon = at("2026-10-05T12:00-07:00");
    ledger.plan("todoist", &[], covers("2026-10-05"), noon);
    let planned = planned_on(&mut ledger, date(2026, 10, 5), noon);
    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].start, at("2026-10-05T09:00-07:00"));
    // Another service's check never touches Todoist's blocks.
    ledger.plan("clickup", &[], covers("2026-10-05"), noon);
    assert_eq!(planned_on(&mut ledger, date(2026, 10, 5), noon).len(), 1);
}

#[test]
fn a_block_outside_what_a_check_covers_stays() {
    let mut ledger = fresh();
    ledger.plan(
        "todoist",
        &[block("t1", "2026-10-06T10:00-07:00", 30)],
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    // A check covering only today says nothing about tomorrow's block.
    let today_only = (covers("2026-10-05").0, at("2026-10-06T00:00-07:00"));
    ledger.plan("todoist", &[], today_only, at("2026-10-05T09:00-07:00"));
    assert_eq!(
        planned_on(&mut ledger, date(2026, 10, 6), at("2026-10-06T12:00-07:00")).len(),
        1
    );
}

#[test]
fn a_recurring_block_is_kept_after_its_due_date_moves_on() {
    let mut ledger = fresh();
    let seen = [block("daily", "2026-10-05T08:00-07:00", 45)];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T07:00-07:00"),
    );
    // Done at 08:40; Todoist then shows the next day's occurrence.
    ledger.record(
        &[done("daily", "2026-10-05T08:40-07:00")],
        at("2026-10-05T08:41-07:00"),
    );
    let next = [block("daily", "2026-10-06T08:00-07:00", 45)];
    ledger.plan(
        "todoist",
        &next,
        covers("2026-10-05"),
        at("2026-10-05T08:45-07:00"),
    );
    // The completion polled again changes nothing.
    ledger.record(
        &[done("daily", "2026-10-05T08:40-07:00")],
        at("2026-10-05T08:50-07:00"),
    );
    let later = at("2026-10-06T12:00-07:00");
    let today = planned_on(&mut ledger, date(2026, 10, 5), later);
    assert_eq!(today.len(), 1);
    assert_eq!(today[0].done_at, Some(at("2026-10-05T08:40-07:00")));
    let tomorrow = planned_on(&mut ledger, date(2026, 10, 6), later);
    assert_eq!(tomorrow.len(), 1);
    assert_eq!(tomorrow[0].done_at, None);
}

#[test]
fn a_task_done_early_keeps_its_block_and_marks_it_done() {
    let mut ledger = fresh();
    let seen = [block("once", "2026-10-05T15:00-07:00", 60)];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    ledger.record(
        &[done("once", "2026-10-05T11:00-07:00")],
        at("2026-10-05T11:01-07:00"),
    );
    // Done, it drops out of Todoist's active tasks; the block stays.
    ledger.plan(
        "todoist",
        &[],
        covers("2026-10-05"),
        at("2026-10-05T11:05-07:00"),
    );
    let planned = planned_on(&mut ledger, date(2026, 10, 5), at("2026-10-05T20:00-07:00"));
    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].done_at, Some(at("2026-10-05T11:00-07:00")));
}

#[test]
fn blocks_are_taken_only_near_today_and_kept_as_long_as_the_log() {
    let mut ledger = fresh();
    let now = at("2026-10-05T08:00-07:00");
    let seen = [
        block("old", "2026-10-01T10:00-07:00", 30),
        block("soon", "2026-10-06T10:00-07:00", 30),
        block("far", "2026-10-09T10:00-07:00", 30),
        block("long", "2026-10-05T10:00-07:00", 1441),
    ];
    ledger.plan("todoist", &seen, covers("2026-10-05"), now);
    let saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    let days: Vec<&String> = saved["planned"].as_object().unwrap().keys().collect();
    assert_eq!(days, vec!["2026-10-06"]);
    // 184 Days on, the Day has gone with the log.
    ledger.plan(
        "todoist",
        &[],
        covers("2027-04-08"),
        at("2027-04-08T08:00-07:00"),
    );
    let saved: serde_json::Value = serde_json::from_str(&ledger.save()).unwrap();
    assert!(saved["planned"].as_object().unwrap().is_empty());
}

// ---- The split ----

fn s(a: &str, b: &str) -> (Timestamp, Timestamp) {
    (at(a), at(b))
}

#[test]
fn distraction_comes_before_sources_and_the_rest_is_other_or_unknown() {
    let blk = s("2026-10-05T10:00-07:00", "2026-10-05T11:00-07:00");
    let sources = [s("2026-10-05T09:30-07:00", "2026-10-05T10:30-07:00")];
    // Inside the stretch for 10 minutes, then 5 minutes after it.
    let distraction = [
        s("2026-10-05T10:20-07:00", "2026-10-05T10:35-07:00"),
        // The same minutes from a second device count once.
        s("2026-10-05T10:25-07:00", "2026-10-05T10:30-07:00"),
    ];
    // Devices reported until 10:50.
    let covered = [s("2026-10-05T06:00-07:00", "2026-10-05T10:50-07:00")];
    let got = planned::split(blk, &sources, &distraction, &covered);
    assert_eq!(got, split_of(20, 15, 15, 10));
}

#[test]
fn nothing_reported_is_unknown_and_parts_always_add_up() {
    let blk = s("2026-10-05T10:00-07:00", "2026-10-05T10:45-07:00");
    assert_eq!(planned::split(blk, &[], &[], &[]), split_of(0, 0, 0, 45));
    // Seconds round to minutes without the parts overshooting the block.
    let sources = [s("2026-10-05T10:00:00-07:00", "2026-10-05T10:20:31-07:00")];
    let distraction = [s("2026-10-05T10:20:31-07:00", "2026-10-05T10:30:01-07:00")];
    let covered = [s("2026-10-05T10:30:01-07:00", "2026-10-05T10:45-07:00")];
    let got = planned::split(blk, &sources, &distraction, &covered);
    assert_eq!(got.sources + got.distraction + got.other + got.unknown, 45);
    assert_eq!(got.unknown, 0);
}

#[test]
fn a_block_crossing_the_days_end_reads_both_days() {
    let mut ledger = fresh();
    let (d1, d2) = (date(2026, 10, 5), date(2026, 10, 6));
    // 05:00 to 07:00 on the 6th: an hour in the Day of the 5th (until
    // Curfew ends at 06:00), an hour in the 6th.
    let seen = [block("late", "2026-10-06T05:00-07:00", 120)];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T20:00-07:00"),
    );
    phone_reports(
        &mut ledger,
        d1,
        vec![stretch("2026-10-06T05:00-07:00", 30, "obsidian")],
        vec![],
        at("2026-10-06T05:59-07:00"),
    );
    phone_reports(
        &mut ledger,
        d2,
        vec![stretch("2026-10-06T06:10-07:00", 20, "reading")],
        vec![("2026-10-06T06:40-07:00", "2026-10-06T06:50-07:00")],
        at("2026-10-06T23:00-07:00"),
    );
    let later = at("2026-10-07T12:00-07:00");
    let planned = planned_on(&mut ledger, d1, later);
    assert_eq!(planned.len(), 1);
    // 30 + 20 in sources, 10 Distraction, the rest other: both Days' phone
    // reports cover the whole block.
    assert_eq!(planned[0].split, split_of(50, 10, 60, 0));
    assert_eq!(
        planned[0].source_minutes,
        BTreeMap::from([("obsidian".to_string(), 30), ("reading".to_string(), 20)])
    );
    // It is the Day of the 5th's block only.
    assert!(planned_on(&mut ledger, d2, later).is_empty());
}

#[test]
fn overlapping_blocks_each_count_the_same_minutes() {
    let mut ledger = fresh();
    let day = date(2026, 10, 5);
    let seen = [
        block("a", "2026-10-05T10:00-07:00", 60),
        block("b", "2026-10-05T10:30-07:00", 60),
    ];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    phone_reports(
        &mut ledger,
        day,
        vec![],
        vec![("2026-10-05T10:40-07:00", "2026-10-05T10:50-07:00")],
        at("2026-10-05T23:00-07:00"),
    );
    let planned = planned_on(&mut ledger, day, at("2026-10-05T23:30-07:00"));
    assert_eq!(planned[0].split, split_of(0, 10, 50, 0));
    assert_eq!(planned[1].split, split_of(0, 10, 50, 0));
}

#[test]
fn unlocks_count_as_distraction_and_gaps_and_the_future_as_unknown() {
    let mut ledger = fresh();
    let day = date(2026, 10, 5);
    let seen = [block("a", "2026-10-05T14:00-07:00", 120)];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    ledger.credit(2, at("2026-10-05T09:00-07:00"));
    // A 10-minute Unlock at 14:00, with no Distraction app open in it.
    ledger.redeem(at("2026-10-05T14:00-07:00")).unwrap();
    // The phone checks in, is silent from 14:30 to 15:00, then checks in
    // every ten minutes again.
    for moment in ["14:30", "15:00", "15:10", "15:20"] {
        ledger.check_in("phone", at(&format!("2026-10-05T{moment}-07:00")));
    }
    phone_reports(
        &mut ledger,
        day,
        vec![],
        vec![],
        at("2026-10-05T15:20-07:00"),
    );
    // At 15:30 the last half hour hasn't happened yet.
    let planned = ledger.day(day, at("2026-10-05T15:30-07:00")).planned;
    assert_eq!(planned.len(), 1);
    assert_eq!(planned[0].split, split_of(0, 10, 50, 60));
}

#[test]
fn task_vouchers_inside_a_block_are_counted() {
    let mut ledger = fresh();
    let day = date(2026, 10, 5);
    let seen = [block("a", "2026-10-05T10:00-07:00", 60)];
    ledger.plan(
        "todoist",
        &seen,
        covers("2026-10-05"),
        at("2026-10-05T08:00-07:00"),
    );
    // Two other tasks done inside it, one after.
    ledger.record(
        &[
            done("x", "2026-10-05T10:10-07:00"),
            done("y", "2026-10-05T10:50-07:00"),
            done("z", "2026-10-05T11:10-07:00"),
        ],
        at("2026-10-05T11:15-07:00"),
    );
    let planned = planned_on(&mut ledger, day, at("2026-10-05T12:00-07:00"));
    assert_eq!(planned[0].task_vouchers, 2);
    assert_eq!(planned[0].done_at, None);
}
