//! The step-1 command line: talks to the Ledger, and doubles as a manual
//! Enforcer (`check`) that proves the fail-closed loop before any real
//! Enforcer exists.
//!
//!   voucher-cli status
//!   voucher-cli redeem
//!   voucher-cli set unlock-minutes 15 | bank-limit 20 | curfew 22:30 06:00
//!   voucher-cli check
//!
//! VOUCHER_LEDGER is the Ledger's address (default http://127.0.0.1:8787).
//! VOUCHER_PUBLIC_KEY is the path to the Ledger's public.key.

use std::{env, fs, path::PathBuf, process::ExitCode, time::Duration};

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use jiff::{Timestamp, tz::TimeZone};
use serde_json::{Value, json};
use voucher_protocol::verify;

fn main() -> ExitCode {
    let args: Vec<String> = env::args().skip(1).collect();
    let args: Vec<&str> = args.iter().map(String::as_str).collect();
    let result = match args.as_slice() {
        ["status"] => status(),
        ["redeem"] => redeem(),
        ["set", "unlock-minutes", n] => change(json!({ "UnlockMinutes": n.parse::<u32>().ok() })),
        ["set", "bank-limit", n] => change(json!({ "BankLimit": n.parse::<u32>().ok() })),
        ["set", "curfew", start, end] => change(json!({
            "Curfew": { "start": format!("{start}:00"), "end": format!("{end}:00") }
        })),
        ["check"] => check(),
        _ => Err("usage: voucher-cli status | redeem | set <setting> <value> | check".into()),
    };
    match result {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{error}");
            ExitCode::FAILURE
        }
    }
}

type Outcome = Result<(), Box<dyn std::error::Error>>;

fn ledger_url(path: &str) -> String {
    let base = env::var("VOUCHER_LEDGER").unwrap_or("http://127.0.0.1:8787".into());
    format!("{}{path}", base.trim_end_matches('/'))
}

/// An HTTP client that hands back 4xx bodies (refusals) instead of failing,
/// and gives up quickly when the Ledger is unreachable.
fn agent() -> ureq::Agent {
    ureq::Agent::config_builder()
        .http_status_as_error(false)
        .timeout_global(Some(Duration::from_secs(5)))
        .build()
        .into()
}

fn local(seconds: i64) -> String {
    Timestamp::from_second(seconds)
        .map(|t| t.to_zoned(TimeZone::system()).strftime("%H:%M").to_string())
        .unwrap_or_else(|_| "?".into())
}

fn status() -> Outcome {
    let body = agent()
        .get(ledger_url("/status"))
        .call()?
        .body_mut()
        .read_to_string()?;
    let status: Value = serde_json::from_str(&body)?;
    let settings = &status["settings"];
    println!("Bank: {} of {}", status["bank"], settings["bank_limit"]);
    match status["unlock"]["ends_at"].as_str() {
        Some(ends_at) => println!(
            "Unlocked until {}",
            local(ends_at.parse::<Timestamp>()?.as_second())
        ),
        None => println!("No Unlock running"),
    }
    let hhmm = |v: &Value| {
        v.as_str()
            .unwrap_or("?")
            .get(..5)
            .unwrap_or("?")
            .to_string()
    };
    println!(
        "Unlocks last {} min; Curfew {} to {}",
        settings["unlock_minutes"],
        hhmm(&settings["curfew_start"]),
        hhmm(&settings["curfew_end"])
    );
    for pending in status["pending"].as_array().into_iter().flatten() {
        let when: Timestamp = pending[1].as_str().unwrap_or_default().parse()?;
        println!("Pending until {}: {}", local(when.as_second()), pending[0]);
    }
    Ok(())
}

fn redeem() -> Outcome {
    let mut response = agent().post(ledger_url("/redeem")).send_empty()?;
    let ok = response.status().is_success();
    let body: Value = serde_json::from_str(&response.body_mut().read_to_string()?)?;
    if ok {
        let ends_at: Timestamp = body["ends_at"].as_str().unwrap_or_default().parse()?;
        println!("Redeemed: unlocked until {}", local(ends_at.as_second()));
    } else {
        println!("Refused: {body}");
    }
    Ok(())
}

fn change(change: Value) -> Outcome {
    let mut response = agent().post(ledger_url("/change")).send_json(&change)?;
    let effect: Value = serde_json::from_str(&response.body_mut().read_to_string()?)?;
    match effect["At"].as_str() {
        Some(at) => println!(
            "Loosening: takes effect at the Morning boundary, {}",
            at.parse::<Timestamp>()?
                .to_zoned(TimeZone::system())
                .strftime("%Y-%m-%d %H:%M")
        ),
        None if effect == "Now" => println!("Tightening: applied now"),
        None => println!("{effect}"),
    }
    Ok(())
}

fn cache_path() -> PathBuf {
    let home = env::var("HOME")
        .or_else(|_| env::var("USERPROFILE"))
        .unwrap_or(".".into());
    PathBuf::from(home).join(".cache/voucher/unlock")
}

/// The manual Enforcer. Fetches the current Unlock, falling back to the last
/// one cached if the Ledger is unreachable, and verifies it locally. Being
/// offline can never extend an Unlock: it simply runs out.
fn check() -> Outcome {
    let key_path = env::var("VOUCHER_PUBLIC_KEY")
        .map_err(|_| "set VOUCHER_PUBLIC_KEY to the Ledger's public.key")?;
    let key_bytes: [u8; 32] = URL_SAFE_NO_PAD
        .decode(fs::read_to_string(key_path)?.trim())?
        .try_into()
        .map_err(|_| "public.key is not 32 bytes")?;
    let key = VerifyingKey::from_bytes(&key_bytes)?;
    let cache = cache_path();

    let (wire, source) = match agent().get(ledger_url("/unlock")).call() {
        Ok(mut response) if response.status().is_success() => {
            let body: Value = serde_json::from_str(&response.body_mut().read_to_string()?)?;
            let wire = body["wire"].as_str().unwrap_or_default().to_string();
            fs::create_dir_all(cache.parent().unwrap())?;
            fs::write(&cache, &wire)?;
            (Some(wire), "from the Ledger")
        }
        Ok(_) => {
            let _ = fs::remove_file(&cache);
            (None, "the Ledger says no Unlock is running")
        }
        Err(_) => (
            fs::read_to_string(&cache).ok(),
            "Ledger unreachable, using the cached Unlock",
        ),
    };

    let now = Timestamp::now().as_second();
    match wire.map(|wire| verify(&wire, &key, now)) {
        Some(Ok(unlock)) => println!("UNLOCKED until {} ({source})", local(unlock.ends_at)),
        Some(Err(rejection)) => println!("BLOCKED: {rejection:?} ({source})"),
        None => println!("BLOCKED: no Unlock ({source})"),
    }
    Ok(())
}
