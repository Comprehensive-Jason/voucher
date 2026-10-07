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
    pub sources: Vec<SourceProgress>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProgress {
    pub name: &'static str,
    pub detail: String,
    /// 0.0 to 1.0 toward the next Voucher.
    pub progress: f32,
    pub color: &'static str,
    /// True while the Ledger can't measure this source yet; the interface
    /// tags these rows so sample numbers are never mistaken for real ones.
    pub sample: bool,
}

/// The "Toward the next Voucher" rows. Tasks are real; the Focused-time and
/// exercise sources are samples until the Ledger can measure them.
fn sources(tasks_today: u32) -> Vec<SourceProgress> {
    let s = |name, detail: String, progress, color, sample| SourceProgress { name, detail, progress, color, sample };
    vec![
        s("Tasks", format!("+1 each · {tasks_today} today"), 1.0, "#5b9cff", false),
        s("Obsidian", "18 / 30 min".into(), 0.6, "#b08cff", true),
        s("Workout", "9 / 15 zone min".into(), 0.6, "#ff8a5c", true),
        s("Readwise Reader", "22 / 30 min".into(), 0.73, "#ffd166", true),
        s("Moon+ Reader", "9 / 30 min".into(), 0.3, "#e0a82e", true),
        s("Anki", "6 / 30 min".into(), 0.2, "#ff6fa8", true),
    ]
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
