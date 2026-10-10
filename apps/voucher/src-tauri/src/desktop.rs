//! The Windows side of the app. Blocking itself is the voucher-guard
//! service's job; this part is what the user sees and what only a user
//! session can do:
//! - the tray icon and its pop-up,
//! - the "Steam is paused" window, opened when the guard closes a program
//!   or a browser shows a blocked site,
//! - Focused time read from ActivityWatch and reported to the Ledger, plus
//!   time on sites read from the browser's address bar (`sites`),
//! - the `device` commands the interface also asks of the phone.

use std::{sync::Mutex, thread, time::Duration};

use serde_json::{Value, json};
use tauri::{
    AppHandle, Manager, PhysicalPosition, WebviewUrl, WebviewWindowBuilder, WindowEvent,
    tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent},
};

use crate::sites;

const GUARD: &str = "http://127.0.0.1:8790";
const ACTIVITYWATCH: &str = "http://127.0.0.1:5600";

fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .timeout_global(Some(Duration::from_secs(3)))
        .build()
        .into()
}

fn get_json(url: &str) -> Option<Value> {
    let text = agent().get(url).call().ok()?.body_mut().read_to_string().ok()?;
    serde_json::from_str(&text).ok()
}

/// What the guard reports at `GET /state`, or null if it isn't running.
pub fn guard_state() -> Option<Value> {
    get_json(&format!("{GUARD}/state"))
}

/// Hands the Ledger connection to the guard; it accepts only the first one.
pub fn connect_guard(url: &str, key: &str, code: Option<&str>) {
    let _ = agent()
        .post(format!("{GUARD}/connect"))
        .send(json!({ "url": url, "key": key, "code": code }).to_string());
}

/// A GET or POST to the Ledger, with its access code when it has one.
fn ledger_request(c: &crate::connection::Connection, method: &str, path: &str, body: Option<Value>) -> Option<Value> {
    let url = format!("{}{path}", c.url);
    let auth = c.code.as_ref().map(|code| format!("Bearer {code}"));
    let reply = if method == "GET" {
        let mut r = agent().get(&url);
        if let Some(a) = &auth { r = r.header("Authorization", a); }
        r.call()
    } else {
        let mut r = agent().post(&url).header("Content-Type", "application/json");
        if let Some(a) = &auth { r = r.header("Authorization", a); }
        r.send(body.unwrap_or(Value::Null).to_string())
    };
    let text = reply.ok()?.body_mut().read_to_string().ok()?;
    serde_json::from_str(&text).ok()
}

pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    // Closing the main window keeps Voucher running in the tray.
    if let Some(main) = app.get_webview_window("main") {
        let window = main.clone();
        main.on_window_event(move |event| {
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        });
        // Started at login with --tray: stay in the tray until asked.
        if std::env::args().any(|a| a == "--tray") {
            let _ = main.hide();
        }
    }
    TrayIconBuilder::with_id("voucher")
        .icon(app.default_window_icon().cloned().expect("the app has an icon"))
        .tooltip("Voucher")
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, rect, .. } = event {
                let position = rect.position.to_physical::<f64>(1.0);
                toggle_tray_window(tray.app_handle(), position);
            }
        })
        .build(app)?;
    let handle = app.clone();
    thread::spawn(move || watch_blocks(handle));
    let handle = app.clone();
    thread::spawn(move || report_focus_forever(handle));
    sites::start(app.path().app_data_dir().ok().map(|dir| dir.join("sites.json")));
    Ok(())
}

/// The tray pop-up: shown just above the tray icon, hidden when it loses focus.
fn toggle_tray_window(app: &AppHandle, icon: PhysicalPosition<f64>) {
    const WIDTH: f64 = 380.0;
    const HEIGHT: f64 = 480.0;
    let window = match app.get_webview_window("tray") {
        Some(w) => w,
        None => {
            let Ok(w) = WebviewWindowBuilder::new(app, "tray", WebviewUrl::App("/tray".into()))
                .title("Voucher")
                .inner_size(WIDTH, HEIGHT)
                .decorations(false)
                .resizable(false)
                .skip_taskbar(true)
                .always_on_top(true)
                .visible(false)
                .build()
            else {
                return;
            };
            let hide = w.clone();
            w.on_window_event(move |event| {
                if let WindowEvent::Focused(false) = event {
                    let _ = hide.hide();
                }
            });
            w
        }
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
        return;
    }
    let scale = window.scale_factor().unwrap_or(1.0);
    let x = (icon.x - WIDTH * scale + 40.0 * scale).max(0.0);
    let y = (icon.y - HEIGHT * scale - 12.0 * scale).max(0.0);
    let _ = window.set_position(PhysicalPosition::new(x, y));
    let _ = window.show();
    let _ = window.set_focus();
}

/// Opens the main window, at a route if given.
pub fn show_main(app: &AppHandle, route: Option<&str>) {
    if let Some(main) = app.get_webview_window("main") {
        if let Some(route) = route {
            let _ = main.eval(format!("window.location.assign({})", json!(route)));
        }
        let _ = main.show();
        let _ = main.unminimize();
        let _ = main.set_focus();
    }
}

/// The program or site most recently blocked, for the blocked window.
static LAST_BLOCK: Mutex<Option<Value>> = Mutex::new(None);

fn open_blocked_window(app: &AppHandle, query: String) {
    let url = WebviewUrl::App(format!("/pc-blocked?{query}").into());
    if let Some(window) = app.get_webview_window("blocked") {
        let _ = window.eval(format!("window.location.assign({})", json!(format!("/pc-blocked?{query}"))));
        let _ = window.show();
        let _ = window.set_focus();
        return;
    }
    let _ = WebviewWindowBuilder::new(app, "blocked", url)
        .title("Voucher")
        .inner_size(440.0, 460.0)
        .resizable(false)
        .always_on_top(true)
        .center()
        .focused(true)
        .build();
}

/// Watches for blocks to explain: programs the guard closed, and browser
/// windows showing a blocked site's "blocked by your organization" page.
fn watch_blocks(app: AppHandle) {
    let mut seen_close: i64 = 0;
    let mut seen_site: Option<String> = None;
    loop {
        thread::sleep(Duration::from_secs(1));
        let Some(state) = guard_state() else { continue };
        let decision = &state["decision"];
        if let Some(closed) = state["last_closed"].as_object() {
            let at = closed.get("at").and_then(Value::as_i64).unwrap_or(0);
            if at > seen_close {
                let first = seen_close == 0 && at < jiff::Timestamp::now().as_second() - 10;
                seen_close = at;
                // Don't replay an old close when Voucher itself starts.
                if !first {
                    let label = closed.get("label").and_then(Value::as_str).unwrap_or("This program");
                    let path = closed.get("path").and_then(Value::as_str).unwrap_or("");
                    *LAST_BLOCK.lock().unwrap() = Some(json!({ "label": label, "path": path }));
                    open_blocked_window(&app, format!("label={}&path={}", encode(label), encode(path)));
                }
            }
        }
        if decision["allowed"].as_bool() == Some(false) {
            let sites: Vec<String> = decision["sites"]
                .as_array()
                .into_iter()
                .flatten()
                .filter_map(|s| s.as_str().map(String::from))
                .collect();
            let site = foreground_title().and_then(|title| {
                sites.into_iter().find(|s| title.to_lowercase().starts_with(&format!("{s} ")) || title.to_lowercase() == *s)
            });
            if site.is_some() && site != seen_site {
                let s = site.clone().unwrap();
                *LAST_BLOCK.lock().unwrap() = Some(json!({ "label": s, "site": true }));
                open_blocked_window(&app, format!("label={}&site=1", encode(&s)));
            }
            seen_site = site;
        }
    }
}

fn encode(text: &str) -> String {
    text.bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'.' | b'_' => (b as char).to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect()
}

/// The title of the window in front: a browser on a blocked site shows the
/// site's domain as its title ("youtube.com - Google Chrome").
#[cfg(windows)]
fn foreground_title() -> Option<String> {
    use windows::Win32::UI::WindowsAndMessaging::{GetForegroundWindow, GetWindowTextW};
    let mut buffer = [0u16; 512];
    let len = unsafe { GetWindowTextW(GetForegroundWindow(), &mut buffer) };
    (len > 0).then(|| String::from_utf16_lossy(&buffer[..len as usize]))
}

#[cfg(not(windows))]
fn foreground_title() -> Option<String> {
    None
}

/// Closes the browser tab in front (Ctrl+W), for "Close this tab".
#[cfg(windows)]
fn close_front_tab() {
    use windows::Win32::UI::Input::KeyboardAndMouse::{
        INPUT, INPUT_0, INPUT_KEYBOARD, KEYBDINPUT, KEYBD_EVENT_FLAGS, KEYEVENTF_KEYUP, SendInput, VIRTUAL_KEY, VK_CONTROL,
    };
    let key = |vk: VIRTUAL_KEY, flags: KEYBD_EVENT_FLAGS| INPUT {
        r#type: INPUT_KEYBOARD,
        Anonymous: INPUT_0 { ki: KEYBDINPUT { wVk: vk, wScan: 0, dwFlags: flags, time: 0, dwExtraInfo: 0 } },
    };
    let w = VIRTUAL_KEY(b'W' as u16);
    let inputs = [
        key(VK_CONTROL, KEYBD_EVENT_FLAGS(0)),
        key(w, KEYBD_EVENT_FLAGS(0)),
        key(w, KEYEVENTF_KEYUP),
        key(VK_CONTROL, KEYEVENTF_KEYUP),
    ];
    unsafe { SendInput(&inputs, std::mem::size_of::<INPUT>() as i32) };
}

#[cfg(not(windows))]
fn close_front_tab() {}

/// Focused time from ActivityWatch: minutes each app was in front while the
/// user was not away, since the Day began, reported per source every two
/// minutes. A source's `site:` members add the time its sites were in front.
fn report_focus_forever(app: AppHandle) {
    loop {
        thread::sleep(Duration::from_secs(120));
        let _ = report_focus(&app);
    }
}

fn report_focus(app: &AppHandle) -> Option<()> {
    let connection = crate::connection::load(app)?;
    let status = ledger_request(&connection, "GET", "/status", None)?;
    let settings = &status["settings"];
    let day = status["today"]["day"].as_str()?.to_string();
    let today: jiff::civil::Date = day.parse().ok()?;
    sites::remember_day_start(&status);
    // Without ActivityWatch, time on sites still counts. A smaller total than
    // one already sent changes nothing: the Ledger keeps each device's highest.
    let seconds_by_app = activitywatch_since_day_start(&status).unwrap_or_default();
    let device = device_id();
    let focus = || {
        settings["sources"]
            .as_object()
            .into_iter()
            .flatten()
            .filter(|(_, source)| source["kind"] == "focus" && source["on"] == true)
    };
    let site_members = |source: &Value| -> Vec<String> {
        source["packages"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| sites::site_member(p.as_str()?))
            .collect()
    };
    // A site earns only for the source holding its longest matching domain.
    let all_domains: Vec<String> = focus().flat_map(|(_, source)| site_members(source)).collect();
    for (id, source) in focus() {
        let programs: Vec<String> = source["packages"]
            .as_array()
            .into_iter()
            .flatten()
            .filter_map(|p| p.as_str()?.strip_prefix("win:").map(str::to_lowercase))
            .collect();
        let domains = site_members(source);
        if programs.is_empty() && domains.is_empty() {
            continue;
        }
        // A browser that is itself a member counts whole; its sites aren't added again.
        let seconds: f64 = seconds_by_app.iter().filter(|(app, _)| programs.contains(app)).map(|(_, s)| s).sum::<f64>()
            + sites::seconds_on(today, &domains, &all_domains, &programs);
        let minutes = (seconds / 60.0).floor() as u32;
        if minutes > 0 {
            let body = json!({ "source": id, "day": day, "minutes": minutes, "device": device });
            let _ = ledger_request(&connection, "POST", "/report", Some(body));
        }
    }
    Some(())
}

/// Seconds each program (lowercased file name) was in front, while the
/// user was not away, since the current Day began. None without ActivityWatch.
fn activitywatch_since_day_start(status: &Value) -> Option<Vec<(String, f64)>> {
    let settings = &status["settings"];
    let day = status["today"]["day"].as_str()?.to_string();
    let zone = jiff::tz::TimeZone::get(settings["time_zone"].as_str()?).ok()?;
    let end: jiff::civil::Time = settings["curfew_end"].as_str()?.parse().ok()?;
    let start = day.parse::<jiff::civil::Date>().ok()?.to_datetime(end).to_zoned(zone).ok()?;
    let period = format!("{}/{}", start.timestamp(), jiff::Timestamp::now());
    let query = json!({
        "timeperiods": [period],
        "query": [
            "afk = flood(query_bucket(find_bucket(\"aw-watcher-afk_\")));",
            "window = flood(query_bucket(find_bucket(\"aw-watcher-window_\")));",
            "window = filter_period_intersect(window, filter_keyvals(afk, \"status\", [\"not-afk\"]));",
            "RETURN = merge_events_by_keys(window, [\"app\"]);"
        ]
    });
    let text = agent()
        .post(format!("{ACTIVITYWATCH}/api/0/query/"))
        .header("Content-Type", "application/json")
        .send(query.to_string())
        .ok()?
        .body_mut()
        .read_to_string()
        .ok()?;
    let result: Value = serde_json::from_str(&text).ok()?;
    Some(
        result[0]
            .as_array()?
            .iter()
            .filter_map(|e| Some((e["data"]["app"].as_str()?.to_lowercase(), e["duration"].as_f64()?)))
            .collect(),
    )
}

pub fn device_id() -> String {
    std::env::var("COMPUTERNAME").unwrap_or_else(|_| "windows".into())
}

/// The interface's `device` commands, answered on Windows.
pub fn device(app: &AppHandle, command: &str, args: &Value) -> Result<Value, String> {
    Ok(match command {
        // Windows' three protection parts: the guard service, ActivityWatch, and the tray app.
        "protection" => {
            let guard = guard_state();
            json!({
                "deviceOwner": guard.as_ref().is_some_and(|g| g["connected"] == true),
                "usageAccess": get_json(&format!("{ACTIVITYWATCH}/api/0/info")).is_some(),
                "overlay": true,
            })
        }
        "deviceId" => json!(device_id()),
        "usage" => usage(app),
        "apps" => running_programs(),
        "pendingRoute" => Value::Null,
        "openSettings" => {
            let target = match args["part"].as_str() {
                Some("usageAccess") => "https://activitywatch.net/downloads/",
                _ => "https://github.com/Comprehensive-Jason/voucher#installing-on-windows",
            };
            let _ = std::process::Command::new("cmd").args(["/C", "start", "", target]).spawn();
            Value::Null
        }
        "openApp" => {
            // After a tear the guard stops closing it within five seconds; start it again for the user.
            if let Some(path) = args["pkg"].as_str().filter(|p| !p.is_empty()) {
                let path = path.to_string();
                thread::spawn(move || {
                    thread::sleep(Duration::from_secs(6));
                    let _ = std::process::Command::new(path).spawn();
                });
            }
            Value::Null
        }
        "goHome" => {
            if let Some(window) = app.get_webview_window("blocked") {
                let _ = window.hide();
            }
            if args["closeTab"] == true {
                thread::sleep(Duration::from_millis(250));
                close_front_tab();
            }
            Value::Null
        }
        "showMain" => {
            if let Some(tray) = app.get_webview_window("tray") {
                let _ = tray.hide();
            }
            show_main(app, args["route"].as_str());
            Value::Null
        }
        "lastBlock" => LAST_BLOCK.lock().unwrap().clone().unwrap_or(Value::Null),
        "refresh" | "requestHealth" | "healthGranted" => json!(false),
        "appIcon" => Value::Null,
        other => return Err(format!("{other} isn't available on Windows")),
    })
}

/// Today's Distraction minutes, from ActivityWatch for programs and the
/// address bar for sites (labelled by domain), and how often the guard
/// closed each program.
fn usage(app: &AppHandle) -> Value {
    let guard = guard_state().unwrap_or(Value::Null);
    let mut attempts: Vec<(String, u64)> = guard["closes"]
        .as_object()
        .into_iter()
        .flatten()
        .map(|(label, n)| (label.clone(), n.as_u64().unwrap_or(0)))
        .collect();
    attempts.sort_by_key(|a| std::cmp::Reverse(a.1));
    let opens: u64 = attempts.iter().map(|(_, n)| n).sum();
    let programs: Vec<String> = guard["decision"]["programs"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|p| p.as_str().map(String::from))
        .collect();
    let blocked_sites: Vec<String> = guard["decision"]["sites"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(|s| sites::domain(s.as_str()?))
        .collect();
    let status = crate::connection::load(app).and_then(|c| ledger_request(&c, "GET", "/status", None));
    if let Some(status) = &status {
        sites::remember_day_start(status);
    }
    let by_app = status.as_ref().and_then(activitywatch_since_day_start);
    let by_site = status
        .as_ref()
        .and_then(|s| s["today"]["day"].as_str()?.parse::<jiff::civil::Date>().ok())
        .map(|today| sites::seconds_by_domain(today, &blocked_sites, &programs))
        .unwrap_or_default();
    let measured = by_app.is_some() || by_site.iter().any(|(_, s)| *s >= 60.0);
    let mut apps: Vec<(String, u32)> = by_app
        .unwrap_or_default()
        .into_iter()
        .filter(|(app, _)| programs.contains(app))
        .map(|(app, seconds)| (app.trim_end_matches(".exe").to_string(), (seconds / 60.0) as u32))
        .chain(by_site.into_iter().map(|(site, seconds)| (site, (seconds / 60.0) as u32)))
        .filter(|(_, m)| *m > 0)
        .collect();
    apps.sort_by_key(|a| std::cmp::Reverse(a.1));
    json!({
        "measured": measured,
        "apps": apps.into_iter().map(|(label, minutes)| json!({ "label": label, "minutes": minutes })).collect::<Vec<_>>(),
        "blockedOpens": opens,
        "closedWithoutTearing": 0,
        "attempts": attempts.into_iter().map(|(label, count)| json!({ "label": label, "count": count })).collect::<Vec<_>>(),
    })
}

/// Programs running now, for adding to a blocklist or a source.
fn running_programs() -> Value {
    let mut system = sysinfo::System::new();
    system.refresh_processes(sysinfo::ProcessesToUpdate::All, true);
    let mut names: Vec<String> = system
        .processes()
        .values()
        .filter_map(|p| p.exe()?.file_name()?.to_str().map(String::from))
        .filter(|n| n.to_lowercase().ends_with(".exe"))
        .collect();
    names.sort_by_key(|n| n.to_lowercase());
    names.dedup_by_key(|n| n.to_lowercase());
    Value::Array(
        names
            .into_iter()
            .map(|n| json!({ "package": format!("win:{n}"), "label": n.trim_end_matches(".exe") }))
            .collect(),
    )
}
