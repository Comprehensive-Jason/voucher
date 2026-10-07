//! The Voucher app's Rust side: the bridge between the interface and the Ledger.
//!
//! The interface calls three commands. `today` fetches everything the Today
//! screen shows; `tear` Redeems tickets; `ledger` passes any other request
//! (a Day's log, history, settings changes) straight through. Every Unlock the Ledger hands back is
//! checked against the Ledger's public key before the app trusts it, the same
//! rule every Enforcer follows (ADR 0001).

mod ledger;

use serde::Serialize;

/// Where the Ledger lives and how to recognise its signature, set when the app
/// is built (`VOUCHER_LEDGER_URL`, `VOUCHER_LEDGER_PUBLIC_KEY`) so no address is
/// committed. First-run setup will store these per device instead.
const LEDGER_URL: &str = match option_env!("VOUCHER_LEDGER_URL") {
    Some(url) => url,
    None => "",
};
const LEDGER_PUBLIC_KEY: &str = match option_env!("VOUCHER_LEDGER_PUBLIC_KEY") {
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

#[tauri::command]
async fn today() -> Result<Today, String> {
    tauri::async_runtime::spawn_blocking(|| ledger::Client::new(LEDGER_URL, LEDGER_PUBLIC_KEY)?.today())
        .await
        .map_err(|e| e.to_string())?
}

/// Redeems `count` tickets at once; together they extend the Unlock.
#[tauri::command]
async fn tear(count: u32) -> Result<Today, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = ledger::Client::new(LEDGER_URL, LEDGER_PUBLIC_KEY)?;
        client.redeem(count)?;
        client.today()
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Any other Ledger request: a Day's log, the history, a settings change.
#[tauri::command]
async fn ledger(method: String, path: String, body: Option<String>) -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(move || {
        ledger::Client::new(LEDGER_URL, LEDGER_PUBLIC_KEY)?.call(&method, &path, body.as_deref())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![today, tear, ledger])
        .run(tauri::generate_context!())
        .expect("error while running the Voucher app");
}
