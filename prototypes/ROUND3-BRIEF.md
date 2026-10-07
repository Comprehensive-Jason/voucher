# Voucher UI, round 3 design brief

> Claude: brief written 2026-10-06 for parallel design agents. Throwaway prototype work.

You are designing UI mockups for **Voucher**, an open-source app and website blocker for Android and Windows where free time is **earned**, not requested. Read `../CONTEXT.md` for the vocabulary and use it exactly (Voucher, Bank, Bank limit, Redeem, Unlock, Curfew, Morning boundary, Distraction, Activity source, Focused time).

## How it works (what the UI must express)

- Finished tasks (Todoist, ClickUp), workouts (heart-rate zone minutes from Health Connect), and Focused time in Obsidian, Readwise Reader, Moon+ Reader, and Anki earn **Vouchers** into a **Bank**.
- Bank limit 12. Vouchers carry over between days. Anything earned while the Bank is full is forfeited (this is meant to nudge the user to take breaks).
- **Redeem** one Voucher to open all Distractions (social media, games) for a fixed **Unlock** of 10 minutes. One Unlock at a time; when it ends, everything locks again.
- **Curfew** 22:00 to 06:00: nothing can be Redeemed.
- Settings: tightening (shorter Unlock, lower limit, longer Curfew) applies now; loosening waits for the next 06:00 **Morning boundary**. A pending loosening is shown (example: Unlock length 10 min, changing to 15 min at 06:00).

## What the user (Jason) said about earlier rounds

- Liked: a **ticket** metaphor where the Bank is a stack of tickets and you **tear** one off by dragging it (no separate button); the running Unlock timer sits below the ticket. A **stepper settings page** (label on the left, − value + on the right, "− applies now. + waits for 06:00." footnote). Designs modelled on apps in this space (Habits First, Opal, one sec, ScreenZen).
- Disliked: a serif "ledger book" accounting design ("looks bad").
- **Dark mode only.** Do not design a light theme.
- Reference apps (look these up if you can): Habits First (habitsfirst.com: dark, habit progress bars, heatmaps, widgets), Opal (frosted glass, big timer), one sec (intervention screen, attempt counts), ScreenZen (mindful pause, violet).

## Platform constraints (must be shown honestly)

- Android: opening a blocked app shows a **system dialog drawn by Android** ("Instagram is paused", our text, buttons Close / Open Voucher). We only control its text. "Open Voucher" opens our app's blocked screen, which is ours to design.
- Windows: a blocked desktop app (example: Steam) is closed by our service and our window appears. A blocked website in Brave shows **Brave's own** "ERR_BLOCKED_BY_ADMINISTRATOR / Your organization doesn't allow you to view this site" page, which we cannot style; redeeming happens from our tray icon flyout.
- Android home-screen widgets are built from RemoteViews: a live countdown is possible (Chronometer counting down), buttons are possible (tap to open or tap to redeem), but no free-form drag gestures and no custom fonts beyond what RemoteViews allows. Design within that.

## Mock data (use these exact numbers)

| State key | Label | Bank | Unlock left | Curfew | Clock |
| --- | --- | --- | --- | --- | --- |
| `locked` | Locked, 5 banked | 5 | none | no | 19:42 |
| `running` | Unlock running | 4 | 07:12 | no | 19:45 |
| `curfew` | Curfew | 4 | none | yes | 22:31 |
| `full` | Bank full | 12 | none | no | 16:05 |

Today's history (only show entries before the state's clock): 08:10 Stretch 10 min (Todoist) +1; 11:32 Finish the problem set (Todoist) +1; 13:05 Draft the budget (ClickUp) +1; 14:40 Fitbod upper body, 22 zone min (Health Connect) +1; 15:20 Obsidian, 30 min focused (Focused time) +1; 17:55 Redeemed −1. In the `full` state add 16:02 Reader, 30 min focused, forfeited.

Progress toward the next Voucher: Tasks +1 each; Obsidian 18/30 focused min; Workout 9/15 zone min; Anki 6/30 focused min. Streak: 4 days. This week: 31 earned, 24 spent, 2 forfeited. Opened while locked today: Instagram 14, YouTube 6, Reddit 3.

## Deliverable

One self-contained HTML file (no network, no external fonts or libraries) at the path your task names. It must:

1. Contain **2 designs**, each structurally different from the other (different layout, hierarchy, and primary interaction), switchable by `?variant=<key>` and a floating bottom bar (← →, keyboard arrows), labelled PROTOTYPE.
2. Accept `?state=locked|running|curfew|full` and `?device=phone|tablet|windows|widgets`, with buttons on the page to switch both.
3. Render everything inside an element with `id="stage"`, and the switcher bar with `class="switcher"` (the renderer hides it).
4. For each design and state, by device:
   - **phone** (Galaxy S24 Ultra, about 330×690 CSS px frames): Home, the Android system dialog (shared, not ours), our blocked screen after "Open Voucher", and Settings.
   - **tablet** (Galaxy Tab S10 Ultra, landscape, about 1180×740 CSS px): Home and Settings, using the extra width well (two panes, navigation rail), not a stretched phone layout.
   - **windows** (Windows 11, Tauri app): main window, tray flyout above a taskbar, our window when a blocked game (Steam) opens, Brave's unstylable blocked page, Settings window.
   - **widgets**: Android home-screen widgets in at least two sizes (small 2×2 and medium 4×2; a large 4×4 if useful) on a dark home-screen wallpaper, phone and tablet. Each shows Vouchers banked, the live Unlock countdown when one is running, and other motivating progress (next-voucher progress, streak, week). Curfew and Bank-full states must read clearly.
5. Dark mode only. No em dashes anywhere in visible text. Use the Oxford comma. 24-hour times.
6. Mark the file as a throwaway prototype in a top comment, naming the model that wrote it.

## Checking your work

Render screenshots to check layout before finishing (headless Chromium works on this machine without sudo):

```bash
cd /tmp/claude-1000/-home-jason-scratch/0533a9c5-8f88-558f-848b-0a2170a3647d/scratchpad/shots   # playwright is installed here
LIBS=/tmp/claude-1000/-home-jason-scratch/0533a9c5-8f88-558f-848b-0a2170a3647d/scratchpad/libs/root/usr/lib/x86_64-linux-gnu
# in a .mjs script: chromium.launch({ env: { ...process.env, LD_LIBRARY_PATH: LIBS } })
# viewport ~1480 wide for phone, 1260 tablet, 1560 windows; screenshot page.locator('#stage'); deviceScaleFactor 2
```

Look at your renders with the Read tool and fix overlaps, clipped text, wrapping, and unreadable contrast. Emoji render as empty boxes in this headless browser: draw icons as inline SVG instead.

Do not edit any other file, do not commit, do not spawn sub-agents. When done, reply with the file path, one paragraph per design (name, idea, primary interaction, what it borrows from which app), and anything you could not do.
