# Android Enforcer is a Device Owner, not an Accessibility Service

The Android Enforcer is set as Device Owner once over ADB and blocks apps by suspending them, rather than detecting them with an Accessibility Service and covering them with an overlay. Device Owner makes the Enforcer impossible to uninstall and lets it lock specific settings (safe mode, factory reset from Settings, debugging, date and time, Private DNS) while leaving the Settings app usable. Accessibility-based blockers like Freedom can only protect themselves by blocking Settings outright, which is the problem this project exists to fix.

## Consequences

- Setup means removing every account from the device first, and Secure Folder and Smart Switch stop working.
- A factory reset from recovery mode is the one exit that cannot be blocked; that is accepted.
- The app must be registered under a limited-distribution developer account so it can be updated after debugging is disabled.
