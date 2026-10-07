# One Tauri v2 app for Android and Windows; Kotlin only where Android requires it

The user-facing app on both platforms is a single Tauri v2 project: a Rust core (sharing `voucher-protocol` with the Ledger) and one TypeScript/HTML interface, so the screens designed on the claude.ai canvas carry over almost directly. Android parts that only native code can do are small Kotlin plugins inside the Tauri project: the Device Owner receiver and policies (ADR 0003), app suspension, and home-screen widgets (RemoteViews or Glance). This amends ADR 0005, which had the Android Enforcer as a separate Kotlin app.

## Considered Options

- Compose Multiplatform: native Android feel and one language for all Android code, but Windows runs it on the JVM and the always-on Windows service stays Rust, so Windows would carry two languages.
- Flutter: mature on both, but a third language, and Device Owner still needs Kotlin.

## Consequences

- On Android the interface is a web view, slightly less native than Compose.
- Tauri's Android support is younger than its desktop support. The first spike must prove a Tauri app can hold Device Owner and suspend apps on an emulator before anything else is built on it.
- Widgets cannot reuse the web interface; they are drawn natively and kept visually in step by hand.

## Spike result (2026-10-06, branch `spike/tauri-device-owner`)

On an Android 16 emulator the Tauri app became Device Owner over ADB, suspended Chrome from a button on its web page (page to Rust to Kotlin `DevicePolicyManager`), survived an app update with Device Owner intact, and refused uninstall (`DELETE_FAILED_DEVICE_POLICY_MANAGER`). Tauri is viable.

One design constraint surfaced: Android's dialog for an app suspended by a Device Owner is fixed. Its title is "Blocked by work policy" and its only button is Close; the custom title and "Open Voucher" button need the system-only `SUSPEND_APPS` permission. Only the body text is ours, through `setShortSupportMessage`, and it can be rewritten at any time (for example with the live Bank count).
