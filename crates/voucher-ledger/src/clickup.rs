//! Reads ClickUp's filtered team tasks (`GET /api/v2/team/{team_id}/task` with
//! `include_closed=true`). Only tasks that are done and assigned to the user
//! count, so a co-founder finishing their own work earns nothing here.

use jiff::Timestamp;
use serde::Deserialize;

use crate::Completion;

#[derive(Deserialize)]
struct Page {
    tasks: Vec<Task>,
}

#[derive(Deserialize)]
struct Task {
    id: String,
    name: String,
    /// Unix milliseconds as a string, or null while the task is not done.
    date_done: Option<String>,
    assignees: Vec<Assignee>,
}

#[derive(Deserialize)]
struct Assignee {
    id: u64,
}

/// Turns one page of tasks into Completions for the tasks `user_id` is assigned to.
pub fn completions(page: &str, user_id: u64) -> Result<Vec<Completion>, serde_json::Error> {
    let page: Page = serde_json::from_str(page)?;
    Ok(page
        .tasks
        .into_iter()
        .filter(|task| task.assignees.iter().any(|a| a.id == user_id))
        .filter_map(|task| {
            let done_ms: i64 = task.date_done?.parse().ok()?;
            Some(Completion {
                task: format!("clickup:{}", task.id),
                title: task.name,
                at: Timestamp::from_millisecond(done_ms).ok()?,
            })
        })
        .collect())
}
