<script lang="ts">
  // The first two Days after setup, every change applies at once. This says
  // until when, and lets the user end it early (a second tap confirms).
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED, sameAnswer, statusNow } from "../api";
  import { POLL_MS } from "../live.svelte";
  import { hhmm } from "../rules";
  import { clock, dayLabel } from "../time";
  import type { Status } from "../types";
  import { reveal } from "../motion";

  let { axis = "y" }: { axis?: "x" | "y" } = $props();

  let status = $state<Status | null>(statusNow());
  let confirming = $state(false);
  const until = $derived(status?.grace_until ?? null);
  /** A moment's date on the Ledger's clock, as "2026-10-09". */
  let days: Intl.DateTimeFormat | null = null;
  const dayOf = (at: Date | string, timeZone: string) => (days?.resolvedOptions().timeZone === timeZone ? days : (days = new Intl.DateTimeFormat("en-CA", { timeZone }))).format(new Date(at));
  // "Today 14:00", "Sat 10-10 14:00": the shared date words, on the Ledger's clock.
  const when = $derived(until && status
    ? `${dayLabel(dayOf(until, status.settings.time_zone), dayOf(new Date(), status.settings.time_zone))} ${clock(until, status.settings.time_zone)}`
    : "");

  async function load() { try { { const s = await ledger<Status>("GET", "/status"); if (!sameAnswer(s, status)) status = s; } } catch {} }
  async function end() {
    confirming = false;
    try { await ledger("POST", "/grace/end"); window.dispatchEvent(new Event(RULES_CHANGED)); await load(); } catch {}
  }
  onMount(() => {
    load();
    // The tablet's Today column stays open for days: ask again on its poll, so the banner goes when grace ends.
    const poll = setInterval(load, POLL_MS);
    window.addEventListener(RULES_CHANGED, load);
    return () => { clearInterval(poll); window.removeEventListener(RULES_CHANGED, load); };
  });
</script>

{#if until && status}
  <div class="notice good" transition:reveal={{ axis }}>
    <div class="ntext">
      <span class="cap">Grace period until {when}</span>
      <span>{confirming ? `From now on, a Loosening waits for ${hhmm(status.settings.morning_boundary)}.` : "Every change applies at once while you tune your rules."}</span>
    </div>
    {#if confirming}
      <button class="btn small ghost" onclick={() => (confirming = false)}>Keep</button>
      <button class="btn small primary" onclick={end}>End grace</button>
    {:else}
      <button class="btn small" onclick={() => (confirming = true)}>End now</button>
    {/if}
  </div>
{/if}

<style>
</style>
