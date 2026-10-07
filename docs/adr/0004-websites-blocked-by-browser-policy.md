# Websites are blocked by browser policy, not DNS, VPN, or extension

Enforcers block websites by writing the Chromium `URLBlocklist` policy (registry on Windows, managed configuration on Android) and suspending or removing every other browser.

## Considered Options

- DNS filtering on Spruce over Tailscale: rejected because Tailscale routing through Spruce has already broken LAN traffic twice, and Spruce going down would break name resolution everywhere.
- A blocker VPN on Android: rejected because Android allows one VPN at a time and it would displace Tailscale.
- A browser extension: rejected because a non-domain Windows PC can only force-install extensions from the Chrome Web Store, which adds store review to every change.

## Consequences

- Links opened in other apps' built-in browsers are not covered.
- Brave on Android honours the managed URLBlocklist (checked on an emulator, 2026-10-07: "This page is blocked"). Every Chrome and Brave release channel receives it.
- Browsers that ignore it (Samsung Internet, Firefox, DuckDuckGo, Opera, Edge) are a premade blocklist, "Other browsers", so they stay suspended outside Unlocks.
- Maintained lists such as the public Invidious and Piped instances are named in blocklists (`list:invidious`); the Ledger fetches them daily and sends their domains to Enforcers.
