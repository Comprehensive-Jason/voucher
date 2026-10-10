<script lang="ts">
  // The Curfew question, "Did today go the way you wanted?", asked once a
  // Day in the app when Curfew starts (the phone also asks in a
  // notification). One tap, or "Not now". It earns and costs nothing: the
  // answers let Trends check whether goal Days are the Days that felt good,
  // which is a check on the goal itself. `?ask=verdict` shows it any time.
  import { fade, fly } from "svelte/transition";
  import { ledger } from "../api";
  import { easeOut, ms } from "../motion";
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
  <div class="scrim" transition:fade={{ duration: ms("base") }} onclick={close} aria-hidden="true"></div>
  <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="verdict-q" transition:fly={{ y: 24, duration: ms("move"), easing: easeOut }}>
    {#if thanks}
      <p class="thanks" in:fade={{ duration: ms("base") }}>Kept. Sleep well.</p>
    {:else}
      <h2 id="verdict-q">Did today go the way you wanted?</h2>
      <p class="why">One tap. It doesn't earn or cost anything; Trends uses it to check whether goal Days are the Days that felt good.</p>
      <div class="answers">
        <button class="yes" onclick={() => answer("yes")}>Yes</button>
        <button class="mostly" onclick={() => answer("mostly")}>Mostly</button>
        <button class="no" onclick={() => answer("no")}>No</button>
      </div>
      <button class="later" onclick={close}>Not now</button>
    {/if}
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; z-index: 40; background: rgba(5, 6, 12, .6); }
  .sheet { position: fixed; z-index: 41; left: 50%; top: 50%; translate: -50% -50%; width: min(440px, calc(100vw - 32px)); box-sizing: border-box; padding: 24px; border-radius: 22px; background: #161a2e; border: 1px solid #2c3358; display: flex; flex-direction: column; gap: 14px; box-shadow: 0 20px 60px rgba(0, 0, 0, .5); }
  h2 { margin: 0; font-size: 21px; line-height: 1.25; color: var(--ink); }
  .why { margin: 0; font-size: 13.5px; line-height: 1.45; color: #a9b0d6; }
  .answers { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; margin-top: 4px; }
  .answers button { height: 52px; border-radius: 14px; border: 1px solid #2c3358; background: #1f2440; color: var(--ink); font: 700 16px var(--font); cursor: pointer; transition: background-color var(--t-base), scale var(--t-quick) var(--ease-out); }
  .answers button:active { scale: .95; }
  .answers .yes:hover, .answers .yes:active { background: #1d4d33; }
  .answers .mostly:hover, .answers .mostly:active { background: #3a3a1f; }
  .answers .no:hover, .answers .no:active { background: #4a2626; }
  .later { align-self: center; height: 36px; padding: 0 14px; border: 0; background: none; color: #8d94bd; font: 600 13px var(--font); cursor: pointer; }
  .thanks { margin: 8px 0; text-align: center; font-size: 17px; font-weight: 600; color: #c9cfff; }
</style>
