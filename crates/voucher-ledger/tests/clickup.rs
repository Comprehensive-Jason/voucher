use jiff::Timestamp;
use voucher_ledger::{Completion, clickup};

const TASKS: &str = include_str!("fixtures/clickup-tasks.json");
const JASON: u64 = 111;

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

#[test]
fn only_done_tasks_assigned_to_me_become_completions() {
    let completions = clickup::completions(TASKS, JASON).unwrap();

    assert_eq!(
        completions,
        vec![
            Completion {
                task: "clickup:86b1done".into(),
                title: "Draft the budget".into(),
                at: at("2026-10-07T04:00:00Z"),
            },
            Completion {
                task: "clickup:86b4both".into(),
                title: "Return the library books".into(),
                at: at("2026-10-07T06:00:00Z"),
            },
        ]
    );
}
