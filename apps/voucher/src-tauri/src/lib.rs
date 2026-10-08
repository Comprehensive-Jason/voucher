//! The Voucher app's Rust side: the bridge between the interface and the Ledger.
//!
//! The interface calls three commands. `today` fetches everything the Today
//! screen shows; `tear` Redeems Vouchers; `ledger` passes any other request
//! (a Day's log, history, settings changes) straight through. Every Unlock the Ledger hands back is
//! checked against the Ledger's public key before the app trusts it, the same
//! rule every Enforcer follows (ADR 0001).

mod connection;
#[cfg(desktop)]
mod desktop;
mod ledger;

use serde::Serialize;

/// A development build's Ledger, set when the app is built
/// (`VOUCHER_LEDGER_URL`, `VOUCHER_LEDGER_PUBLIC_KEY`) so no address is
/// committed. Setup saves each device's own connection, which wins.
pub(crate) const LEDGER_URL: &str = match option_env!("VOUCHER_LEDGER_URL") {
    Some(url) => url,
    None => "",
};
pub(crate) const LEDGER_PUBLIC_KEY: &str = match option_env!("VOUCHER_LEDGER_PUBLIC_KEY") {
    Some(key) => key,
    None => "",
};

/// Everything the Today screen draws, in one payload.
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Today {
    pub bank: u32,
    pub bank_limit: u32,
    pub unlock_minutes: u32,
    /// The running Unlock's end, in Unix seconds, if its signature checks out.
    pub unlock_ends_at: Option<i64>,
    pub curfew_active: bool,
    pub curfew_start: String,
    pub curfew_end: String,
    /// The current Day, "2026-10-07"; it starts when Curfew ends.
    pub day: String,
    /// Vouchers earned this Day, toward the Daily goal.
    pub goal_done: u32,
    pub goal_target: u32,
    pub streak_days: u32,
    /// Each source's progress toward its next Voucher, as the Ledger sends it.
    pub sources: serde_json::Value,
    /// Today's log, newest first, as the Ledger sends it.
    pub log: serde_json::Value,
    /// When the running Unlock's Vouchers began, and how many were torn.
    pub unlock_started_at: Option<i64>,
    pub unlock_vouchers: u32,
    /// Minutes a tear could still add before Curfew; none from older Ledgers.
    pub curfew_room_minutes: Option<u32>,
    /// Names of the switched-on blocklists.
    pub blocklists: Vec<String>,
}

fn client(app: &tauri::AppHandle) -> Result<ledger::Client, String> {
    let c = connection::load(app).ok_or("Not connected to a Ledger yet.")?;
    ledger::Client::new(&c.url, &c.key, c.code.as_deref())
}

/// Runs blocking Ledger work off the interface's thread.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn today(app: tauri::AppHandle) -> Result<Today, String> {
    blocking(move || client(&app)?.today()).await
}

/// Redeems `count` Vouchers at once; together they extend the Unlock.
#[tauri::command]
async fn tear(app: tauri::AppHandle, count: u32) -> Result<Today, String> {
    blocking(move || {
        let client = client(&app)?;
        client.redeem(count)?;
        client.today()
    })
    .await
}

/// Any other Ledger request: a Day's log, the history, a settings change.
#[tauri::command]
async fn ledger(app: tauri::AppHandle, method: String, path: String, body: Option<String>) -> Result<serde_json::Value, String> {
    blocking(move || client(&app)?.call(&method, &path, body.as_deref())).await
}

/// The Ledger this device uses, if any.
#[tauri::command]
fn connection(app: tauri::AppHandle) -> Option<String> {
    connection::load(&app).map(|c| c.url)
}

/// Connects to a Ledger: fetches its public key, checks the access code by
/// reading its status, and saves all three on this device. Returns the key's
/// first characters so they can be compared with the Ledger's `public.key`.
#[tauri::command]
async fn connect(app: tauri::AppHandle, url: String, code: Option<String>) -> Result<String, String> {
    blocking(move || {
        let url = url.trim().trim_end_matches('/').to_string();
        let code = code.map(|c| c.trim().to_uppercase()).filter(|c| !c.is_empty());
        let key = ledger::Client::fetch_key(&url)?;
        ledger::Client::new(&url, &key, code.as_deref())?
            .call("GET", "/status", None)
            .map_err(|e| if e.contains("access code") { "That access code isn't right.".to_string() } else { e })?;
        connection::save(&app, &connection::Connection { url: url.clone(), key: key.clone(), code: code.clone() })?;
        // On Windows the guard service gets the same Ledger, once.
        #[cfg(desktop)]
        desktop::connect_guard(&url, &key, code.as_deref());
        Ok(key.chars().take(8).collect())
    })
    .await
}

/// Anything the phone itself must do, forwarded to the Kotlin `VoucherPlugin`:
/// protection status, usage, opening settings, the blocked-app screen's
/// actions. Only exists on Android.
#[tauri::command]
async fn device(app: tauri::AppHandle, command: String, args: Option<serde_json::Value>) -> Result<serde_json::Value, String> {
    #[cfg(target_os = "android")]
    {
        use tauri::Manager;
        let plugin = app.state::<Device>().0.clone();
        let args = args.unwrap_or(serde_json::json!({}));
        blocking(move || {
            let reply: serde_json::Value = plugin.run_mobile_plugin(&command, args).map_err(|e| e.to_string())?;
            // Plain values come back wrapped as {"value": ...}.
            Ok(match reply.get("value") {
                Some(value) if reply.as_object().is_some_and(|o| o.len() == 1) => value.clone(),
                _ => reply,
            })
        })
        .await
    }
    #[cfg(desktop)]
    {
        let args = args.unwrap_or(serde_json::json!({}));
        blocking(move || desktop::device(&app, &command, &args)).await
    }
    #[cfg(not(any(target_os = "android", desktop)))]
    {
        let _ = (app, command, args);
        Err("Not on this platform".into())
    }
}

#[cfg(target_os = "android")]
struct Device(tauri::plugin::PluginHandle<tauri::Wry>);

/// Registers the Kotlin side under the plugin name "voucher".
fn device_plugin() -> tauri::plugin::TauriPlugin<tauri::Wry> {
    tauri::plugin::Builder::new("voucher")
        .setup(|_app, _api| {
            #[cfg(target_os = "android")]
            {
                use tauri::Manager;
                let handle = _api.register_android_plugin("io.github.comprehensivejason.voucher", "VoucherPlugin")?;
                _app.manage(Device(handle));
            }
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(device_plugin())
        .setup(|app| {
            // The Android Enforcer reads the connection from the saved file, so a
            // development build's built-in Ledger is written there too.
            if let Some(c) = connection::load(app.handle()) {
                let _ = connection::save(app.handle(), &c);
                #[cfg(desktop)]
                desktop::connect_guard(&c.url, &c.key, c.code.as_deref());
            }
            #[cfg(desktop)]
            desktop::setup(app.handle())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![today, tear, ledger, connection, connect, device])
        .run(tauri::generate_context!())
        .expect("error while running the Voucher app");
}
