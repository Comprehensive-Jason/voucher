//! The Windows Enforcer's rules, kept free of Windows calls so they can be
//! tested anywhere. Given the Ledger's latest status, `decide` says whether
//! Distractions are allowed right now; `is_distraction` says whether a
//! running program is one; `policies` says what browser policy to write.

use ed25519_dalek::VerifyingKey;
use jiff::{Timestamp, civil::Time, tz::TimeZone};
use serde::Serialize;
use serde_json::Value;

/// What the Enforcer should do right now.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Decision {
    /// Distractions are allowed: a genuine Unlock is running outside Curfew,
    /// or this device has been released.
    pub allowed: bool,
    pub curfew: bool,
    pub released: bool,
    /// When the running Unlock ends, in Unix seconds.
    pub unlock_ends_at: Option<i64>,
    /// Blocked program file names, lowercased (`steam.exe`).
    pub programs: Vec<String>,
    /// Names to show for blocked programs, by lowercased file name.
    pub labels: Vec<(String, String)>,
    /// "Every game" is on: programs in game folders are Distractions.
    pub games: bool,
    /// Blocked domains; maintained lists arrive already expanded.
    pub sites: Vec<String>,
}

/// Works out the decision from the Ledger's `/status` reply. Anything
/// missing or doubtful decides for blocking.
pub fn decide(status: &Value, key: &VerifyingKey, device: &str, now: Timestamp) -> Decision {
    let settings = &status["settings"];
    let zone = settings["time_zone"]
        .as_str()
        .and_then(|z| TimeZone::get(z).ok())
        .unwrap_or_else(TimeZone::system);
    let time = |field: &str, fallback: Time| {
        settings[field]
            .as_str()
            .and_then(|t| t.parse::<Time>().ok())
            .unwrap_or(fallback)
    };
    let start = time("curfew_start", Time::constant(22, 0, 0, 0));
    let end = time("curfew_end", Time::constant(6, 0, 0, 0));
    let local = now.to_zoned(zone).time();
    // Curfew usually crosses midnight: "after the start or before the end".
    let curfew = if start <= end {
        local >= start && local < end
    } else {
        local >= start || local < end
    };
    let unlock_ends_at = status["unlock"]["wire"]
        .as_str()
        .and_then(|wire| voucher_protocol::verify(wire, key, now.as_second()).ok())
        .map(|unlock| unlock.ends_at);
    let released = settings["released_devices"]
        .as_array()
        .is_some_and(|devices| devices.iter().any(|d| d.as_str() == Some(device)));

    let mut programs = Vec::new();
    let mut games = false;
    for entry in status["blocked"]["apps"].as_array().into_iter().flatten() {
        match entry.as_str() {
            Some("category:game") => games = true,
            Some(app) => {
                if let Some(program) = app.strip_prefix("win:") {
                    programs.push(program.to_lowercase());
                }
            }
            None => {}
        }
    }
    let mut labels = Vec::new();
    for list in settings["blocklists"]
        .as_object()
        .into_iter()
        .flat_map(|l| l.values())
    {
        for app in list["apps"].as_array().into_iter().flatten() {
            if let (Some(package), Some(label)) = (app["package"].as_str(), app["label"].as_str())
                && let Some(program) = package.strip_prefix("win:")
            {
                labels.push((program.to_lowercase(), label.to_string()));
            }
        }
    }
    let sites = status["blocked"]["sites"]
        .as_array()
        .into_iter()
        .flatten()
        .filter_map(Value::as_str)
        .filter(|s| !s.starts_with("list:"))
        .map(String::from)
        .collect();
    Decision {
        allowed: released || (unlock_ends_at.is_some() && !curfew),
        curfew,
        released,
        unlock_ends_at,
        programs,
        labels,
        games,
        sites,
    }
}

/// Folders that only hold games, as found in program paths (lowercased).
const GAME_FOLDERS: &[&str] = &[
    "\\steamapps\\common\\",
    "\\epic games\\",
    "\\gog galaxy\\games\\",
    "\\xboxgames\\",
    "\\riot games\\",
    "\\ubisoft game launcher\\games\\",
    "\\ea games\\",
    "\\battle.net\\games\\",
];

/// Whether a running program, by its full path, is a Distraction.
pub fn is_distraction(path: &str, decision: &Decision) -> bool {
    let path = path.to_lowercase().replace('/', "\\");
    let name = path.rsplit('\\').next().unwrap_or(&path);
    decision.programs.iter().any(|p| p == name)
        || (decision.games && GAME_FOLDERS.iter().any(|folder| path.contains(folder)))
}

/// The name to show for a blocked program.
pub fn label_for(path: &str, decision: &Decision) -> String {
    let lower = path.to_lowercase().replace('/', "\\");
    let name = lower.rsplit('\\').next().unwrap_or(&lower);
    decision
        .labels
        .iter()
        .find(|(program, _)| program == name)
        .map(|(_, label)| label.clone())
        .unwrap_or_else(|| {
            let original = path.rsplit(['\\', '/']).next().unwrap_or(path);
            original
                .trim_end_matches(".exe")
                .trim_end_matches(".EXE")
                .to_string()
        })
}

/// One registry key under HKEY_LOCAL_MACHINE and the string values it
/// should hold. An empty list means the key should be deleted.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Policy {
    pub key: &'static str,
    pub values: Vec<(String, String)>,
}

/// Browser policy for the decision: a site blocklist for Chrome, Brave, and
/// Edge (Chromium's URLBlocklist) and Firefox (WebsiteFilter), or none while
/// Distractions are allowed.
pub fn policies(decision: &Decision) -> Vec<Policy> {
    let block = !decision.allowed;
    let chromium = |key| Policy {
        key,
        values: if block {
            numbered(decision.sites.iter().cloned())
        } else {
            Vec::new()
        },
    };
    vec![
        chromium("SOFTWARE\\Policies\\Google\\Chrome\\URLBlocklist"),
        chromium("SOFTWARE\\Policies\\BraveSoftware\\Brave\\URLBlocklist"),
        chromium("SOFTWARE\\Policies\\Microsoft\\Edge\\URLBlocklist"),
        Policy {
            key: "SOFTWARE\\Policies\\Mozilla\\Firefox\\WebsiteFilter\\Block",
            values: if block {
                // Firefox matches URL patterns, so each domain needs both its bare and subdomain forms.
                numbered(
                    decision
                        .sites
                        .iter()
                        .flat_map(|s| [format!("*://{s}/*"), format!("*://*.{s}/*")]),
                )
            } else {
                Vec::new()
            },
        },
    ]
}

/// Policy lists are registry values named "1", "2", and so on.
fn numbered(items: impl Iterator<Item = String>) -> Vec<(String, String)> {
    items
        .enumerate()
        .map(|(i, item)| ((i + 1).to_string(), item))
        .collect()
}
