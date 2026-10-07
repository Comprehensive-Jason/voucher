<script lang="ts">
  // Time in Distractions today, measured on this device.
  import type { DeviceUsage } from "../types";

  let { usage, unlockedMinutes }: { usage: DeviceUsage | null; unlockedMinutes: number } = $props();

  const used = $derived(usage ? usage.apps.reduce((n, a) => n + a.minutes, 0) : 0);
  const COLORS = ["#e5609b", "#ff6b5b", "#ff8a3d", "#c9cdd1"];
</script>

<section class="card">
  <div class="head">
    <span class="cap">In Distractions today</span>
    <span class="cap spend">{usage?.measured ? `${used} of ${unlockedMinutes} min` : ""}</span>
  </div>
  {#if usage && !usage.measured}
    <div class="note">Minutes need usage access on this device: turn it on in Rules, under Protection.</div>
    <div class="note">{usage.blockedOpens} blocked opens, {usage.closedWithoutTearing} closed without tearing</div>
  {:else if usage}
    {#each usage.apps.slice(0, 4) as a, i}
      <div class="app">
        <div class="name">{a.label}</div>
        <div class="bar"><i style="width: {(a.minutes / Math.max(1, usage.apps[0].minutes)) * 100}%; background: {COLORS[i]}"></i></div>
        <div class="mono min">{a.minutes} min</div>
      </div>
    {:else}
      <div class="note">No time in Distractions today.</div>
    {/each}
    <div class="note">{usage.blockedOpens} blocked opens, {usage.closedWithoutTearing} closed without tearing</div>
  {:else}
    <div class="note">Needs usage access on this device. Turn it on in Rules, under Protection.</div>
  {/if}
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; }
  .spend { color: var(--goal); }
  .app { display: grid; grid-template-columns: 84px minmax(0, 1fr) 48px; gap: 10px; align-items: center; }
  .name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .min { font-size: 12px; text-align: right; color: var(--muted); }
  .note { font-size: 12px; color: var(--muted); }
  .card { gap: 10px; }
</style>
