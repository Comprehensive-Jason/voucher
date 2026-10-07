//! The Voucher app's Rust side: the bridge between the interface and the Ledger.
//!
//! The interface calls three commands. `today` fetches everything the Today
//! screen shows; `tear` Redeems tickets; `ledger` passes any other request
//! (a Day's log, history, settings changes) straight through. Every Unlock the Ledger hands back is
//! checked against the Ledger's public key before the app trusts it, the same
//! rule every Enforcer follows (ADR 0001).

mod connection;
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
    /// When the running Unlock's tickets began, and how many were torn.
    pub unlock_started_at: Option<i64>,
    pub unlock_tickets: u32,
    /// Names of the switched-on blocklists.
    pub blocklists: Vec<String>,
}

fn client(app: &tauri::AppHandle) -> Result<ledger::Client, String> {
    let c = connection::load(app).ok_or("Not connected to a Ledger yet.")?;
    ledger::Client::new(&c.url, &c.key)
}

/// Runs blocking Ledger work off the interface's thread.
async fn blocking<T: Send + 'static>(work: impl FnOnce() -> Result<T, String> + Send + 'static) -> Result<T, String> {
    tauri::async_runtime::spawn_blocking(work).await.map_err(|e| e.to_string())?
}

#[tauri::command]
async fn today(app: tauri::AppHandle) -> Result<Today, String> {
    blocking(move || client(&app)?.today()).await
}

/// Redeems `count` tickets at once; together they extend the Unlock.
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

/// Connects to a Ledger: fetches its public key and saves both on this
/// device. Returns the key's first characters so they can be compared with
/// the Ledger's own `public.key`.
#[tauri::command]
async fn connect(app: tauri::AppHandle, url: String) -> Result<String, String> {
    blocking(move || {
        let url = url.trim().trim_end_matches('/').to_string();
        let key = ledger::Client::fetch_key(&url)?;
        ledger::Client::new(&url, &key)?;
        connection::save(&app, &connection::Connection { url, key: key.clone() })?;
        Ok(key.chars().take(8).collect())
    })
    .await
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![today, tear, ledger, connection, connect])
        .run(tauri::generate_context!())
        .expect("error while running the Voucher app");
}
