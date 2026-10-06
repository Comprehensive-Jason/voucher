use jiff::Timestamp;
use voucher_ledger::{Completion, todoist};

const ACTIVITIES: &str = include_str!("fixtures/todoist-activities.json");

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

#[test]
fn completed_tasks_outside_excluded_projects_become_completions() {
    let completions = todoist::completions(ACTIVITIES, &["LEISURE-PROJECT"]).unwrap();

    assert_eq!(
        completions,
        vec![
            Completion {
                task: "todoist:6XGgmFVcrG5RRjVr".into(),
                at: at("2026-10-06T16:30:00Z"),
            },
            Completion {
                task: "todoist:6XGgmHabit00001".into(),
                at: at("2026-10-06T18:00:00Z"),
            },
        ]
    );
}
