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
    collections::BTreeMap,
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
use voucher_ledger::{
    Change, DEFAULT_DAILY_GOAL, DaySummary, Ledger, Settings, clickup, default_blocklists,
    default_sources, todoist,
};

struct Config {
    /// Required on every request but `GET /key`, when set.
    access_code: Option<String>,
    data_dir: PathBuf,
    listen: String,
    poll_minutes: u64,
    todoist_token_file: PathBuf,
    todoist_excluded_projects: Vec<String>,
    clickup_token_file: PathBuf,
    clickup_team_id: Option<String>,
    clickup_user_id: Option<u64>,
    /// `POST /test/complete` and `/test/credit`, for test Ledgers only.
    test_tasks: bool,
}

impl Config {
    fn from_env() -> Config {
        let var = |name: &str| env::var(name).ok().filter(|v| !v.is_empty());
        let data_dir: PathBuf = var("VOUCHER_DATA_DIR").unwrap_or("data".into()).into();
        // Tokens live in the data folder unless set elsewhere, so the app's
        // Reconnect can save one without any server configuration.
        let token_file = |name: &str, default: &str| {
            var(name).map_or_else(|| data_dir.join(default), PathBuf::from)
        };
        Config {
            access_code: None,
            todoist_token_file: token_file("VOUCHER_TODOIST_TOKEN_FILE", "todoist.token"),
            clickup_token_file: token_file("VOUCHER_CLICKUP_TOKEN_FILE", "clickup.token"),
            data_dir,
            listen: var("VOUCHER_LISTEN").unwrap_or("127.0.0.1:8787".into()),
            poll_minutes: var("VOUCHER_POLL_MINUTES")
                .map_or(5, |m| m.parse().expect("VOUCHER_POLL_MINUTES")),
            todoist_excluded_projects: var("VOUCHER_TODOIST_EXCLUDED_PROJECTS")
                .map(|list| list.split(',').map(|p| p.trim().to_string()).collect())
                .unwrap_or_default(),
            clickup_team_id: var("VOUCHER_CLICKUP_TEAM_ID"),
            clickup_user_id: var("VOUCHER_CLICKUP_USER_ID")
                .map(|id| id.parse().expect("VOUCHER_CLICKUP_USER_ID")),
            test_tasks: var("VOUCHER_TEST_TASKS").as_deref() == Some("1"),
        }
    }
}

/// A new Ledger's time zone: VOUCHER_TIME_ZONE, else TZ (as containers set
/// it), else the machine's own, else UTC. Days and Curfew run on it.
fn first_run_time_zone() -> TimeZone {
    ["VOUCHER_TIME_ZONE", "TZ"]
        .iter()
        .filter_map(|name| env::var(name).ok())
        .find_map(|zone| TimeZone::get(zone.trim()).ok())
        .unwrap_or_else(|| TimeZone::try_system().unwrap_or(TimeZone::UTC))
}

/// The starting settings for a brand-new Ledger. After the first run they
/// live in the saved state and change only through `POST /change`.
fn first_run_settings() -> Settings {
    Settings {
        time_zone: first_run_time_zone(),
        bank_limit: 12,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: DEFAULT_DAILY_GOAL,
        sources: default_sources(),
        blocklists: default_blocklists(),
        released_devices: Default::default(),
    }
}

fn main() {
    let mut config = Config::from_env();
    fs::create_dir_all(&config.data_dir).expect("create the data directory");
    config.access_code = load_or_create_access_code(&config.data_dir);
    let key = load_or_create_key(&config.data_dir);
    let state_path = config.data_dir.join("state.json");
    let ledger = match fs::read_to_string(&state_path) {
        Ok(saved) => Ledger::load(&saved, key).expect("state.json is readable"),
        Err(_) => Ledger::new(first_run_settings(), key, Timestamp::now()),
    };
    let ledger = Arc::new(Mutex::new(ledger));
    save(&ledger.lock().unwrap(), &state_path);

    let config = Arc::new(config);
    let (poll_config, poll_ledger, poll_state_path) =
        (Arc::clone(&config), Arc::clone(&ledger), state_path.clone());
    thread::spawn(move || poll_forever(&poll_config, &poll_ledger, &poll_state_path));
    thread::spawn(refresh_lists_forever);

    let server = Server::http(&config.listen).expect("bind the listen address");
    eprintln!("voucher-ledger listening on {}", config.listen);
    for request in server.incoming_requests() {
        handle(request, &ledger, &state_path, &config);
    }
}

/// Domains of each maintained list (`list:invidious`), refreshed daily.
static LISTS: Mutex<BTreeMap<String, Vec<String>>> = Mutex::new(BTreeMap::new());

fn refresh_lists_forever() {
    loop {
        let fetch = |url: &str| -> Result<String, Box<dyn std::error::Error>> {
            Ok(ureq::get(url).call()?.body_mut().read_to_string()?)
        };
        match fetch("https://api.invidious.io/instances.json?sort_by=type,users")
            .and_then(|json| Ok(voucher_ledger::instances::invidious(&json)?))
        {
            Ok(domains) if !domains.is_empty() => {
                LISTS.lock().unwrap().insert("invidious".into(), domains);
            }
            Ok(_) => eprintln!("invidious list came back empty; keeping the last one"),
            Err(error) => eprintln!("invidious list: {error}"),
        }
        match fetch(
            "https://raw.githubusercontent.com/TeamPiped/documentation/main/content/docs/public-instances/index.md",
        ) {
            Ok(markdown) => {
                LISTS
                    .lock()
                    .unwrap()
                    .insert("piped".into(), voucher_ledger::instances::piped(&markdown));
            }
            Err(error) => eprintln!("piped list: {error}"),
        }
        thread::sleep(Duration::from_secs(24 * 60 * 60));
    }
}

/// The last thing that went wrong with each polled source, cleared when a
/// poll succeeds. Shown in the app as "sign-in expired" and the like.
static SOURCE_ERRORS: Mutex<BTreeMap<String, String>> = Mutex::new(BTreeMap::new());

fn note_poll(source: &str, result: &Result<(), String>) {
    let mut errors = SOURCE_ERRORS.lock().unwrap();
    match result {
        Ok(()) => errors.remove(source),
        Err(problem) => errors.insert(source.to_string(), problem.clone()),
    };
}

/// A short, user-facing name for a polling failure.
fn describe_poll_error(error: &(dyn std::error::Error + 'static)) -> String {
    match error.downcast_ref::<ureq::Error>() {
        Some(ureq::Error::StatusCode(401 | 403)) => "sign-in expired".into(),
        Some(ureq::Error::StatusCode(code)) => format!("the service answered {code}"),
        Some(_) => "can't reach the service".into(),
        None if error.is::<NotConnected>() => "not connected".into(),
        None => "unexpected reply".into(),
    }
}

/// The access code: from VOUCHER_ACCESS_CODE, or the data folder's
/// access.code. A brand-new Ledger creates one; a Ledger set up before codes
/// existed keeps running without one until a code is put there.
fn load_or_create_access_code(data_dir: &Path) -> Option<String> {
    if let Some(code) = env::var("VOUCHER_ACCESS_CODE")
        .ok()
        .filter(|c| !c.trim().is_empty())
    {
        return Some(code.trim().to_string());
    }
    let file = data_dir.join("access.code");
    if let Ok(code) = fs::read_to_string(&file) {
        return Some(code.trim().to_string()).filter(|c| !c.is_empty());
    }
    if data_dir.join("state.json").exists() {
        eprintln!(
            "warning: no access code; anyone who can reach this Ledger can use it. Put one in {}",
            file.display()
        );
        return None;
    }
    let code = voucher_ledger::access::new_code();
    fs::write(&file, format!("{code}\n")).expect("write access.code");
    restrict_to_owner(&file);
    eprintln!(
        "created access code {code} (also in {}); enter it when connecting a device",
        file.display()
    );
    Some(code)
}

fn handle(mut request: Request, ledger: &Mutex<Ledger>, state_path: &Path, config: &Config) {
    let now = Timestamp::now();
    let header = request
        .headers()
        .iter()
        .find(|h| h.field.equiv("Authorization"))
        .map(|h| h.value.as_str().to_string());
    if request.url() != "/key"
        && !voucher_ledger::access::authorized(config.access_code.as_deref(), header.as_deref())
    {
        let reply = Response::from_string(json(&Message {
            message: "access code missing or wrong",
        }))
        .with_status_code(401)
        .with_header(Header::from_bytes("Content-Type", "application/json").unwrap());
        let _ = request.respond(reply);
        return;
    }
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
        // `?count=3` tears three Vouchers at once; no count means one.
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
        // One Day's totals and log, by its date: `?date=2026-10-06`.
        (Method::Get, "/day") => match param(query, "date").and_then(|d| d.parse().ok()) {
            Some(day) => (200, json(&ledger.day(day, now))),
            None => (
                400,
                json(&Message {
                    message: "date is missing or not YYYY-MM-DD",
                }),
            ),
        },
        // The last `?days=` Days' totals (default 84, twelve weeks), oldest first.
        (Method::Get, "/history") => match number(query, "days").unwrap_or(Some(84)) {
            Some(days) => (200, json(&ledger.history(days.min(400), now))),
            None => (
                400,
                json(&Message {
                    message: "days is not a number",
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
        // Ends the grace period after setup early. Only ever stricter.
        (Method::Post, "/grace/end") => {
            ledger.end_grace();
            (200, status_json(&mut ledger, now))
        }
        // A device's Distraction minutes for a Day, per app and clock hour.
        (Method::Post, "/usage") => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<UsageReport>(&body).ok());
            match parsed.map(|u| ledger.report_usage(&u.device, u.day, u.apps, now)) {
                Some(true) => (200, json(&Message { message: "kept" })),
                Some(false) => (
                    400,
                    json(&Message {
                        message: "only today and yesterday, at most 24 hours of at most 60 minutes",
                    }),
                ),
                None => (
                    400,
                    json(&Message {
                        message: "body is not a usage report",
                    }),
                ),
            }
        }
        // The phone's running total of minutes for a Workout or Focus source.
        (Method::Post, "/report") => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<Report>(&body).ok());
            match parsed {
                Some(r) => (
                    200,
                    json(&ledger.report_from(
                        r.device.as_deref().unwrap_or(""),
                        &r.source,
                        r.day,
                        r.minutes,
                        r.title.as_deref(),
                        now,
                    )),
                ),
                None => (
                    400,
                    json(&Message {
                        message: "body is not a report",
                    }),
                ),
            }
        }
        // A new API token for a task source, from the app's Reconnect button.
        (Method::Post, "/token") => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<NewToken>(&body).ok());
            let file = parsed.as_ref().and_then(|t| match t.source.as_str() {
                "todoist" => Some(&config.todoist_token_file),
                "clickup" => Some(&config.clickup_token_file),
                _ => None,
            });
            match (parsed, file) {
                (Some(new), Some(file)) if !new.token.trim().is_empty() => {
                    if let Some(folder) = file.parent() {
                        fs::create_dir_all(folder).expect("create the token folder");
                    }
                    fs::write(file, new.token.trim()).expect("write the token file");
                    restrict_to_owner(file);
                    SOURCE_ERRORS.lock().unwrap().remove(&new.source);
                    (
                        200,
                        json(&Message {
                            message: "saved; it is used from the next check",
                        }),
                    )
                }
                _ => (
                    400,
                    json(&Message {
                        message: "body must name todoist or clickup and carry a token",
                    }),
                ),
            }
        }
        // First-run setup: changes apply at once until `finish` closes setup.
        (Method::Post, "/setup") => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<Setup>(&body).ok());
            match parsed.map(|s| ledger.setup(s.changes, s.finish, now)) {
                Some(true) => (200, status_json(&mut ledger, now)),
                Some(false) => (
                    409,
                    json(&Message {
                        message: "setup is finished; changes now go through /change",
                    }),
                ),
                None => (
                    400,
                    json(&Message {
                        message: "body is not a setup",
                    }),
                ),
            }
        }
        // An Enforcer saying it is running: `?device=`. Silences become Gaps.
        (Method::Post, "/check-in") => match param(query, "device") {
            Some(device) if !device.is_empty() => {
                ledger.check_in(device, now);
                (200, json(&Message { message: "seen" }))
            }
            _ => (
                400,
                json(&Message {
                    message: "device is missing",
                }),
            ),
        },
        // The public key, for a device connecting for the first time.
        (Method::Get, "/key") => (200, json(&ledger.public_key())),
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
        // Off unless VOUCHER_TEST_TASKS=1: lets a test Ledger earn task
        // Vouchers without Todoist or ClickUp. It grants nothing `/report`
        // can't already, to anyone holding the access code.
        // Also test-only: Vouchers straight into the Bank, with no earning
        // behind them (no Log entry, no Day score), e.g. to try a Redemption
        // in an hour that earned nothing.
        // Test-only: restarts the grace period, as if setup had just finished.
        (Method::Post, "/test/grace") if config.test_tasks => {
            ledger.start_grace(now);
            (200, status_json(&mut ledger, now))
        }
        (Method::Post, "/test/credit") if config.test_tasks => {
            let count = query
                .split('&')
                .find_map(|p| p.strip_prefix("count="))
                .and_then(|n| n.parse().ok())
                .unwrap_or(1);
            (200, json(&ledger.credit(count, now)))
        }
        (Method::Post, "/test/complete") if config.test_tasks => {
            let mut body = String::new();
            let parsed = request
                .as_reader()
                .read_to_string(&mut body)
                .ok()
                .and_then(|_| serde_json::from_str::<TestTask>(&body).ok());
            match parsed {
                Some(t) => {
                    let task = voucher_ledger::Completion {
                        task: format!("{}:test-{}", t.source, now.as_nanosecond()),
                        title: t.title,
                        at: now,
                    };
                    (200, json(&ledger.record(&[task], now)))
                }
                None => (
                    400,
                    json(&Message {
                        message: "body is not a test task",
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
    param(query, name).map(|value| value.parse().ok())
}

/// Reads `name=<value>` from a query string.
fn param<'a>(query: &'a str, name: &str) -> Option<&'a str> {
    query
        .split('&')
        .find_map(|pair| pair.strip_prefix(name)?.strip_prefix('='))
}

#[derive(serde::Deserialize)]
struct Setup {
    #[serde(default)]
    changes: Vec<Change>,
    #[serde(default)]
    finish: bool,
}

#[derive(serde::Deserialize)]
struct NewToken {
    source: String,
    token: String,
}

#[derive(serde::Deserialize)]
struct TestTask {
    /// "todoist" or "clickup".
    source: String,
    title: String,
}

#[derive(serde::Deserialize)]
struct UsageReport {
    /// Which device measured this; each device's latest report stands.
    device: String,
    day: jiff::civil::Date,
    /// Minutes per clock hour (midnight first), per app.
    apps: std::collections::BTreeMap<String, Vec<u32>>,
}

#[derive(serde::Deserialize)]
struct Report {
    /// Which device measured this; each keeps its own running total.
    #[serde(default)]
    device: Option<String>,
    source: String,
    day: jiff::civil::Date,
    minutes: u32,
    #[serde(default)]
    title: Option<String>,
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
        today: DaySummary,
        source_errors: BTreeMap<String, String>,
        /// What Enforcers block outside an Unlock.
        blocked: voucher_ledger::Blocked,
        setup_complete: bool,
        /// When each Enforcer last checked in.
        last_seen: BTreeMap<String, Timestamp>,
        /// The first Day with any history, where Trends stops scrolling back.
        first_day: jiff::civil::Date,
        /// The oldest Day whose hour-by-hour log is still kept.
        log_first_day: jiff::civil::Date,
        /// Minutes a tear now could still add before Curfew starts.
        room_before_curfew: u32,
        /// While the grace period after setup runs, when it ends.
        grace_until: Option<Timestamp>,
    }
    let settings = ledger.settings(now).clone();
    let unlock = ledger.current_unlock(now).cloned();
    let bank = ledger.bank();
    let curfew_active = ledger.curfew_active(now);
    let today = ledger.today(now);
    let mut blocked = ledger.blocked(now);
    // Maintained lists stay named, and their current domains follow them.
    let lists = LISTS.lock().unwrap();
    let named: Vec<String> = blocked
        .sites
        .iter()
        .filter_map(|s| s.strip_prefix("list:").map(String::from))
        .collect();
    for name in named {
        blocked
            .sites
            .extend(lists.get(&name).into_iter().flatten().cloned());
    }
    drop(lists);
    let setup_complete = ledger.setup_complete();
    let last_seen = ledger.last_seen().clone();
    let first_day = ledger.first_day(now);
    let log_first_day = ledger.log_first_day(now);
    let room_before_curfew = ledger.room_before_curfew(now);
    let grace_until = ledger.grace_until(now);
    json(&Status {
        bank,
        curfew_active,
        unlock,
        settings,
        pending: ledger.pending(now),
        today,
        source_errors: SOURCE_ERRORS.lock().unwrap().clone(),
        blocked,
        setup_complete,
        last_seen,
        first_day,
        log_first_day,
        room_before_curfew,
        grace_until,
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
    fs::set_permissions(path, fs::Permissions::from_mode(0o600))
        .expect("restrict a secret file to its owner");
}

#[cfg(not(unix))]
fn restrict_to_owner(_path: &Path) {}

fn poll_forever(config: &Config, ledger: &Mutex<Ledger>, state_path: &Path) {
    loop {
        let now = Timestamp::now();
        let mut completions = Vec::new();
        for (source, polled) in [
            ("todoist", poll_todoist(config, now)),
            ("clickup", poll_clickup(config, now)),
        ] {
            let outcome = match polled {
                Ok(found) => {
                    completions.extend(found);
                    Ok(())
                }
                Err(error) => {
                    eprintln!("{source}: {error}");
                    Err(describe_poll_error(error.as_ref()))
                }
            };
            note_poll(source, &outcome);
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

/// A source with no token saved yet.
#[derive(Debug)]
struct NotConnected;

impl std::fmt::Display for NotConnected {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str("no token saved")
    }
}

impl std::error::Error for NotConnected {}

fn read_token(file: &Path) -> Result<String, Box<dyn std::error::Error>> {
    match fs::read_to_string(file) {
        Ok(token) if !token.trim().is_empty() => Ok(token.trim().to_string()),
        _ => Err(Box::new(NotConnected)),
    }
}

fn clickup_get(token: &str, path: &str) -> Result<serde_json::Value, Box<dyn std::error::Error>> {
    let body = ureq::get(format!("https://api.clickup.com/api/v2/{path}"))
        .header("Authorization", token)
        .call()?
        .body_mut()
        .read_to_string()?;
    Ok(serde_json::from_str(&body)?)
}

fn poll_todoist(config: &Config, now: Timestamp) -> Polled {
    let token = read_token(&config.todoist_token_file)?;
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
    let token = read_token(&config.clickup_token_file)?;
    // Without configured IDs, use the token's own user and first workspace.
    let user_id = match config.clickup_user_id {
        Some(id) => id,
        None => clickup_get(&token, "user")?["user"]["id"]
            .as_u64()
            .ok_or("no user id")?,
    };
    let team_id = match &config.clickup_team_id {
        Some(id) => id.clone(),
        None => clickup_get(&token, "team")?["teams"][0]["id"]
            .as_str()
            .ok_or("no workspace")?
            .to_string(),
    };
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
