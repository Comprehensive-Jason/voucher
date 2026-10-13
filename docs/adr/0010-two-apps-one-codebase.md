# Two apps on one codebase: Voucher and Counterfoil

Voucher was growing two jobs: enforcing (earning, Unlocks, Rules, the blocked-app screen) and reflecting (cards about sleep, calendars, and what goes with a good Day). The second app, Counterfoil, takes the reflecting. It reads the same Ledger with the same connect flow and access code, shows its own dashboard of cards, and writes nothing but Markers. Voucher keeps every rule, every report from devices, and the calendar picker.

Both apps live in this repository as npm workspaces: `apps/voucher` (where it always was, since Android's Gradle build runs from there), `apps/counterfoil`, and `packages/core`, which holds what both use: the theme, the Ledger's types and calls, the sample data, the charts' parts, the card registry (`createArrangement`, `defineAbout`), and the dashboard itself. Core ships as source; each app compiles it through a `$core` alias. Core imports only its own files and its own dependencies, never an app's (`dev/check-core-imports.mjs`). The Ledger keeps its name, `voucher-ledger`, and its API.

## Considered Options

- One app with a second mode: rejected because the reflecting side would carry Voucher's Device Owner, tray, and enforcement into every build, and its cards would keep competing with Today for the tablet.
- A second repository: rejected because the two apps share most of their screens' parts, and keeping two copies of the theme and the dashboard in step would cost more than the workspace does.
- A built package for core: rejected for now, because shipping source keeps one Svelte compile per app and lets Vite hot-reload core files on the tablet.

## Consequences

- Counterfoil starts as a browser app on port 1430; a Tauri shell for Windows and Android (`io.github.comprehensivejason.counterfoil`, no tray, no Device Owner) comes later.
- Each kind of data has one reporter: Voucher's Android app keeps reporting workouts, steps, sleep, calendars, focus, and Distraction. Counterfoil reports nothing until mood, which the user enters there.
- Counterfoil must never call the Ledger's spending, rule, or device endpoints; above all not `/check-in`, since a new device would show up as Gaps. Its Ledger calls go through an allowlist, first in its own code, later in its Rust side.
- Until Counterfoil has a Tauri shell, the cards that move to it (Sleep and Calendar load) show only in its browser build.
- Until the Ledger has a read-only access code, Counterfoil holds a full-power one.
- A saved Voucher arrangement keeps its key, `voucher:tablet-arrangement`; cards that moved away drop out of it on its next load. Counterfoil keeps its own as `counterfoil:dashboard-arrangement`.
