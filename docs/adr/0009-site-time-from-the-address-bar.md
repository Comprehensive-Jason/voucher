# Site time is read from the browser's address bar

Sources can earn from sites, and Distraction time can show them, so Enforcers measure time on sites as well as in apps. They read it from the browser's address bar: on Android, Voucher's Accessibility service (the blocked-app screen of ADR 0007) reads the URL bar in Brave and Chrome; on Windows, the tray app reads the front browser's address bar (Brave, Chrome, Edge, or Firefox) through UI Automation every 5 seconds, treating 3 minutes without input as away, as ActivityWatch does. Time counts while a browser is in front, the screen is on and the user is present, and the address bar shows a matching host. A source member `site:readwise.io` covers readwise.io and every subdomain. When a host matches several members, only the longest one counts, so a minute never earns twice. Devices add site time into the minutes they already report per source and per Distraction, so the Ledger treats a site like any other member. As in ADR 0004, no browser extension, DNS, or VPN is involved.

## Considered Options

- ActivityWatch's aw-watcher-web extension: rejected because it must be force-installed per browser, which on a non-domain PC means the Chrome Web Store (ADR 0004), and it would cover only the PC, since ActivityWatch doesn't run on the phone.
- Installed web apps (sites added to the home screen): rejected because only Chrome on Android reports them as apps, and time in an ordinary tab is missed.
- Our own browser extension: rejected because every change goes through store review, and Android's Chrome and Brave take no extensions.

## Consequences

- It depends on each browser's address-bar layout, so a browser update can break it until Voucher is fixed; until then that time shows as the browser's.
- Incognito and private tabs count too.
- Only domains are kept, never full URLs or page titles.
- On Android, switching the Accessibility service off now also stops site time, so the Protection part is named "Blocked-app screen and site time".
- Browsers whose address bar isn't read count only as the browser's own time, and so do installed web-app windows, which have no address bar.
- On Windows, site time works without ActivityWatch; reading the address bar may switch on a Chromium browser's accessibility mode, which costs it a little speed.
