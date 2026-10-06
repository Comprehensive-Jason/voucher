# Rust for the Ledger, CLI, and Windows Enforcer; Kotlin for Android

The Ledger, the CLI, and the Windows Enforcer are written in Rust; the Android Enforcer is Kotlin because Device Owner APIs require it. Go was the main alternative (simpler, faster to learn, built-in HTTP and Ed25519); Rust was chosen for its tiny runtime footprint, Microsoft's official Windows bindings, and its value on the embedded and robotics path. TypeScript was ruled out for anything always-on because of runtime overhead.
