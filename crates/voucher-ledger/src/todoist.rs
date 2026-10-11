//! Reads Todoist's activity log (`GET /api/v1/activities`). The log records
//! each completion as its own event, including every completion of a recurring
//! task, which the completed-tasks endpoint does not reliably do.
//!
//! Also reads time blocks: active tasks with a due time and a duration
//! (`GET /api/v1/tasks/filter`). Fields relied on, from the API v1 reference
//! (developer.todoist.com/api/v1, the task object and "Due dates"): `id`,
//! `project_id`, `checked`, `is_deleted`, `due.date` (with a time part for a
//! timed task; ends in `Z` when the zone is fixed), and `duration.amount`
//! with `duration.unit` (`minute` or `day`). Titles are never read.

use jiff::Timestamp;
use serde::Deserialize;

use crate::{Completion, Scheduled};

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

/// One page of active tasks (`GET /api/v1/tasks/filter`, whose `results` are
/// task objects), for their time blocks.
#[derive(Deserialize)]
struct TaskPage {
    results: Vec<Task>,
}

/// The parts of a task a time block needs. Its title (`content`) is never
/// read: blocks keep no titles.
#[derive(Deserialize)]
struct Task {
    id: String,
    #[serde(default)]
    project_id: Option<String>,
    #[serde(default)]
    checked: bool,
    #[serde(default)]
    is_deleted: bool,
    due: Option<Due>,
    duration: Option<Duration>,
}

#[derive(Deserialize)]
struct Due {
    /// `YYYY-MM-DD` for a full Day (no block), `YYYY-MM-DDTHH:MM:SS` for a
    /// floating time in the user's zone, or `…Z` (UTC) for a fixed zone.
    date: String,
    /// The older REST API's name for a due time; read if it is there.
    #[serde(default)]
    datetime: Option<String>,
}

#[derive(Deserialize)]
struct Duration {
    amount: u32,
    /// `minute` or `day`.
    unit: String,
}

/// Turns one page of tasks into time blocks: tasks with a due time (not a
/// full Day) and a duration in minutes, outside `excluded_projects`. A
/// floating due time is read in `zone`, the Ledger's own.
pub fn scheduled(
    page: &str,
    excluded_projects: &[&str],
    zone: &jiff::tz::TimeZone,
) -> Result<Vec<Scheduled>, serde_json::Error> {
    let page: TaskPage = serde_json::from_str(page)?;
    Ok(page
        .results
        .into_iter()
        .filter(|t| !t.checked && !t.is_deleted)
        .filter(|t| {
            !t.project_id
                .as_deref()
                .is_some_and(|project| excluded_projects.contains(&project))
        })
        .filter_map(|t| {
            let duration = t.duration?;
            if duration.unit != "minute" {
                return None;
            }
            let due = t.due?;
            let start = start_of(due.datetime.as_deref().unwrap_or(&due.date), zone)?;
            Some(Scheduled {
                task: format!("todoist:{}", t.id),
                start,
                minutes: duration.amount,
            })
        })
        .collect())
}

/// When a due date with a time starts: an instant as written (fixed zone),
/// or a floating local time in `zone`. None for a date with no time.
fn start_of(due: &str, zone: &jiff::tz::TimeZone) -> Option<Timestamp> {
    if !due.contains('T') {
        return None;
    }
    if let Ok(at) = due.parse::<Timestamp>() {
        return Some(at);
    }
    let local: jiff::civil::DateTime = due.parse().ok()?;
    local.to_zoned(zone.clone()).ok().map(|z| z.timestamp())
}
