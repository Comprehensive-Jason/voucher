//! The Ledger server. Runs on Spruce, reachable only over Tailscale.
//!
//! Two threads share one Ledger behind a lock: one answers HTTP requests from
//! Enforcers and the CLI, the other checks Todoist and ClickUp every few
//! minutes. The state is saved to disk after every change.
//!
//! Configuration comes from environment variables (see `Config::from_env`).
//! API tokens are read from files that only their owner can read; they are
//! never logged.

use std::{
    env, fs,
    path::{Path, PathBuf},
    sync::{Arc, Mutex},
    thread,
    time::Duration,
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use serde::Serialize;
use tiny_http::{Header, Method, Request, Response, Server};
use voucher_ledger::{Change, DEFAULT_DAILY_GOAL, Ledger, Settings, Today, clickup, todoist};

struct Config {
    data_dir: PathBuf,
    listen: String,
    poll_minutes: u64,
    todoist_token_file: Option<PathBuf>,
    todoist_excluded_projects: Vec<String>,
    clickup_token_file: Option<PathBuf>,
    clickup_team_id: Option<String>,
    clickup_user_id: Option<u64>,
}

impl Config {
    fn from_env() -> Config {
        let var = |name: &str| env::var(name).ok().filter(|v| !v.is_empty());
        Config {
            data_dir: var("VOUCHER_DATA_DIR").unwrap_or("data".into()).into(),
            listen: var("VOUCHER_LISTEN").unwrap_or("127.0.0.1:8787".into()),
            poll_minutes: var("VOUCHER_POLL_MINUTES")
                .map_or(5, |m| m.parse().expect("VOUCHER_POLL_MINUTES")),
            todoist_token_file: var("VOUCHER_TODOIST_TOKEN_FILE").map(PathBuf::from),
            todoist_excluded_projects: var("VOUCHER_TODOIST_EXCLUDED_PROJECTS")
                .map(|list| list.split(',').map(|p| p.trim().to_string()).collect())
                .unwrap_or_default(),
            clickup_token_file: var("VOUCHER_CLICKUP_TOKEN_FILE").map(PathBuf::from),
            clickup_team_id: var("VOUCHER_CLICKUP_TEAM_ID"),
            clickup_user_id: var("VOUCHER_CLICKUP_USER_ID")
                .map(|id| id.parse().expect("VOUCHER_CLICKUP_USER_ID")),
        }
    }
}

/// The starting settings for a brand-new Ledger. After the first run they
/// live in the saved state and change only through `POST /change`.
fn first_run_settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").expect("tzdb has Los Angeles"),
        bank_limit: 12,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: DEFAULT_DAILY_GOAL,
    }
}

fn main() {
    let config = Config::from_env();
    fs::create_dir_all(&config.data_dir).expect("create the data directory");
    let key = load_or_create_key(&config.data_dir);
    let state_path = config.data_dir.join("state.json");
    let ledger = match fs::read_to_string(&state_path) {
        Ok(saved) => Ledger::load(&saved, key).expect("state.json is readable"),
        Err(_) => Ledger::new(first_run_settings(), key, Timestamp::now()),
    };
    let ledger = Arc::new(Mutex::new(ledger));
    save(&ledger.lock().unwrap(), &state_path);

    let listen = config.listen.clone();
    let (poll_ledger, poll_state_path) = (Arc::clone(&ledger), state_path.clone());
    thread::spawn(move || poll_forever(&config, &poll_ledger, &poll_state_path));

    let server = Server::http(&listen).expect("bind the listen address");
    eprintln!("voucher-ledger listening on {listen}");
    for request in server.incoming_requests() {
        handle(request, &ledger, &state_path);
    }
}

fn handle(mut request: Request, ledger: &Mutex<Ledger>, state_path: &Path) {
    let now = Timestamp::now();
    let mut ledger = ledger.lock().unwrap();
    let url = request.url().to_string();
    let (path, query) = url.split_once('?').unwrap_or((&url, ""));
    let (status, body) = match (request.method(), path) {
        (Method::Get, "/status") => (200, status_json(&mut ledger, now)),
        (Method::Get, "/unlock") => match ledger.current_unlock(now) {
            Some(unlock) => (200, json(unlock)),
            None => (
                404,
                json(&Message {
                    message: "no Unlock is running",
                }),
            ),
        },
        // `?count=3` tears three tickets at once; no count means one.
        (Method::Post, "/redeem") => match number(query, "count").unwrap_or(Some(1)) {
            Some(count) => match ledger.redeem_many(count, now) {
                Ok(redeemed) => (200, json(&redeemed)),
                Err(refusal) => (409, json(&refusal)),
            },
            None => (
                400,
                json(&Message {
                    message: "count is not a number",
                }),
            ),
        },
        (Method::Post, "/cancel") => match number(query, "index") {
            Some(Some(index)) if ledger.cancel_pending(index as usize, now) => {
                (200, status_json(&mut ledger, now))
            }
            _ => (
                404,
                json(&Message {
                    message: "no pending change at that index",
                }),
            ),
        },
        (Method::Post, "/change") => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<Change>(&body).ok());
            match parsed {
                Some(change) => (200, json(&ledger.request(change, now))),
                None => (
                    400,
                    json(&Message {
                        message: "body is not a Change",
                    }),
                ),
            }
        }
        _ => (
            404,
            json(&Message {
                message: "unknown endpoint",
            }),
        ),
    };
    save(&ledger, state_path);
    drop(ledger);
    let content_type = Header::from_bytes("Content-Type", "application/json").unwrap();
    let response = Response::from_string(body)
        .with_status_code(status)
        .with_header(content_type);
    let _ = request.respond(response);
}

/// Reads `name=<number>` from a query string: None if it is absent,
/// Some(None) if it is there but not a number.
fn number(query: &str, name: &str) -> Option<Option<u32>> {
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
        .map(|value| value.parse().ok())
}

#[derive(Serialize)]
struct Message {
    message: &'static str,
}

fn status_json(ledger: &mut Ledger, now: Timestamp) -> String {
    #[derive(Serialize)]
    struct Status<'a> {
        bank: u32,
        curfew_active: bool,
        unlock: Option<voucher_ledger::Redeemed>,
        settings: Settings,
        pending: &'a [(Change, Timestamp)],
        today: Today,
    }
    let settings = ledger.settings(now).clone();
    let unlock = ledger.current_unlock(now).cloned();
    let bank = ledger.bank();
    let curfew_active = ledger.curfew_active(now);
    let today = ledger.today(now);
    json(&Status {
        bank,
        curfew_active,
        unlock,
        settings,
        pending: ledger.pending(now),
        today,
    })
}

fn json(value: &impl Serialize) -> String {
    serde_json::to_string(value).expect("responses always serialize")
}

/// Writes the state to a temporary file, then renames it into place, so a
/// crash mid-write can never leave a half-written state.json.
fn save(ledger: &Ledger, path: &Path) {
    let temporary = path.with_extension("json.tmp");
    fs::write(&temporary, ledger.save()).expect("write state");
    fs::rename(&temporary, path).expect("replace state.json");
}

/// Loads the signing key, or creates one on first run. The public half is
/// written next to it for copying onto Enforcers.
fn load_or_create_key(data_dir: &Path) -> SigningKey {
    let key_path = data_dir.join("signing.key");
    if let Ok(bytes) = fs::read(&key_path) {
        let bytes: [u8; 32] = bytes.try_into().expect("signing.key is 32 bytes");
        return SigningKey::from_bytes(&bytes);
    }
    let mut bytes = [0u8; 32];
    getrandom::fill(&mut bytes).expect("the OS random number generator works");
    fs::write(&key_path, bytes).expect("write signing.key");
    restrict_to_owner(&key_path);
    let key = SigningKey::from_bytes(&bytes);
    let public = URL_SAFE_NO_PAD.encode(key.verifying_key().to_bytes());
    fs::write(data_dir.join("public.key"), public + "\n").expect("write public.key");
    eprintln!("created a new signing key in {}", key_path.display());
    key
}

#[cfg(unix)]
fn restrict_to_owner(path: &Path) {
    use std::os::unix::fs::PermissionsExt;
    fs::set_permissions(path, fs::Permissions::from_mode(0o600)).expect("chmod signing.key");
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) {}

fn poll_forever(config: &Config, ledger: &Mutex<Ledger>, state_path: &Path) {
    loop {
        let now = Timestamp::now();
        let mut completions = Vec::new();
        match poll_todoist(config, now) {
            Ok(found) => completions.extend(found),
            Err(error) => eprintln!("todoist: {error}"),
        }
        match poll_clickup(config, now) {
            Ok(found) => completions.extend(found),
            Err(error) => eprintln!("clickup: {error}"),
        }
        if !completions.is_empty() {
            let mut ledger = ledger.lock().unwrap();
            let credited = ledger.record(&completions, now);
            if credited.kept + credited.forfeited > 0 {
                eprintln!(
                    "credited {} Vouchers, forfeited {}",
                    credited.kept, credited.forfeited
                );
            }
            save(&ledger, state_path);
        }
        thread::sleep(Duration::from_secs(config.poll_minutes * 60));
    }
}

/// How far back each check looks. Matches the Ledger's two-day earning window.
const LOOK_BACK: Duration = Duration::from_secs(3 * 24 * 60 * 60);

type Polled = Result<Vec<voucher_ledger::Completion>, Box<dyn std::error::Error>>;

fn poll_todoist(config: &Config, now: Timestamp) -> Polled {
    let Some(token_file) = &config.todoist_token_file else {
        return Ok(Vec::new());
    };
    let token = fs::read_to_string(token_file)?.trim().to_string();
    let since = now.checked_sub(LOOK_BACK)?.to_string();
    let excluded: Vec<&str> = config
        .todoist_excluded_projects
        .iter()
        .map(String::as_str)
        .collect();
    let mut completions = Vec::new();
    let mut cursor: Option<String> = None;
    loop {
        let mut request = ureq::get("https://api.todoist.com/api/v1/activities")
            .header("Authorization", format!("Bearer {token}"))
            .query("object_type", "item")
            .query("event_type", "completed")
            .query("date_from", &since)
            .query("limit", "100");
        if let Some(cursor) = &cursor {
            request = request.query("cursor", cursor);
        }
        let page = request.call()?.body_mut().read_to_string()?;
        completions.extend(todoist::completions(&page, &excluded)?);
        cursor = serde_json::from_str::<serde_json::Value>(&page)?["next_cursor"]
            .as_str()
            .map(String::from);
        if cursor.is_none() {
            return Ok(completions);
        }
    }
}

fn poll_clickup(config: &Config, now: Timestamp) -> Polled {
    let (Some(token_file), Some(team_id), Some(user_id)) = (
        &config.clickup_token_file,
        &config.clickup_team_id,
        config.clickup_user_id,
    ) else {
        return Ok(Vec::new());
    };
    let token = fs::read_to_string(token_file)?.trim().to_string();
    let since_ms = now.checked_sub(LOOK_BACK)?.as_millisecond().to_string();
    let mut completions = Vec::new();
    for page in 0.. {
        let body = ureq::get(format!(
            "https://api.clickup.com/api/v2/team/{team_id}/task"
        ))
        .header("Authorization", &token)
        .query("include_closed", "true")
        .query("subtasks", "true")
        .query("assignees[]", user_id.to_string())
        .query("date_done_gt", &since_ms)
        .query("page", page.to_string())
        .call()?
        .body_mut()
        .read_to_string()?;
        completions.extend(clickup::completions(&body, user_id)?);
        // ClickUp returns up to 100 tasks per page; a shorter page is the last.
        let on_page = serde_json::from_str::<serde_json::Value>(&body)?["tasks"]
            .as_array()
            .map_or(0, Vec::len);
        if on_page < 100 {
            break;
        }
    }
    Ok(completions)
}
