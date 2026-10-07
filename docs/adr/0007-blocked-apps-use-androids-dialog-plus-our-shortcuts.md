# Blocked apps use Android's suspended-app dialog, plus our own shortcuts

A Device Owner can suspend apps but cannot customise Android's dialog for them beyond its body text (ADR 0006, spike result). We accept that: the body text is kept current (the Bank count, or Curfew), and the way to Redeem is a persistent notification, the home-screen widget, and a Quick Settings tile, each one tap from a ticket. Attempts to open a paused app are counted from usage events (the dialog opening), as one daily total: Android does not say which app was attempted.

## Considered Options

- Hiding blocked apps instead of suspending them: no dialog at all, but hidden apps lose their notifications and attempts cannot be counted.
- An Accessibility Service that detects launches and draws our own screen: the full custom experience, but fragile, easy to switch off, and against ADR 0003. Kept as the fallback if this approach feels too indirect in daily use.
