//! A small client for the Ledger's HTTP endpoints.

use std::time::Duration;

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::VerifyingKey;
use jiff::Timestamp;
use serde::Deserialize;

use crate::Today;

pub struct Client {
    base: String,
    key: VerifyingKey,
    agent: ureq::Agent,
    /// "Bearer <code>" when the Ledger has an access code.
    auth: Option<String>,
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
    day: String,
    earned: u32,
    goal: u32,
    streak: u32,
    sources: serde_json::Value,
    log: serde_json::Value,
}

#[derive(Deserialize)]
struct Redeemed {
    wire: String,
    /// When this run of stacked Vouchers began, and how many it has torn.
    started_at: Timestamp,
    /// Sent as `tickets`, the old name.
    #[serde(default, rename = "tickets")]
    vouchers: u32,
}

#[derive(Deserialize)]
struct Settings {
    bank_limit: u32,
    unlock_minutes: u32,
    curfew_start: String,
    curfew_end: String,
    blocklists: std::collections::BTreeMap<String, BlocklistName>,
}

#[derive(Deserialize)]
struct BlocklistName {
    name: String,
    on: bool,
}

impl Client {
    /// Asks a Ledger for its public key (`GET /key`).
    pub fn fetch_key(base: &str) -> Result<String, String> {
        let agent: ureq::Agent = ureq::Agent::config_builder()
            .timeout_global(Some(Duration::from_secs(5)))
            .build()
            .into();
        let text = agent
            .get(format!("{base}/key"))
            .call()
            .map_err(|e| format!("Can't reach a Ledger there: {e}"))?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        serde_json::from_str::<String>(&text).map_err(|_| "That address answered, but not like a Ledger.".to_string())
    }

    pub fn new(base: &str, public_key: &str, code: Option<&str>) -> Result<Self, String> {
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
            auth: code.filter(|c| !c.is_empty()).map(|c| format!("Bearer {}", c.trim())),
        })
    }

    fn get(&self, path: &str) -> ureq::RequestBuilder<ureq::typestate::WithoutBody> {
        let request = self.agent.get(format!("{}{path}", self.base));
        match &self.auth {
            Some(auth) => request.header("Authorization", auth),
            None => request,
        }
    }

    fn post(&self, path: &str) -> ureq::RequestBuilder<ureq::typestate::WithBody> {
        let request = self.agent.post(format!("{}{path}", self.base));
        match &self.auth {
            Some(auth) => request.header("Authorization", auth),
            None => request,
        }
    }

    pub fn today(&self) -> Result<Today, String> {
        let body = self
            .get("/status")
            .call()
            .map_err(|e| match e {
                ureq::Error::StatusCode(401) => "The Ledger wants its access code: reconnect in Setup.".to_string(),
                e => format!("Can't reach the Ledger: {e}"),
            })?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        let status: Status = serde_json::from_str(&body).map_err(|e| format!("Unexpected Ledger reply: {e}"))?;
        let now = Timestamp::now().as_second();
        // Trust an Unlock only if its signature is the Ledger's and it hasn't ended.
        let unlock = status
            .unlock
            .and_then(|u| Some((voucher_protocol::verify(&u.wire, &self.key, now).ok()?, u)));
        let unlock_ends_at = unlock.as_ref().map(|(verified, _)| verified.ends_at);
        Ok(Today {
            bank: status.bank,
            bank_limit: status.settings.bank_limit,
            unlock_minutes: status.settings.unlock_minutes,
            unlock_ends_at,
            curfew_active: status.curfew_active,
            curfew_start: hhmm(&status.settings.curfew_start),
            curfew_end: hhmm(&status.settings.curfew_end),
            day: status.today.day,
            goal_done: status.today.earned,
            goal_target: status.today.goal,
            streak_days: status.today.streak,
            sources: status.today.sources,
            log: status.today.log,
            unlock_started_at: unlock.as_ref().map(|(_, u)| u.started_at.as_second()),
            unlock_vouchers: unlock.as_ref().map_or(0, |(_, u)| u.vouchers),
            blocklists: status
                .settings
                .blocklists
                .into_values()
                .filter(|l| l.on)
                .map(|l| l.name)
                .collect(),
        })
    }

    /// Sends any other request to the Ledger and returns its JSON reply. Used
    /// for reads and setting changes, where there is no Unlock to verify.
    pub fn call(&self, method: &str, path: &str, body: Option<&str>) -> Result<serde_json::Value, String> {
        let reply = match (method, body) {
            ("GET", _) => self.get(path).call(),
            ("POST", Some(body)) => self.post(path).header("Content-Type", "application/json").send(body),
            ("POST", None) => self.post(path).send_empty(),
            _ => return Err(format!("unsupported method {method}")),
        };
        let text = reply
            .map_err(|e| match e {
                ureq::Error::StatusCode(401) => "The Ledger wants its access code: reconnect in Setup.".to_string(),
                ureq::Error::StatusCode(code) => format!("The Ledger refused this ({code})"),
                e => format!("Can't reach the Ledger: {e}"),
            })?
            .body_mut()
            .read_to_string()
            .map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| format!("Unexpected Ledger reply: {e}"))
    }

    /// Tears `count` Vouchers in one go: all of them, or none if the Bank is short.
    pub fn redeem(&self, count: u32) -> Result<(), String> {
        let mut response = self
            .post(&format!("/redeem?count={count}"))
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
