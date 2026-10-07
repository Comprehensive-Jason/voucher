//! Which Ledger this device talks to, saved in the app's data folder by
//! first-run setup. A development build can also carry one from build time.

use std::{fs, path::PathBuf};

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Manager};

#[derive(Serialize, Deserialize, Clone)]
pub struct Connection {
    pub url: String,
    /// The Ledger's public key, base64url, learned when first connecting.
    pub key: String,
}

fn file(app: &AppHandle) -> Option<PathBuf> {
    Some(app.path().app_data_dir().ok()?.join("ledger.json"))
}

/// The saved connection, or the build-time one, or none.
pub fn load(app: &AppHandle) -> Option<Connection> {
    let saved = file(app)
        .and_then(|f| fs::read_to_string(f).ok())
        .and_then(|text| serde_json::from_str(&text).ok());
    saved.or_else(|| {
        let (url, key) = (crate::LEDGER_URL, crate::LEDGER_PUBLIC_KEY);
        (!url.is_empty() && !key.is_empty()).then(|| Connection {
            url: url.into(),
            key: key.into(),
        })
    })
}

pub fn save(app: &AppHandle, connection: &Connection) -> Result<(), String> {
    let path = file(app).ok_or("no app data folder")?;
    fs::create_dir_all(path.parent().expect("a file has a folder")).map_err(|e| e.to_string())?;
    fs::write(path, serde_json::to_string(connection).expect("serializes")).map_err(|e| e.to_string())
}
