//! The wire format shared by the Ledger and every Enforcer: what a Voucher
//! contains and how its signature is checked. Enforcers depend on this crate
//! alone; they never get the signing key.
