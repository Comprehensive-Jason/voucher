<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the tablet's three columns, Today | Trends | Log and Distraction time.
  import { onMount } from "svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import { Live, POLL_MS } from "$lib/live.svelte";
  import { wide } from "$lib/wide.svelte";
  import { historyDays } from "$lib/time";
  import TodayColumn from "$lib/panels/TodayColumn.svelte";
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import DistractionUsage from "$lib/panels/DistractionUsage.svelte";
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
  $effect(() => {
    if (!wide.on) return;
    loadWide();
    const timer = setInterval(loadWide, import.meta.env.DEV ? POLL_MS : 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if wide.on}
  <!-- Today spans both rows; the hour chart and the Log share the top row,
       the history grid and Distractions the bottom one, which the grid's
       height sets, so the two bottom cards always line up. -->
  <div class="grid">
    <section class="col today"><TodayColumn {live} wide /></section>
    {#if status}
      <div class="cell hour"><HourChart today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} {focus} bind:shownDay tall /></div>
      <div class="cell heat"><Heatmap {history} goal={status.today.goal} firstDay={status.first_day} selected={shownDay} onpick={(day) => (focus = { day, at: Date.now() })} keyBelow={false} /></div>
      <div class="cell usage"><DistractionUsage {usage} unlockedMinutes={status.today.unlocked_minutes} blocklists={status.settings.blocklists} /></div>
    {/if}
    <div class="logcard"><LogPanel compact /></div>
  </div>
{:else}
  <main><TodayColumn {live} /></main>
{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  .grid {
    height: 100%; display: grid; column-gap: 24px; row-gap: 20px; padding: calc(28px + env(safe-area-inset-top)) 28px 28px;
    grid-template-columns: minmax(340px, 1fr) minmax(280px, 1fr) minmax(300px, 1fr);
    grid-template-rows: minmax(0, 1fr) auto;
    grid-template-areas: "today hour log" "today heat usage";
  }
  .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; min-height: 0; }
  .today { grid-area: today; }
  /* Everything in the Today column keeps its size; the list of sources takes
     what's left and scrolls under its fixed heading when it's long. */
  .today > :global(*) { flex: none; }
  .today > :global(section.next) { flex: 1 1 0; min-height: 0; }
  .today :global(section.next .frame) { flex: 1; min-height: 0; }
  /* 16 px of room at the sides (and 4 at the ends), so a raised row's card
     is never clipped by the scrolling edge. */
  .today :global(section.next .list) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; margin: 0 -16px; padding: 4px 16px; }
  .cell { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
  .hour { grid-area: hour; }
  .heat { grid-area: heat; }
  /* Sized by the row (the history grid's height), never by its own content,
     which scrolls when there's more of it. */
  .usage { grid-area: usage; contain: size; }
  /* The box fills its cell; only its list of apps scrolls, so the totals stay at the bottom. */
  .usage :global(.card) { flex: 1; min-height: 0; }
  .usage :global(.card .apps) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .logcard { grid-area: log; min-height: 0; overflow: hidden; display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); padding: 0 18px 12px; }
</style>
