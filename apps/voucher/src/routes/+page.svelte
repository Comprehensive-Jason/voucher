<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the Today column stays put on the left, and the rest is a row of columns
  // that scrolls sideways, two in view at a time, holding the charts and the
  // Log in whatever arrangement was chosen here (see arrangement.svelte.ts).
  import { onMount, tick } from "svelte";
  import { arrangement, PANELS, type PanelId } from "$lib/arrangement.svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import { Live, POLL_MS } from "$lib/live.svelte";
  import { wide } from "$lib/wide.svelte";
  import { historyDays } from "$lib/time";
  import TodayColumn from "$lib/panels/TodayColumn.svelte";
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import TrendLines from "$lib/panels/trends/TrendLines.svelte";
  import WhenYouEarn from "$lib/panels/trends/WhenYouEarn.svelte";
  import PaceToGoal from "$lib/panels/trends/PaceToGoal.svelte";
  import MorningRunway from "$lib/panels/trends/MorningRunway.svelte";
  import HabitStrength from "$lib/panels/trends/HabitStrength.svelte";
  import StreakLadder from "$lib/panels/trends/StreakLadder.svelte";
  import SourceStreaks from "$lib/panels/trends/SourceStreaks.svelte";
  import PersonalRecords from "$lib/panels/trends/PersonalRecords.svelte";
  import type { DayTotal, DeviceUsage, Status } from "$lib/types";

  const live = new Live();
  let status = $state<Status | null>(null);
  let history = $state<DayTotal[]>([]);
  let usage = $state<DeviceUsage | null>(null);
  // Tapping a Day in the history grid scrolls the hour chart to it.
  let focus = $state<{ day: string; at: number } | null>(null);
  let shownDay = $state<string | undefined>();

  // The tablet's other columns refresh less often than the Voucher stack.
  async function loadWide() {
    try {
      status = await ledger<Status>("GET", "/status");
      history = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(status.today.day, status.first_day)}`);
      usage = await deviceUsage();
    } catch { /* the Today column shows the error */ }
  }

  onMount(() => live.start());

  // ---- Arranging ----
  let arranging = $state(false);
  /** Each change slides the panels to their new places. */
  function rearrange(change: () => void) {
    if (!document.startViewTransition) return change();
    document.startViewTransition(async () => { change(); await tick(); });
  }
  // How many columns sit off to the right, for the cue at the edge.
  let strip = $state<HTMLDivElement>();
  let more = $state(0);
  function measureMore() {
    if (!strip) return;
    const right = strip.getBoundingClientRect().right;
    more = [...strip.querySelectorAll<HTMLElement>(":scope > .column:not(.endcol)")].filter((c) => c.getBoundingClientRect().left >= right - 8).length;
  }
  $effect(() => {
    const el = strip;
    if (!el) return;
    arrangement.columns;
    measureMore();
    const resized = new ResizeObserver(measureMore);
    resized.observe(el);
    return () => resized.disconnect();
  });
  $effect(() => {
    if (!wide.on) return;
    loadWide();
    const timer = setInterval(loadWide, import.meta.env.DEV ? POLL_MS : 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if wide.on}
  {#snippet panel(id: PanelId)}
    {#if id === "log"}<div class="logcard"><LogPanel compact /></div>
    {:else if status}
      {#if id === "earned"}<HourChart today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} {focus} bind:shownDay tall />
      {:else if id === "heat"}<Heatmap {history} goal={status.today.goal} firstDay={status.first_day} selected={shownDay} onpick={(day) => (focus = { day, at: Date.now() })} keyBelow={false} />
      {:else if id === "distraction"}<HourChart measure="distraction" today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} {focus} blocklists={status.settings.blocklists} device={usage} tall />
      {:else if id === "trend"}<TrendLines {history} goal={status.today.goal} />
      {:else if id === "when"}<WhenYouEarn {history} />
      {:else if id === "pace"}<PaceToGoal {history} today={status.today} timeZone={status.settings.time_zone} />
      {:else if id === "runway"}<MorningRunway {history} timeZone={status.settings.time_zone} />
      {:else if id === "strength"}<HabitStrength {history} />
      {:else if id === "ladder"}<StreakLadder {history} />
      {:else if id === "streaks"}<SourceStreaks {history} sources={status.today.sources} />
      {:else if id === "records"}<PersonalRecords {history} timeZone={status.settings.time_zone} />{/if}
    {/if}
  {/snippet}
  <div class="wide">
    <section class="col today"><TodayColumn {live} wide /></section>
    <div class="stripwrap">
      <div class="strip" class:arranging bind:this={strip} onscroll={measureMore}>
        {#each arrangement.columns as column, ci (ci)}
          <div class="column">
            {#each column as id (id)}
              <div class="slot" class:grows={PANELS[id].grows} style="view-transition-name: panel-{id}">
                {@render panel(id)}
                {#if arranging}
                  <!-- Over the panel while arranging: where it goes next. -->
                  <div class="tools" role="group" aria-label="Move {PANELS[id].name}">
                    <span class="pname">{PANELS[id].name}</span>
                    <div class="moves">
                      <button aria-label="Move left" onclick={() => rearrange(() => arrangement.sideways(id, -1))} disabled={ci === 0 && column.length === 1}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg></button>
                      {#if column.length > 1}
                        <button aria-label={column.indexOf(id) === 0 ? "Move down" : "Move up"} onclick={() => rearrange(() => arrangement.flip(id))}>
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">{#if column.indexOf(id) === 0}<path d="M6 9l6 6 6-6" />{:else}<path d="M6 15l6-6 6 6" />{/if}</svg></button>
                      {/if}
                      <button aria-label="Move right" onclick={() => rearrange(() => arrangement.sideways(id, 1))} disabled={ci === arrangement.columns.length - 1 && column.length === 1}>
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg></button>
                      <button class="hide" aria-label="Hide {PANELS[id].name}" onclick={() => rearrange(() => arrangement.hide(id))}>Hide</button>
                    </div>
                  </div>
                {/if}
              </div>
            {/each}
          </div>
        {/each}
        <!-- The end of the row: arranging starts and ends here, and hidden panels come back. -->
        <div class="column endcol">
          {#if arranging}
            <button class="done" onclick={() => (arranging = false)}>Done</button>
            {#each arrangement.hidden as id (id)}
              <button class="add" onclick={() => rearrange(() => arrangement.show(id))}>+ {PANELS[id].name}</button>
            {/each}
            <button class="reset" onclick={() => rearrange(() => arrangement.reset())}>Back to the default</button>
          {:else}
            <button class="arrange" onclick={() => (arranging = true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></svg>
              Arrange
            </button>
          {/if}
        </div>
      </div>
      {#if more}
        <button class="morecue" onclick={() => strip?.scrollBy({ left: strip.clientWidth / 2, behavior: "smooth" })}>{more} more
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
      {/if}
    </div>
  </div>
{:else}
  <main><TodayColumn {live} /></main>
{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  /* The Today column takes a third of the width and stays put; the strip
     beside it scrolls, with two columns in view. */
  .wide { height: 100%; display: flex; gap: 24px; padding: calc(28px + env(safe-area-inset-top)) 0 28px 28px; box-sizing: border-box; }
  .wide > .today { flex: 0 0 calc((100% - 28px - 48px) / 3); }
  .stripwrap { position: relative; flex: 1; min-width: 0; display: flex; }
  .strip { flex: 1; min-width: 0; display: flex; gap: 24px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none; padding-right: 28px; scroll-padding-left: 0; }
  .strip::-webkit-scrollbar { display: none; }
  .column { flex: 0 0 calc((100% - 24px) / 2); min-width: 0; display: flex; flex-direction: column; gap: 20px; scroll-snap-align: start; }
  .slot { position: relative; display: flex; flex-direction: column; min-height: 0; flex: none; }
  .slot.grows { flex: 1 1 0; }
  .slot > :global(.card) { flex: 1; min-height: 0; }
  /* Arranging: the panels sit still under their move buttons. */
  .arranging .slot > :global(*:not(.tools)) { pointer-events: none; opacity: .45; transition: opacity var(--t-base); }
  .tools { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: 18px; border: 2px dashed #3a3f45; }
  .pname { font: 700 15px var(--font); color: var(--ink); }
  .moves { display: flex; gap: 8px; }
  .moves button { height: 40px; min-width: 40px; padding: 0 10px; border-radius: 12px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); display: flex; align-items: center; justify-content: center; font: 700 13px var(--font); cursor: pointer; }
  .moves button:disabled { opacity: .3; cursor: default; }
  .moves .hide { color: var(--muted); }
  /* A whole column wide, so the row still stops on a column's edge at its end. */
  .endcol { justify-content: center; align-items: center; gap: 10px; }
  .endcol > button { width: 100%; max-width: 240px; }
  .endcol button { min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 14px var(--font); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; }
  .endcol .done { background: var(--voucher); border-color: var(--voucher); color: #0e0f11; }
  .endcol .add { border-style: dashed; }
  .endcol .reset { color: var(--muted); font-weight: 500; font-size: 13px; }
  .endcol .arrange { color: var(--muted); }
  /* Columns off to the right: how many, and a tap to slide one over. */
  /* Just under the cards, in the page's bottom margin, so it covers nothing. */
  .morecue { position: absolute; right: 28px; bottom: -27px; z-index: 6; height: 24px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 700 12px var(--font); display: flex; align-items: center; gap: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .5); cursor: pointer; }
  :global(::view-transition-group(*)) { animation-duration: var(--t-move); animation-timing-function: var(--ease-out); }
  .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; min-height: 0; }
  /* Everything in the Today column keeps its size; the list of sources takes
     what's left and scrolls under its fixed heading when it's long. */
  .today > :global(*) { flex: none; }
  .today > :global(section.next) { flex: 1 1 0; min-height: 0; }
  .today :global(section.next .frame) { flex: 1; min-height: 0; }
  /* 16 px of room at the sides (and 4 at the ends), so a raised row's card
     is never clipped by the scrolling edge. */
  .today :global(section.next .list) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; margin: 0 -16px; padding: 4px 16px; }
  .logcard { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); padding: 0 18px 12px; }
</style>
