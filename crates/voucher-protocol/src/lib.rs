//! The wire format shared by the Ledger and every Enforcer: what an Unlock
//! contains and how its signature is checked. Enforcers only ever hold the
//! public (verifying) key, so they can check Unlocks but never create them.

use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use ed25519_dalek::{Signature, Signer, SigningKey, VerifyingKey};
use serde::{Deserialize, Serialize};

/// A window during which Distractions are allowed.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Unlock {
    /// When the Unlock ends, in Unix seconds.
    pub ends_at: i64,
}

/// Why an Enforcer refused an Unlock.
#[derive(Debug, Clone, PartialEq, Eq)]
pub enum Rejection {
    /// Not in the `<payload>.<signature>` shape at all.
    Malformed,
    /// The signature does not match: edited, or not signed by the Ledger.
    BadSignature,
    /// Genuine, but its time is up.
    Expired,
}

/// Signs an Unlock into its wire form: `<payload>.<signature>`, both base64url.
pub fn sign(unlock: &Unlock, key: &SigningKey) -> String {
    let payload = serde_json::to_vec(unlock).expect("an Unlock always serializes");
    let signature = key.sign(&payload);
    format!(
        "{}.{}",
        URL_SAFE_NO_PAD.encode(&payload),
        URL_SAFE_NO_PAD.encode(signature.to_bytes())
    )
}

/// Checks an Unlock's wire form and returns the Unlock if it is genuine.
pub fn verify(wire: &str, key: &VerifyingKey, now: i64) -> Result<Unlock, Rejection> {
    let (payload, signature) = wire.split_once('.').ok_or(Rejection::Malformed)?;
    let payload = URL_SAFE_NO_PAD
        .decode(payload)
        .map_err(|_| Rejection::Malformed)?;
    let signature = URL_SAFE_NO_PAD
        .decode(signature)
        .map_err(|_| Rejection::Malformed)?;
    let signature = Signature::from_slice(&signature).map_err(|_| Rejection::Malformed)?;
    key.verify_strict(&payload, &signature)
        .map_err(|_| Rejection::BadSignature)?;
    let unlock: Unlock = serde_json::from_slice(&payload).map_err(|_| Rejection::Malformed)?;
    if now >= unlock.ends_at {
        return Err(Rejection::Expired);
    }
    Ok(unlock)
}
