<script lang="ts">
  // The Curfew question, "Did today go the way you wanted?", asked once a
  // Day in the app when Curfew starts (the phone also asks in a
  // notification). One tap, or "Not now". It earns and costs nothing: the
  // answers let Trends check whether goal Days are the Days that felt good,
  // which is a check on the goal itself. `?ask=verdict` shows it any time.
  import { fade } from "svelte/transition";
  import { ledger } from "../api";
  import { ms } from "../motion";
  import Sheet from "./Sheet.svelte";
  import { answerVerdict, dayOfMoment } from "../notes.svelte";
  import { remember, remembered } from "../storage";
  import type { DayTotal, Verdict } from "../types";

  let { curfewActive }: { curfewActive: boolean } = $props();

  let open = $state(false);
  let day = $state("");
  let thanks = $state(false);
  const forced = typeof location !== "undefined" && new URLSearchParams(location.search).get("ask") === "verdict";

  async function check() {
    if (open || (!curfewActive && !forced)) return;
    const d = dayOfMoment(new Date().toISOString());
    if (!forced && remembered(`verdict-asked:${d}`)) return;
    try {
      const [t] = await ledger<DayTotal[]>("GET", "/history?days=1");
      if (t && (t.verdict == null || forced)) { day = t.day; open = true; }
      else remember(`verdict-asked:${d}`, "1");
    } catch { /* asked again on the next check */ }
  }
  $effect(() => {
    curfewActive;
    check();
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  });

  function close() {
    remember(`verdict-asked:${day}`, "1");
    open = false;
  }
  async function answer(v: Verdict) {
    try { await answerVerdict(day, v); } catch { /* the phone's notification can still take it */ }
    thanks = true;
    setTimeout(() => { close(); thanks = false; }, 900);
  }
</script>

{#if open}
  <Sheet onclose={close} tone="night" label="verdict-q">
    {#if thanks}
      <p class="thanks" in:fade={{ duration: ms("base") }}>Kept. Sleep well.</p>
    {:else}
      <h2 id="verdict-q">Did today go the way you wanted?</h2>
      <p class="why">One tap. It doesn't earn or cost anything; Trends uses it to check whether Days that met the Daily goal are the Days that felt good.</p>
      <div class="answers">
        <button class="btn yes" onclick={() => answer("yes")}>Yes</button>
        <button class="btn mostly" onclick={() => answer("mostly")}>Mostly</button>
        <button class="btn no" onclick={() => answer("no")}>No</button>
      </div>
      <button class="btn ghost small later" onclick={close}>Not now</button>
    {/if}
  </Sheet>
{/if}

<style>
  .why { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--night-ink); opacity: .8; }
  .answers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px; }
  /* The shared button, tinted for the Curfew sheet; each answer warms to its own colour when pressed. */
  .answers .btn { background: #1f2440; border-color: var(--night-voucher); }
  .answers .yes:hover, .answers .yes:active { background: var(--heat-1); }
  .answers .mostly:hover, .answers .mostly:active { background: #3a3a1f; }
  .answers .no:hover, .answers .no:active { background: #4a2626; }
  .later { align-self: center; }
  .thanks { margin: 8px 0; text-align: center; font-size: 17px; font-weight: 600; color: var(--night-ink); }
</style>
