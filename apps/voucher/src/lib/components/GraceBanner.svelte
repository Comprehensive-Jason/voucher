<script lang="ts">
  // The first two days after setup, every change applies at once. This says
  // until when, and lets the user end it early (a second tap confirms).
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED } from "../api";
  import { hhmm } from "../rules";
  import type { Status } from "../types";
  import { reveal } from "../motion";

  let { axis = "y" }: { axis?: "x" | "y" } = $props();

  let status = $state<Status | null>(null);
  let confirming = $state(false);
  const until = $derived(status?.grace_until ?? null);
  const when = $derived(until && status
    ? new Date(until).toLocaleString("en-US", { timeZone: status.settings.time_zone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).replace(",", "")
    : "");

  async function load() { try { status = await ledger<Status>("GET", "/status"); } catch {} }
  async function end() {
    confirming = false;
    try { await ledger("POST", "/grace/end"); window.dispatchEvent(new Event(RULES_CHANGED)); await load(); } catch {}
  }
  onMount(() => {
    load();
    window.addEventListener(RULES_CHANGED, load);
    return () => window.removeEventListener(RULES_CHANGED, load);
  });
</script>

{#if until && status}
  <div class="grace" transition:reveal={{ axis }}>
    <div class="text">
      <span class="cap">Grace period until {when}</span>
      <span>{confirming ? `From now on, loosening a rule waits for ${hhmm(status.settings.morning_boundary)}.` : "Every change applies at once while you tune your rules."}</span>
    </div>
    {#if confirming}
      <button class="keep" onclick={() => (confirming = false)}>Keep</button>
      <button class="end sure" onclick={end}>End grace</button>
    {:else}
      <button class="end" onclick={() => (confirming = true)}>End now</button>
    {/if}
  </div>
{/if}

<style>
  .grace { display: flex; align-items: center; gap: 10px; padding: 10px 12px 10px 14px; border-radius: 14px; background: var(--unlocked-bg); border: 1px solid var(--unlocked-line); }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; font-size: 13px; color: var(--ink); line-height: 1.35; }
  .cap { color: var(--voucher); }
  button { flex: none; min-height: 36px; padding: 0 12px; border-radius: 10px; font: 700 13px var(--font); cursor: pointer; }
  .end { border: 1px solid var(--unlocked-line); background: transparent; color: var(--voucher); }
  .end.sure { background: var(--voucher); color: var(--voucher-ink); border-color: var(--voucher); }
  .keep { border: 1px solid var(--line); background: transparent; color: var(--ink); }
</style>
