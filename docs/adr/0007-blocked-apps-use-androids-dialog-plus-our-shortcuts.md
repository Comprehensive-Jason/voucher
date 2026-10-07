# Device Owner enforces blocking; an Accessibility overlay only decorates it

A Device Owner suspends Distractions, which cannot be bypassed short of a factory reset, but it cannot customise Android's dialog for a suspended app beyond its body text (ADR 0006, spike result). So the app adds an Accessibility service whose only job is the experience: when a suspended app is tapped, it covers Android's dialog with Voucher's own blocked screen (the app's name, today's attempts, and a ticket to tear). Enforcement never depends on it. If the service is switched off, killed, or crashes, apps stay suspended and Android's plain dialog shows instead, with its body text kept current (the Bank count, or Curfew) by `setShortSupportMessage`. A persistent notification, the home-screen widget, and a Quick Settings tile are also one tap from a ticket.

This deliberately differs from ADR 0003's rejection of Accessibility: there, Accessibility would have been the enforcement, so turning it off was the bypass. Here turning it off only costs polish.

## Spike result (2026-10-06, branch `spike/tauri-device-owner`)

On an Android 16 emulator, tapping the suspended app's launcher icon fired a click event labelled "Disabled Chrome"; Android's `ActionDisabledByAdminDialog` appeared about 0.7 s after the tap, and an overlay window covered it completely while naming the app. Android's dialog can be visible for about 0.35 s before the overlay; showing the overlay on the launcher click instead removes that.

## Consequences

- Attempts can be counted per app (from the launcher click), best effort; the dialog itself does not say which app was tapped.
- Android 13+ restricts Accessibility for sideloaded apps until "Allow restricted settings" is tapped, or it is enabled once over ADB during setup.
- Google Play restricts non-accessibility uses of Accessibility, which matters only if Voucher is ever listed there.
- One UI may stop Accessibility services in the background more aggressively than stock Android; under this design that only means the plain dialog appears.

## Considered Options

- Device Owner alone (Android's dialog, our text, shortcuts elsewhere): robust, but the blocked moment is a generic "Blocked by work policy" with no way to Redeem.
- Hiding blocked apps instead of suspending them: no dialog at all, but hidden apps lose their notifications and attempts cannot be counted.
- Accessibility alone: the full custom experience, but switching it off is a bypass.
