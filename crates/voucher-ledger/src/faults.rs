//! Test-only fault switches, so every error the app can show can be made to
//! appear on demand. Only a test Ledger (VOUCHER_TEST_TASKS=1) can turn them
//! on, through `POST /test/fault`; they live in memory and reset on restart.
//! `/test/*` routes are never affected, so a fault can always be turned off.

use std::collections::{BTreeMap, BTreeSet};

/// One way a test Ledger can misbehave.
#[derive(Clone, Copy, Debug, PartialEq, Eq, PartialOrd, Ord)]
pub enum Fault {
    /// Every request answers 401, as if the access code were wrong.
    Unauthorized,
    /// `GET /status` and `/day` answer 200 with a body that isn't JSON.
    Garbled,
    /// `POST /change` answers 400.
    RefuseChanges,
    /// `POST /redeem` answers 409.
    RefuseTear,
    /// `POST /marker` answers 500.
    FailMarker,
    /// `GET /export/days.csv` and `/export.json` answer 500.
    FailExport,
    /// The status reports every Tasks service as needing a new token.
    Token,
}

impl Fault {
    pub const ALL: [Fault; 7] = [
        Fault::Unauthorized,
        Fault::Garbled,
        Fault::RefuseChanges,
        Fault::RefuseTear,
        Fault::FailMarker,
        Fault::FailExport,
        Fault::Token,
    ];

    /// The name `/test/fault?mode=` takes.
    pub fn name(self) -> &'static str {
        match self {
            Fault::Unauthorized => "unauthorized",
            Fault::Garbled => "garbled",
            Fault::RefuseChanges => "refuse-changes",
            Fault::RefuseTear => "refuse-tear",
            Fault::FailMarker => "fail-marker",
            Fault::FailExport => "fail-export",
            Fault::Token => "token",
        }
    }

    pub fn parse(name: &str) -> Option<Fault> {
        Fault::ALL.into_iter().find(|f| f.name() == name)
    }
}

/// The problem text the app reads as "needs a new token" (`needsToken()`).
pub const TOKEN_PROBLEM: &str = "sign-in expired";

/// The faults that are on.
#[derive(Debug, Default)]
pub struct Faults(BTreeSet<Fault>);

impl Faults {
    pub const fn new() -> Faults {
        Faults(BTreeSet::new())
    }

    pub fn set(&mut self, fault: Fault, on: bool) {
        if on {
            self.0.insert(fault);
        } else {
            self.0.remove(&fault);
        }
    }

    pub fn is_on(&self, fault: Fault) -> bool {
        self.0.contains(&fault)
    }

    /// The names of the faults that are on.
    pub fn names(&self) -> Vec<&'static str> {
        self.0.iter().map(|f| f.name()).collect()
    }

    /// The status and body a fault forces on this request, if any.
    /// `/test/*` always goes through, and so does `/key`, which a real
    /// Ledger also serves without the access code.
    pub fn reply(&self, method: &str, path: &str) -> Option<(u16, String)> {
        if path.starts_with("/test/") {
            return None;
        }
        let message = |text: &str| serde_json::json!({ "message": text }).to_string();
        let on = |fault| self.is_on(fault);
        match (method, path) {
            (_, "/key") => None,
            _ if on(Fault::Unauthorized) => Some((401, message("access code missing or wrong"))),
            ("GET", "/status" | "/day") if on(Fault::Garbled) => {
                Some((200, "<html>garbled reply (test fault)".into()))
            }
            ("POST", "/change") if on(Fault::RefuseChanges) => {
                Some((400, message("Refused (test fault)")))
            }
            ("POST", "/redeem") if on(Fault::RefuseTear) => {
                Some((409, message("Refused (test fault)")))
            }
            ("POST", "/marker") if on(Fault::FailMarker) => {
                Some((500, message("Marker not saved (test fault)")))
            }
            ("GET", "/export/days.csv" | "/export.json") if on(Fault::FailExport) => {
                Some((500, message("Export failed (test fault)")))
            }
            _ => None,
        }
    }

    /// The status's `source_errors`, with every Tasks service (`services`)
    /// reported as needing a new token while the `token` fault is on.
    pub fn source_errors(
        &self,
        mut errors: BTreeMap<String, String>,
        services: impl IntoIterator<Item = String>,
    ) -> BTreeMap<String, String> {
        if self.is_on(Fault::Token) {
            for service in services {
                errors.insert(service, TOKEN_PROBLEM.into());
            }
        }
        errors
    }
}
