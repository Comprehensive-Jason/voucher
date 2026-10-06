# One Tauri v2 app for Android and Windows; Kotlin only where Android requires it

The user-facing app on both platforms is a single Tauri v2 project: a Rust core (sharing `voucher-protocol` with the Ledger) and one TypeScript/HTML interface, so the screens designed on the claude.ai canvas carry over almost directly. Android parts that only native code can do are small Kotlin plugins inside the Tauri project: the Device Owner receiver and policies (ADR 0003), app suspension, and home-screen widgets (RemoteViews or Glance). This amends ADR 0005, which had the Android Enforcer as a separate Kotlin app.

## Considered Options

- Compose Multiplatform: native Android feel and one language for all Android code, but Windows runs it on the JVM and the always-on Windows service stays Rust, so Windows would carry two languages.
- Flutter: mature on both, but a third language, and Device Owner still needs Kotlin.

## Consequences

- On Android the interface is a web view, slightly less native than Compose.
- Tauri's Android support is younger than its desktop support. The first spike must prove a Tauri app can hold Device Owner and suspend apps on an emulator before anything else is built on it.
- Widgets cannot reuse the web interface; they are drawn natively and kept visually in step by hand.
