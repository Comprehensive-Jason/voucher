# Voucher

> Claude: written from 2026-10-05 as a starting point. Step 1 works; the Enforcers do not exist yet.

An app and website blocker for Android and Windows where free time is **earned**, not requested. Finished tasks, workouts, and focused time reading or taking notes earn Vouchers into your Bank. Redeem one and social media and games open for a fixed Unlock; when it ends, everything locks again.

It exists because existing blockers let you switch them off whenever you like, protect themselves by blocking your own settings, and feel like punishment rather than reward.

## How it works

- **Ledger** (runs on a home server): reads your Activity sources, credits Vouchers to the Bank, and signs an Unlock each time you Redeem one.
- **Enforcers** (one per device): block Distractions unless an Unlock is active. They can verify signatures but cannot create them, and they fail closed.
- **Commitment rules**: tightening is instant; loosening waits for the next morning. Nothing can be Redeemed during the nightly Curfew.

The vocabulary is defined in [CONTEXT.md](CONTEXT.md). Design decisions are in [docs/adr](docs/adr).

## Status

| Step | What | State |
| --- | --- | --- |
| 1 | Ledger, Todoist and ClickUp Activity sources, manual CLI Enforcer | Running on sprout; awaiting a live check against real accounts |
| 2 | Android app (Tauri v2 with Kotlin plugins, Device Owner) | Spike next: Tauri + Device Owner on an emulator |
| 3 | Windows app (same Tauri project) and Enforcer service | Not started |
| 4 | Focused time (Moon+ Reader, Readwise Reader, Obsidian) and exercise (Health Connect) Activity sources | Not started |
| 5 | Tamper-hardening | Not started |

## Layout

```
crates/
  voucher-protocol/   Unlock format and signature checking, shared by Ledger and Rust Enforcers
  voucher-ledger/     the Ledger
  voucher-cli/        manual Enforcer for step 1
docs/adr/             decision records
```

## Building

Needs a Rust toolchain ([rustup](https://rustup.rs)).

```sh
cargo test
cargo build --release
```

## Running the Ledger

`voucher-ledger` is configured with environment variables:

| Variable | Meaning | Default |
| --- | --- | --- |
| `VOUCHER_DATA_DIR` | Where `state.json`, `signing.key`, and `public.key` live | `data` |
| `VOUCHER_LISTEN` | Address to listen on; use the machine's Tailscale IP | `127.0.0.1:8787` |
| `VOUCHER_POLL_MINUTES` | How often to check Activity sources | `5` |
| `VOUCHER_TODOIST_TOKEN_FILE` | File holding a Todoist API token | Todoist off |
| `VOUCHER_TODOIST_EXCLUDED_PROJECTS` | Comma-separated project IDs that never earn (Leisure) | none |
| `VOUCHER_CLICKUP_TOKEN_FILE` | File holding a ClickUp personal API token | ClickUp off |
| `VOUCHER_CLICKUP_TEAM_ID` | ClickUp Workspace ID | ClickUp off |
| `VOUCHER_CLICKUP_USER_ID` | Your ClickUp user ID; only tasks assigned to it earn | ClickUp off |

On first run it creates `signing.key` (readable only by its owner) and `public.key`. Copy `public.key` to every Enforcer; `signing.key` never leaves the server. Keep token files private too (`chmod 600`).

Endpoints: `GET /status`, `GET /unlock`, `POST /redeem`, and `POST /change` (body is a Change, e.g. `{"UnlockMinutes": 15}`). Tightenings apply at once; Loosenings wait for the Morning boundary.

## The CLI

```sh
export VOUCHER_LEDGER=http://<ledger-address>:8787
export VOUCHER_PUBLIC_KEY=/path/to/public.key
voucher-cli status
voucher-cli redeem
voucher-cli set unlock-minutes 15      # also: bank-limit 20, curfew 22:30 06:00
voucher-cli check                      # the manual Enforcer: UNLOCKED or BLOCKED
```

`check` caches the last Unlock, so it keeps working when the Ledger is unreachable, until that Unlock runs out.

## Licence

GPL-3.0. See [LICENSE](LICENSE).
