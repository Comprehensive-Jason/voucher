//! The Voucher app's Rust side: the bridge between the interface and the Ledger.
//!
//! The interface calls two commands. `today` fetches everything the Today
//! screen shows; `tear` Redeems tickets. Every Unlock the Ledger hands back is
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
    /// Values the Ledger cannot provide yet. The screen is built against them
    /// so it is ready when the Ledger learns them; the interface marks them.
    pub sample: Sample,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Sample {
    pub goal_done: u32,
    pub goal_target: u32,
    pub streak_days: u32,
    pub sources: Vec<SourceProgress>,
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SourceProgress {
    pub name: &'static str,
    pub detail: &'static str,
    /// 0.0 to 1.0 toward the next Voucher.
    pub progress: f32,
    pub color: &'static str,
}

fn sample() -> Sample {
    let s = |name, detail, progress, color| SourceProgress { name, detail, progress, color };
    Sample {
        goal_done: 11,
        goal_target: 16,
        streak_days: 4,
        sources: vec![
            s("Tasks", "+1 each · 7 today", 1.0, "#5b9cff"),
            s("Obsidian", "18 / 30 min", 0.6, "#b08cff"),
            s("Workout", "9 / 15 zone min", 0.6, "#ff8a5c"),
            s("Readwise Reader", "22 / 30 min", 0.73, "#ffd166"),
            s("Moon+ Reader", "9 / 30 min", 0.3, "#e0a82e"),
            s("Anki", "6 / 30 min", 0.2, "#ff6fa8"),
        ],
    }
}

#[tauri::command]
async fn today() -> Result<Today, String> {
    tauri::async_runtime::spawn_blocking(|| ledger::Client::new(LEDGER_URL, LEDGER_PUBLIC_KEY)?.today())
        .await
        .map_err(|e| e.to_string())?
}

/// Redeems `count` tickets, one after another; each extends the Unlock.
#[tauri::command]
async fn tear(count: u32) -> Result<Today, String> {
    tauri::async_runtime::spawn_blocking(move || {
        let client = ledger::Client::new(LEDGER_URL, LEDGER_PUBLIC_KEY)?;
        for _ in 0..count {
            client.redeem()?;
        }
        client.today()
    })
    .await
    .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .invoke_handler(tauri::generate_handler![today, tear])
        .run(tauri::generate_context!())
        .expect("error while running the Voucher app");
}
