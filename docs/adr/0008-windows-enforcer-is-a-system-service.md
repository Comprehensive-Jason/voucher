# The Windows Enforcer is a SYSTEM service; the app only shows and measures

On Windows, blocking is done by voucher-guard, a Rust service running as SYSTEM: it closes blocked programs and writes the site blocklist as browser policy (Chromium's URLBlocklist for Chrome, Brave, and Edge; WebsiteFilter for Firefox). The Voucher app, running in the user's session, only shows things (the tray pop-up and the "paused" window) and measures Focused time, which it reads from ActivityWatch rather than tracking windows itself.

## Considered Options

- Blocking from the user-session app: rejected because the user can end it from Task Manager in a second.
- A per-user scheduled task: rejected for the same reason, and it cannot write machine-wide browser policy.
- Our own window tracker for Focused time: rejected because ActivityWatch already runs on Jason's PC, handles idle time, and has a local API.

## Consequences

- An administrator can stop any service, so on an administrator account the guard only detects tampering: it checks in every minute, and a silence becomes a Gap in the Log. Using Windows from a standard account, with a separate administrator account, makes it hold. That account split is the user's choice, not something the installer does.
- The guard takes its Ledger connection once, from setup, and keeps it in a folder only SYSTEM and administrators can change, so the app cannot later be pointed at a Ledger that signs its own Unlocks.
- Blocked sites show the browser's own "blocked by your organization" page; the app recognises it by the window title and opens Voucher's paused window over it. This depends on browsers titling that page with the domain.
- Focused time on the PC needs ActivityWatch running. Without it the PC earns nothing from Focused time; nothing else changes.
