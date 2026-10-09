<script lang="ts">
  // Trends: today's earnings hour by hour, twelve weeks of Days, and time
  // spent in Distractions today.
  import { onMount } from "svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import { historyDays } from "$lib/time";
  import type { DaySummary, DayTotal, DeviceUsage, Status } from "$lib/types";

  let today = $state<DaySummary | null>(null);
  let timeZone = $state("UTC");
  let firstDay = $state<string | undefined>();
  // Tapping a Day in the history grid scrolls the hour chart to it.
  let focus = $state<{ day: string; at: number } | null>(null);
  let shownDay = $state<string | undefined>();
  let history = $state<DayTotal[]>([]);
  let usage = $state<DeviceUsage | null>(null);
  let blocklists = $state<Status["settings"]["blocklists"]>({});
  let error = $state<string | null>(null);

  onMount(async () => {
    try {
      const status = await ledger<Status>("GET", "/status");
      blocklists = status.settings.blocklists;
      today = status.today;
      timeZone = status.settings.time_zone;
      firstDay = status.first_day;
      history = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(today.day, firstDay)}`);
      usage = await deviceUsage();
      error = null;
    } catch (e) {
      error = String(e);
    }
  });
</script>

<main>
  <header>
    <h1>Trends</h1>
    {#if today && today.streak > 0}
      <div class="streak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
        {today.streak} day streak
      </div>
    {/if}
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if today}
    <HourChart {today} {timeZone} {firstDay} {focus} bind:shownDay />
    <Heatmap {history} goal={today.goal} {firstDay} selected={shownDay} onpick={(day) => (focus = { day, at: Date.now() })} />
    <HourChart measure="distraction" {today} {timeZone} {firstDay} {focus} {blocklists} device={usage} />
  {/if}
</main>

<style>
  main { padding: calc(22px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .streak { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--goal-bg); color: var(--goal); font-size: 13px; font-weight: 700; }
  .error { color: var(--goal); }
</style>
