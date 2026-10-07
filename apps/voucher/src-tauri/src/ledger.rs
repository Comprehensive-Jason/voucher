//! A small client for the Ledger's HTTP endpoints.

use std::time::Duration;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use jiff::Timestamp;
use serde::Deserialize;

use crate::{Today, sources};

pub struct Client {
    base: String,
    key: VerifyingKey,
    agent: ureq::Agent,
}

/// The parts of the Ledger's `GET /status` the app reads.
#[derive(Deserialize)]
struct Status {
    bank: u32,
    curfew_active: bool,
    unlock: Option<Redeemed>,
    settings: Settings,
    today: Score,
}

/// The current Day's score.
#[derive(Deserialize)]
struct Score {
    earned: u32,
    goal: u32,
    streak: u32,
    by_source: std::collections::BTreeMap<String, u32>,
}

#[derive(Deserialize)]
struct Redeemed {
    wire: String,
}

#[derive(Deserialize)]
struct Settings {
    bank_limit: u32,
    unlock_minutes: u32,
    curfew_start: String,
    curfew_end: String,
}

impl Client {
    pub fn new(base: &str, public_key: &str) -> Result<Self, String> {
        if base.is_empty() || public_key.is_empty() {
            return Err("Not connected to a Ledger yet: this build has no Ledger address.".into());
        }
        let bytes: [u8; 32] = URL_SAFE_NO_PAD
            .decode(public_key)
            .map_err(|e| format!("public key: {e}"))?
            .try_into()
            .map_err(|_| "public key is not 32 bytes".to_string())?;
        let key = VerifyingKey::from_bytes(&bytes).map_err(|e| format!("public key: {e}"))?;
        let agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(5)))
            .build()
            .into();
        Ok(Client {
            base: base.trim_end_matches('/').to_string(),
            key,
            agent,
        })
    }

    pub fn today(&self) -> Result<Today, String> {
        let body = self
            .agent
            .get(format!("{}/status", self.base))
            .call()
            .map_err(|e| format!("Can't reach the Ledger: {e}"))?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        let status: Status = serde_json::from_str(&body).map_err(|e| format!("Unexpected Ledger reply: {e}"))?;
        let now = Timestamp::now().as_second();
        // Trust an Unlock only if its signature is the Ledger's and it hasn't ended.
        let unlock_ends_at = status
            .unlock
            .and_then(|u| voucher_protocol::verify(&u.wire, &self.key, now).ok())
            .map(|u| u.ends_at);
        Ok(Today {
            bank: status.bank,
            bank_limit: status.settings.bank_limit,
            unlock_minutes: status.settings.unlock_minutes,
            unlock_ends_at,
            curfew_active: status.curfew_active,
            curfew_start: hhmm(&status.settings.curfew_start),
            curfew_end: hhmm(&status.settings.curfew_end),
            goal_done: status.today.earned,
            goal_target: status.today.goal,
            streak_days: status.today.streak,
            sources: sources(status.today.by_source.values().sum()),
        })
    }

    /// Sends any other request to the Ledger and returns its JSON reply. Used
    /// for reads and setting changes, where there is no Unlock to verify.
    pub fn call(&self, method: &str, path: &str, body: Option<&str>) -> Result<serde_json::Value, String> {
        let url = format!("{}{path}", self.base);
        let reply = match (method, body) {
            ("GET", _) => self.agent.get(&url).call(),
            ("POST", Some(body)) => self
                .agent
                .post(&url)
                .header("Content-Type", "application/json")
                .send(body),
            ("POST", None) => self.agent.post(&url).send_empty(),
            _ => return Err(format!("unsupported method {method}")),
        };
        let text = reply
            .map_err(|e| match e {
                ureq::Error::StatusCode(code) => format!("The Ledger refused this ({code})"),
                e => format!("Can't reach the Ledger: {e}"),
            })?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| format!("Unexpected Ledger reply: {e}"))
    }

    /// Tears `count` tickets in one go: all of them, or none if the Bank is short.
    pub fn redeem(&self, count: u32) -> Result<(), String> {
        let mut response = self
            .agent
            .post(format!("{}/redeem?count={count}", self.base))
            .send_empty()
            .map_err(|e| match e {
                ureq::Error::StatusCode(409) => "Refused by the Ledger".to_string(),
                e => format!("Can't reach the Ledger: {e}"),
            })?;
        let _ = response.body_mut().read_to_string();
        Ok(())
    }
}

/// "22:00:00" to "22:00".
fn hhmm(time: &str) -> String {
    time.get(..5).unwrap_or(time).to_string()
}
