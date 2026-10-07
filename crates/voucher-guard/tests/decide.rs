use ed25519_dalek::SigningKey;
use jiff::Timestamp;
use serde_json::json;
use voucher_guard::{decide, is_distraction, label_for, policies};
use voucher_protocol::{Unlock, sign};

fn key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

fn status(unlock_ends: Option<&str>, released: &[&str]) -> serde_json::Value {
    let unlock = unlock_ends
        .map(|end| json!({ "wire": sign(&Unlock { ends_at: at(end).as_second() }, &key()) }));
    json!({
        "unlock": unlock,
        "settings": {
            "time_zone": "America/Los_Angeles",
            "curfew_start": "22:00:00",
            "curfew_end": "06:00:00",
            "released_devices": released,
            "blocklists": { "games": { "apps": [
                { "package": "win:steam.exe", "label": "Steam" },
                { "package": "category:game", "label": "Every game" }
            ] } }
        },
        "blocked": {
            "apps": ["category:game", "win:steam.exe", "com.instagram.android"],
            "sites": ["youtube.com", "list:invidious", "inv.nadeko.net"]
        }
    })
}

#[test]
fn without_an_unlock_distractions_are_blocked() {
    let d = decide(
        &status(None, &[]),
        &key().verifying_key(),
        "laptop",
        at("2026-10-07T12:00-07:00"),
    );

    assert!(!d.allowed);
    assert_eq!(d.programs, vec!["steam.exe"]);
    assert_eq!(d.sites, vec!["youtube.com", "inv.nadeko.net"]);
}

#[test]
fn a_genuine_unlock_allows_them_until_it_ends() {
    let s = status(Some("2026-10-07T12:10-07:00"), &[]);

    assert!(
        decide(
            &s,
            &key().verifying_key(),
            "laptop",
            at("2026-10-07T12:05-07:00")
        )
        .allowed
    );
    assert!(
        !decide(
            &s,
            &key().verifying_key(),
            "laptop",
            at("2026-10-07T12:10-07:00")
        )
        .allowed
    );
}

#[test]
fn an_unlock_signed_by_another_key_is_ignored() {
    let s = status(Some("2026-10-07T12:10-07:00"), &[]);
    let stranger = SigningKey::from_bytes(&[9; 32]).verifying_key();

    assert!(!decide(&s, &stranger, "laptop", at("2026-10-07T12:05-07:00")).allowed);
}

#[test]
fn curfew_blocks_even_with_an_unlock_and_a_released_device_is_never_blocked() {
    let late = at("2026-10-07T23:00-07:00");
    let s = status(Some("2026-10-07T23:30-07:00"), &[]);
    let d = decide(&s, &key().verifying_key(), "laptop", late);
    assert!(d.curfew && !d.allowed);

    let released = decide(
        &status(None, &["laptop"]),
        &key().verifying_key(),
        "laptop",
        late,
    );
    assert!(released.allowed);
}

#[test]
fn listed_programs_and_anything_in_a_game_folder_are_distractions() {
    let d = decide(
        &status(None, &[]),
        &key().verifying_key(),
        "laptop",
        at("2026-10-07T12:00-07:00"),
    );

    assert!(is_distraction(
        "C:\\Program Files (x86)\\Steam\\Steam.exe",
        &d
    ));
    assert!(is_distraction(
        "D:\\SteamLibrary\\steamapps\\common\\Hades\\Hades.exe",
        &d
    ));
    assert!(!is_distraction(
        "C:\\Program Files\\Obsidian\\Obsidian.exe",
        &d
    ));
    assert_eq!(
        label_for("C:\\Program Files (x86)\\Steam\\steam.exe", &d),
        "Steam"
    );
    assert_eq!(
        label_for("D:\\SteamLibrary\\steamapps\\common\\Hades\\Hades.exe", &d),
        "Hades"
    );
}

#[test]
fn browser_policy_lists_sites_while_blocked_and_is_cleared_while_allowed() {
    let blocked = decide(
        &status(None, &[]),
        &key().verifying_key(),
        "laptop",
        at("2026-10-07T12:00-07:00"),
    );
    let chrome = &policies(&blocked)[0];
    assert_eq!(
        chrome.values[0],
        ("1".to_string(), "youtube.com".to_string())
    );
    let firefox = &policies(&blocked)[3];
    assert_eq!(
        firefox.values[1],
        ("2".to_string(), "*://*.youtube.com/*".to_string())
    );

    let allowed = decide(
        &status(None, &["laptop"]),
        &key().verifying_key(),
        "laptop",
        at("2026-10-07T12:00-07:00"),
    );
    assert!(policies(&allowed).iter().all(|p| p.values.is_empty()));
}
