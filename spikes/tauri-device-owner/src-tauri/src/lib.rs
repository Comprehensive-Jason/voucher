//! SPIKE (ADR 0006): can a Tauri v2 app be Android Device Owner and suspend apps?
//! The web page calls two Rust commands; on Android they forward to the Kotlin
//! DpmPlugin through Tauri's mobile plugin bridge.

use serde_json::{Value, json};
use tauri::{Manager, State, Wry, plugin::PluginHandle};

struct Dpm(PluginHandle<Wry>);

#[tauri::command]
fn dpm_status(dpm: State<'_, Dpm>) -> Result<Value, String> {
    dpm.0.run_mobile_plugin("status", ()).map_err(|e| e.to_string())
}

#[tauri::command]
fn dpm_suspend(dpm: State<'_, Dpm>, pkg: String, suspended: bool) -> Result<Value, String> {
    dpm.0
        .run_mobile_plugin("suspend", json!({ "pkg": pkg, "suspended": suspended }))
        .map_err(|e| e.to_string())
}

#[tauri::command]
fn dpm_support_message(dpm: State<'_, Dpm>) -> Result<Value, String> {
    dpm.0.run_mobile_plugin("supportMessage", ()).map_err(|e| e.to_string())
}

fn dpm_plugin() -> tauri::plugin::TauriPlugin<Wry> {
    tauri::plugin::Builder::new("dpm")
        .setup(|app, api| {
            let handle = api.register_android_plugin("io.github.comprehensivejason.voucher.spike", "DpmPlugin")?;
            app.manage(Dpm(handle));
            Ok(())
        })
        .build()
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(dpm_plugin())
        .invoke_handler(tauri::generate_handler![dpm_status, dpm_suspend, dpm_support_message])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
