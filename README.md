# Voucher

> Claude: scaffold written 2026-10-05 as a starting point. Nothing here works yet.

An app and website blocker for Android and Windows where unlocked time is **earned**, not requested. Distractions stay blocked until verified productive work (finished tasks, reading, notes, exercise) adds minutes to your Balance, which you spend on short Vouchers.

It exists because existing blockers let you switch them off whenever you like, protect themselves by blocking your own settings, and feel like punishment rather than reward.

## How it works

- **Ledger** (runs on a home server): reads your Activity sources, keeps the Balance, and signs short-lived Vouchers.
- **Enforcers** (one per device): block Distractions unless they hold a valid Voucher. They can verify signatures but cannot create them, and they fail closed.
- **Commitment rules**: tightening is instant; loosening waits for the next morning. No Vouchers are issued during the nightly Curfew.

The vocabulary is defined in [CONTEXT.md](CONTEXT.md). Design decisions are in [docs/adr](docs/adr).

## Status

| Step | What | State |
| --- | --- | --- |
| 1 | Ledger, Todoist Activity source, manual CLI Enforcer | Not started |
| 2 | Android Enforcer (Kotlin, Device Owner) | Not started |
| 3 | Windows Enforcer | Not started |
| 4 | Readwise, Obsidian, and exercise Activity sources | Not started |
| 5 | Tamper-hardening | Not started |

## Layout

```
crates/
  voucher-protocol/   Voucher format and signature checking, shared by Ledger and Rust Enforcers
  voucher-ledger/     the Ledger
  voucher-cli/        manual Enforcer for step 1
docs/adr/             decision records
```

## Building

Needs a Rust toolchain ([rustup](https://rustup.rs)).

```sh
cargo build
cargo run -p voucher-cli
```

## Licence

GPL-3.0. See [LICENSE](LICENSE).
