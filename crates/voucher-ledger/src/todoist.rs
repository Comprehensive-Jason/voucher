//! Reads Todoist's activity log (`GET /api/v1/activities`). The log records
//! each completion as its own event, including every completion of a recurring
//! task, which the completed-tasks endpoint does not reliably do.

use jiff::Timestamp;
use serde::Deserialize;

use crate::Completion;

#[derive(Deserialize)]
struct Page {
    results: Vec<Event>,
}

#[derive(Deserialize)]
struct Event {
    object_type: String,
    object_id: String,
    event_type: String,
    event_date: Timestamp,
    parent_project_id: Option<String>,
    #[serde(default)]
    extra_data: ExtraData,
}

#[derive(Deserialize, Default)]
struct ExtraData {
    #[serde(default)]
    content: String,
}

/// Turns one page of activity events into Completions, skipping events in
/// `excluded_projects` (such as Leisure) and anything that is not a task
/// being completed.
pub fn completions(
    page: &str,
    excluded_projects: &[&str],
) -> Result<Vec<Completion>, serde_json::Error> {
    let page: Page = serde_json::from_str(page)?;
    Ok(page
        .results
        .into_iter()
        .filter(|event| event.object_type == "item" && event.event_type == "completed")
        .filter(|event| {
            !event
                .parent_project_id
                .as_deref()
                .is_some_and(|project| excluded_projects.contains(&project))
        })
        .map(|event| Completion {
            task: format!("todoist:{}", event.object_id),
            title: event.extra_data.content,
            at: event.event_date,
        })
        .collect())
}
