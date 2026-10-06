# The Ledger signs Unlocks; Enforcers can only verify them

One Ledger on Spruce holds an Ed25519 signing key. When a Voucher is Redeemed, it signs a short-lived Unlock. Enforcers ship only the public key, so a tampered or reinstalled Enforcer still cannot create free time. Enforcers fail closed: with no valid Unlock, Distractions stay blocked, even if the Ledger is unreachable. Enforcers share the protocol, not code, so each platform's Enforcer can be written in whatever language that platform needs.

## Consequences

- If Spruce is down, everything stays blocked. The Break-glass code exists for that case.
