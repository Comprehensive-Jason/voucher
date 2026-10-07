# Android Enforcer is a Device Owner, not an Accessibility Service

The Android Enforcer is set as Device Owner once over ADB and blocks apps by suspending them, rather than detecting them with an Accessibility Service and covering them with an overlay. Device Owner makes the Enforcer impossible to uninstall and lets it lock specific settings (safe mode, factory reset from Settings, debugging, date and time, Private DNS) while leaving the Settings app usable. Accessibility-based blockers like Freedom can only protect themselves by blocking Settings outright, which is the problem this project exists to fix.

## Consequences

- No factory reset is needed: over ADB, Android only requires that no accounts and no other users or profiles exist at that moment. Setup freezes the apps that hold accounts (`pm disable-user`) instead of signing out, because signing out of a Samsung account deletes Samsung Wallet cards, then thaws them. Secure Folder, Dual Messenger, and app clones must be deleted first.
- While Voucher is Device Owner, Secure Folder, Samsung Pass, Smart Switch, and Samsung Kids stop working. Samsung Wallet is unverified, so the tablet is set up before the phone.
- A factory reset from recovery mode is the one exit that cannot be blocked; that is accepted.
- Debugging stays on by choice (2026-10-07). ADB cannot lift Device Owner suspensions (`pm unsuspend` is refused, checked on an emulator), so the remaining ADB exits are small. Updates install as signed APKs.
- Leaving goes through the Ledger: releasing a device is a Loosening, so it waits for the Morning boundary, then the Enforcer lifts every suspension and gives up Device Owner. It must lift suspensions first: they outlive the admin that set them, and no other app can lift them afterwards.
