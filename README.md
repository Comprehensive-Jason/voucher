# Voucher

> Claude: written from 2026-10-05 as a starting point. The Ledger and the Android app work; Windows is not started.

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
| 1 | Ledger, Todoist and ClickUp Activity sources, manual CLI Enforcer | Running on sprout against real accounts |
| 2 | Android app (Tauri v2 with Kotlin plugins, Device Owner): phone and tablet layouts, blocked-app screen, notification, tile, widgets | Working on an emulator; first real device next |
| 3 | Windows app (same Tauri project) and Enforcer service | Not started |
| 4 | Focused time (usage stats) and exercise (Health Connect) Activity sources | Built; Focused time checked on an emulator |
| 5 | Tamper-hardening | Device Owner suspension, no force-stop or data clearing, fail-closed |

## Installing on Android

Voucher needs Android 13 or later, a Ledger reachable over Tailscale, and a computer with ADB for one step.

1. Install the APK and open Voucher. Setup starts by itself.
2. **Connect to your Ledger.** Enter its address (`http://<tailscale-ip>:8787`). Voucher fetches the Ledger's public key; check that its first characters match the start of the Ledger's `public.key`.
3. **App blocking (Device Owner).** Android allows this only while no accounts and no other users exist, but nothing is erased:
   1. Turn on USB debugging. On Samsung, turn off Auto Blocker first.
   2. `adb shell pm list users` must list only user 0. Delete Secure Folder, Dual Messenger, and any work profile or private space first.
   3. `adb shell dumpsys account | grep "Account {"` lists the accounts. Freeze each account's app with `adb shell pm disable-user --user 0 <package>`; remove a Google account in Settings instead. Don't sign out of a Samsung account: that deletes Samsung Wallet cards. Wait ten seconds.
   4. `adb shell dpm set-device-owner io.github.comprehensivejason.voucher/.VoucherAdminReceiver`
   5. `adb shell pm enable <package>` for each app you froze, and add back any account you removed.
4. **Usage access** and the **blocked-app screen** (an accessibility service) are switched on from Setup's buttons. Health Connect is optional, for the Workout source.
5. Pick sources, blocklists, and starting limits. Until "Start Voucher", changes apply at once; after it, anything that loosens a rule waits for 06:00.

To leave, release the device in Rules, Protection. Like any Loosening it waits for 06:00; then Voucher lifts every block, gives up Device Owner, and can be uninstalled.

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
