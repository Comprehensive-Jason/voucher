<script lang="ts" module>
  import type { DayTotal as Kept, DeviceUsage as KeptUsage, Status as KeptStatus } from "$core/types";
  /** What the tablet's columns last showed, so coming back from Rules shows
   *  it at once (then refreshes) instead of blank tiles for a few seconds. */
  const kept: { status: KeptStatus | null; history: Kept[]; usage: KeptUsage | null } = { status: null, history: [], usage: null };
</script>

<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the dashboard (Dashboard.svelte), with the Today column first, Rules at
  // its foot, and Voucher's cards (Card.svelte) in the strip beside it.
  import { page } from "$app/state";
  import { deviceUsage, ledger } from "$core/api";
  import { Live, POLL_MS } from "$lib/live.svelte";
  import { wide } from "$core/wide.svelte";
  import { sheet, whenIdle } from "$core/sheet.svelte";
  import { historyDays } from "$core/time";
  import { setCurfew } from "$core/curfew.svelte";
  import { fillSlots } from "$core/fit.svelte";
  import TodayColumn from "$lib/panels/TodayColumn.svelte";
  import RulesNotices from "$lib/components/RulesNotices.svelte";
  import MarkerSheet from "$core/components/MarkerSheet.svelte";
  import VerdictSheet from "$lib/components/VerdictSheet.svelte";
  import Dashboard from "$lib/Dashboard.svelte";
  import Card from "$lib/Card.svelte";
  import { ABOUT } from "$lib/about";
  import type { PanelId } from "$lib/cards";
  import type { DayTotal, DeviceUsage, Status } from "$core/types";

  const live = new Live();
  // Panels here fill their slots (thirds of a column).
  fillSlots();
  let status = $state.raw<Status | null>(kept.status);
  let history = $state.raw<DayTotal[]>(kept.history);
  let usage = $state<DeviceUsage | null>(kept.usage);

  // The tablet's other columns refresh less often than the Voucher stack.
  // An answer that hasn't changed is dropped, so the cards don't all redraw
  // (a long pause on the tablet) for nothing.
  /** The Marker button beside the status card opens the Marker choices. */
  let addingMarker = $state(false);
  /** Each answer as last shown, as text, so a new one is compared without
   *  turning the old one into text again (the history is long). */
  const shown = { status: "", history: "", usage: "" };
  /** True when `value` differs from what `key` last showed (and remembers it). */
  function changed(key: keyof typeof shown, value: unknown) {
    const text = JSON.stringify(value);
    if (text === shown[key]) return false;
    shown[key] = text;
    return true;
  }
  async function loadWide() {
    try {
      const s = await ledger<Status>("GET", "/status");
      if (changed("status", s)) { status = kept.status = s; setCurfew(s.settings.curfew_start, s.settings.curfew_end); }
      const h = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(s.today.day, s.first_day)}`);
      if (changed("history", h)) history = kept.history = h;
      const u = await deviceUsage();
      if (changed("usage", u)) usage = kept.usage = u;
    } catch { /* the Today column shows the error */ }
  }

  // While Rules covers the dashboard, or slides over it or off it, the
  // dashboard holds still: no clock, no polls, so nothing on it redraws (on
  // the tablet, every redraw of the dashboard during a slide costs a frame).
  // Back on it, it asks again once the sheet has gone and the screen is idle.
  const covered = $derived(page.url.pathname !== "/");
  const still = $derived(wide.on && (covered || sheet.moving));
  // Uncovered, the clock jumps to now at once, in the first frame of the
  // slide back down (which redraws anyway), so what the sheet uncovers isn't
  // stale; it ticks again, and the Ledger is asked, once the slide is over.
  $effect(() => { if (!covered) live.now = Math.floor(Date.now() / 1000); });
  let resumed = false;
  $effect(() => {
    if (still) return;
    let stop: (() => void) | undefined;
    const cancel = resumed ? whenIdle(() => (stop = live.start())) : ((stop = live.start()), undefined);
    resumed = true;
    return () => { cancel?.(); stop?.(); };
  });
  $effect(() => {
    if (!wide.on || still) return;
    const cancel = kept.status ? whenIdle(loadWide) : (loadWide(), undefined);
    const timer = setInterval(loadWide, import.meta.env.DEV ? POLL_MS : 60_000);
    return () => { cancel?.(); clearInterval(timer); };
  });
</script>

{#if wide.on}
  <Dashboard about={ABOUT}>
    {#snippet first()}
      <TodayColumn {live} wide onmarker={() => (addingMarker = true)} />
      <!-- Above the page bar, Rules' notices (Protection off, a Loosening
           waiting for the morning, the grace period): the list above gives
           them room, so nothing over them moves when they come or go. -->
      <RulesNotices />
    {/snippet}
    {#snippet footLeft()}
      <!-- Rules opens from the foot of the Today column, left of the page bar. -->
      <a class="iconbtn" href="/rules" aria-label="Rules" data-sveltekit-keepfocus>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </a>
    {/snippet}
    {#snippet card(id: string)}
      <Card id={id as PanelId} today={status?.today ?? null} timeZone={status?.settings.time_zone ?? "UTC"} firstDay={status?.first_day} blocklists={status?.settings.blocklists ?? {}} {history} {usage} keyBelow={false} />
    {/snippet}
  </Dashboard>
{:else}
  <main><TodayColumn {live} onmarker={() => (addingMarker = true)} /></main>
{/if}
<VerdictSheet curfewActive={live.data?.curfewActive ?? false} />
{#if addingMarker}<MarkerSheet onclose={() => (addingMarker = false)} />{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  /* In the dashboard's first column everything keeps its size, but the list
     of sources takes what's left and scrolls under its fixed heading when
     it's long. */
  :global(.wide > .today > section.next) { flex: 1 1 0; min-height: 0; }
  :global(.wide > .today section.next .frame) { flex: 1; min-height: 0; }
  /* 16 px of room at the sides (and 4 at the ends), so a raised row's card
     is never clipped by the scrolling edge. */
  :global(.wide > .today section.next .list) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; margin: 0 -16px; padding: 4px 16px; }
</style>
