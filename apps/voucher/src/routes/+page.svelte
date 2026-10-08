<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the tablet's three columns, Today | Trends | Log and Distraction time.
  import { onMount } from "svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import { Live } from "$lib/live.svelte";
  import { wide } from "$lib/wide.svelte";
  import { twelveWeeks } from "$lib/time";
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

  // The tablet's other columns refresh less often than the Voucher stack.
  async function loadWide() {
    try {
      status = await ledger<Status>("GET", "/status");
      history = await ledger<DayTotal[]>("GET", `/history?days=${twelveWeeks(status.today.day)}`);
      usage = await deviceUsage();
    } catch { /* the Today column shows the error */ }
  }

  onMount(() => live.start());
  $effect(() => {
    if (!wide.on) return;
    loadWide();
    const timer = setInterval(loadWide, 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if wide.on}
  <div class="grid">
    <section class="col"><TodayColumn {live} wide /></section>
    <section class="col">
      {#if status}
        <HourChart today={status.today} timeZone={status.settings.time_zone} tall />
        <Heatmap {history} goal={status.today.goal} keyBelow={false} />
      {/if}
    </section>
    <section class="col">
      <div class="logcard"><LogPanel compact /></div>
      {#if status}<DistractionUsage {usage} unlockedMinutes={status.today.unlocked_minutes} />{/if}
    </section>
  </div>
{:else}
  <main><TodayColumn {live} /></main>
{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  .grid { height: 100%; display: grid; grid-template-columns: minmax(340px, 1fr) minmax(280px, 1fr) minmax(300px, 1fr); gap: 24px; padding: calc(28px + env(safe-area-inset-top)) 28px 28px; }
  .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; min-height: 0; }
  .logcard { flex: 1; min-height: 0; overflow: hidden; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); padding: 18px; }
</style>
