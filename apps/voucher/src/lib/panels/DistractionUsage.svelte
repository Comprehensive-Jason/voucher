<script lang="ts">
  // Time in Distractions today, measured on this device.
  import type { Blocklist, DeviceUsage } from "../types";

  let { usage, unlockedMinutes, blocklists = {} }: {
    usage: DeviceUsage | null; unlockedMinutes: number;
    /** To draw each app in the colour of the blocklist it's on. */
    blocklists?: Record<string, Blocklist>;
  } = $props();

  const used = $derived(usage ? usage.apps.reduce((n, a) => n + a.minutes, 0) : 0);
  /** The colour of the blocklist an app is on (matched by its name), or grey. */
  function colorOf(label: string): string {
    const list = Object.values(blocklists).find((l) => l.apps.some((a) => a.label.toLowerCase() === label.toLowerCase()));
    return list?.color ?? "#9aa0a6";
  }
</script>

<section class="card">
  <div class="head">
    <span class="cap">In Distractions today</span>
    <span class="cap spend">{usage?.measured ? `${used} min used of ${unlockedMinutes} unlocked` : ""}</span>
  </div>
  {#if usage && !usage.measured}
    <div class="note">Minutes need usage access on this device: turn it on in Rules, under Protection.</div>
    <div class="note">{usage.blockedOpens} blocked opens, {usage.closedWithoutTearing} closed without tearing</div>
  {:else if usage}
    {#each usage.apps as a}
      <div class="app">
        <div class="name">{a.label}</div>
        <div class="bar"><i style="width: {(a.minutes / Math.max(1, usage.apps[0].minutes)) * 100}%; background: {colorOf(a.label)}"></i></div>
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
  .head { display: flex; justify-content: space-between; flex-wrap: wrap; column-gap: 12px; row-gap: 4px; }
  /* On a narrow screen the total drops under the heading instead of both wrapping. */
  .head > span { white-space: nowrap; }
  .spend { color: var(--goal); }
  .app { display: grid; grid-template-columns: 84px minmax(0, 1fr) 48px; gap: 10px; align-items: center; }
  .name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .min { font-size: 12px; text-align: right; color: var(--muted); }
  .note { font-size: 12px; color: var(--muted); }
  .card { gap: 10px; }
</style>
