//! voucher-guard: Voucher's Windows Enforcer, a service running as SYSTEM.
//!
//! Every few seconds it reads the Ledger's status (keeping the last answer
//! for when the network is gone), decides whether Distractions are allowed,
//! closes blocked programs, and writes or clears browser policy. Once a
//! minute it checks in, so a stopped guard shows in the Log as a Gap.
//!
//! The Voucher app talks to it on 127.0.0.1:8790: `GET /state` (to show the
//! blocked-program window) and `POST /connect` (setup, accepted only once,
//! so nobody can later point the guard at a Ledger of their own).
//!
//! Usage: `voucher-guard run` in a console; `install` and `uninstall` as an
//! administrator on Windows; Windows starts it as `voucher-guard service`.

#[cfg(windows)]
mod windows;

use std::{
    env, fs,
    path::PathBuf,
    sync::{Arc, Mutex},
    thread,
    time::{Duration, Instant},
};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use jiff::Timestamp;
use serde::{Deserialize, Serialize};
use sysinfo::{ProcessesToUpdate, System};
use tiny_http::{Header, Method, Response, Server};
use voucher_guard::{Decision, decide, is_distraction, label_for};

#[derive(Serialize, Deserialize, Clone)]
struct Connection {
    url: String,
    key: String,
}

/// The last program closed, for the app's "Steam is paused" window.
#[derive(Serialize, Clone)]
struct Closed {
    label: String,
    path: String,
    at: i64,
}

#[derive(Serialize, Default)]
struct State {
    connected: bool,
    device: String,
    decision: Option<Decision>,
    last_closed: Option<Closed>,
    /// When the guard last heard from the Ledger, Unix seconds.
    ledger_seen: Option<i64>,
}

fn data_dir() -> PathBuf {
    match env::var("VOUCHER_GUARD_DIR") {
        Ok(dir) => dir.into(),
        Err(_) if cfg!(windows) => {
            PathBuf::from(env::var("ProgramData").unwrap_or("C:\\ProgramData".into()))
                .join("Voucher")
        }
        Err(_) => "guard-data".into(),
    }
}

fn device_name() -> String {
    env::var("COMPUTERNAME")
        .or_else(|_| env::var("HOSTNAME"))
        .unwrap_or_else(|_| "windows".into())
}

fn load_connection() -> Option<Connection> {
    serde_json::from_str(&fs::read_to_string(data_dir().join("connection.json")).ok()?).ok()
}

fn verifying_key(c: &Connection) -> Option<VerifyingKey> {
    let bytes: [u8; 32] = URL_SAFE_NO_PAD.decode(&c.key).ok()?.try_into().ok()?;
    VerifyingKey::from_bytes(&bytes).ok()
}

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(4)))
        .build()
        .into()
}

/// The loop: a pass every five seconds, a check-in every minute.
pub fn run(stop: Arc<Mutex<bool>>) {
    fs::create_dir_all(data_dir()).ok();
    #[cfg(windows)]
    windows::protect_data_dir(&data_dir());
    let state = Arc::new(Mutex::new(State {
        device: device_name(),
        ..State::default()
    }));
    let api_state = Arc::clone(&state);
    thread::spawn(move || serve(api_state));

    let mut system = System::new();
    let mut last_check_in = Instant::now() - Duration::from_secs(120);
    let cache = data_dir().join("status.json");
    while !*stop.lock().unwrap() {
        let connection = load_connection();
        let now = Timestamp::now();
        let mut fresh = None;
        if let Some(c) = &connection {
            fresh = agent()
                .get(format!("{}/status", c.url))
                .call()
                .ok()
                .and_then(|mut r| r.body_mut().read_to_string().ok())
                .and_then(|text| serde_json::from_str::<serde_json::Value>(&text).ok());
            if let Some(status) = &fresh {
                fs::write(&cache, status.to_string()).ok();
            }
            if fresh.is_some() && last_check_in.elapsed() > Duration::from_secs(60) {
                let device = device_name();
                let _ = agent()
                    .post(format!("{}/check-in?device={device}", c.url))
                    .send_empty();
                last_check_in = Instant::now();
            }
        }
        let status = fresh.clone().or_else(|| {
            fs::read_to_string(&cache)
                .ok()
                .and_then(|text| serde_json::from_str(&text).ok())
        });
        let decision = match (&connection, &status) {
            (Some(c), Some(status)) => {
                verifying_key(c).map(|key| decide(status, &key, &device_name(), now))
            }
            _ => None,
        };
        if let Some(d) = &decision {
            if !d.allowed
                && let Some(closed) = close_distractions(&mut system, d)
            {
                state.lock().unwrap().last_closed = Some(closed);
            }
            #[cfg(windows)]
            windows::write_policies(&voucher_guard::policies(d));
        }
        {
            let mut s = state.lock().unwrap();
            s.connected = connection.is_some();
            s.decision = decision;
            if fresh.is_some() {
                s.ledger_seen = Some(now.as_second());
            }
        }
        thread::sleep(Duration::from_secs(5));
    }
}

/// Closes every running Distraction; returns the last one closed.
fn close_distractions(system: &mut System, d: &Decision) -> Option<Closed> {
    system.refresh_processes(ProcessesToUpdate::All, true);
    let mut closed = None;
    for process in system.processes().values() {
        let Some(path) = process.exe().and_then(|p| p.to_str()) else {
            continue;
        };
        if is_distraction(path, d) && process.kill() {
            closed = Some(Closed {
                label: label_for(path, d),
                path: path.to_string(),
                at: Timestamp::now().as_second(),
            });
        }
    }
    closed
}

/// The app's window onto the guard, on the loopback interface only.
fn serve(state: Arc<Mutex<State>>) {
    let Ok(server) = Server::http("127.0.0.1:8790") else {
        eprintln!("voucher-guard: port 8790 is taken");
        return;
    };
    for mut request in server.incoming_requests() {
        let (code, body) = match (request.method(), request.url()) {
            (Method::Get, "/state") => {
                (200, serde_json::to_string(&*state.lock().unwrap()).unwrap())
            }
            // Setup hands over the Ledger once; after that only an administrator can change it.
            (Method::Post, "/connect") if load_connection().is_none() => {
                let mut body = String::new();
                let _ = request.as_reader().read_to_string(&mut body);
                match serde_json::from_str::<Connection>(&body) {
                    Ok(c) if verifying_key(&c).is_some() => {
                        fs::write(
                            data_dir().join("connection.json"),
                            serde_json::to_string(&c).unwrap(),
                        )
                        .ok();
                        (200, "\"connected\"".into())
                    }
                    _ => (400, "\"not a Ledger connection\"".into()),
                }
            }
            (Method::Post, "/connect") => (409, "\"already connected\"".into()),
            _ => (404, "\"unknown\"".into()),
        };
        let header = Header::from_bytes("Content-Type", "application/json").unwrap();
        let _ = request.respond(
            Response::from_string(body)
                .with_status_code(code)
                .with_header(header),
        );
    }
}

fn main() {
    let command = env::args().nth(1).unwrap_or_default();
    match command.as_str() {
        "run" => run(Arc::new(Mutex::new(false))),
        #[cfg(windows)]
        "service" => windows::service_main(),
        #[cfg(windows)]
        "install" => windows::install(),
        #[cfg(windows)]
        "uninstall" => windows::uninstall(),
        _ => eprintln!("usage: voucher-guard run | install | uninstall"),
    }
}
