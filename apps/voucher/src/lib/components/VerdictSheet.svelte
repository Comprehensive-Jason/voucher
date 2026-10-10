<script lang="ts">
  // The Curfew question, "Did today go the way you wanted?", asked once a
  // Day in the app when Curfew starts (the phone also asks in a
  // notification). One tap, or "Not now". It earns and costs nothing: the
  // answers let Trends check whether goal Days are the Days that felt good,
  // which is a check on the goal itself.
  //
  // After the answer the sheet stays open on a second question, "Anything
  // new today?": one-tap Markers for life events (a dose, being sick, an
  // exam), which Before and after compares either side of. Rule changes add
  // their own Markers; these need Jason. They come after the answer rather
  // than under it so the question itself stays one clean tap.
  //
  // `?ask=verdict` shows the question any time; `?ask=marker` (the phone's
  // "Add a Marker") goes straight to the Markers. Either is shown once, then
  // dropped from the address so the minute check doesn't bring it back.
  import { fade } from "svelte/transition";
  import { untrack } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ledger } from "../api";
  import { ms } from "../motion";
  import Sheet from "./Sheet.svelte";
  import MarkerChips from "./MarkerChips.svelte";
  import { answerVerdict, dayNow } from "../notes.svelte";
  import { remember, remembered } from "../storage";
  import type { DayTotal, Verdict } from "../types";

  let { curfewActive }: { curfewActive: boolean } = $props();

  type Ask = "verdict" | "marker";
  let open = $state(false);
  let day = $state("");
  let step = $state<"question" | "markers">("question");
  let kept = $state<Verdict | null>(null);

  async function check(ask?: Ask) {
    if (open) { if (ask === "marker") step = "markers"; return; }
    if (!curfewActive && !ask) return;
    const d = dayNow();
    if (!ask && remembered(`verdict-asked:${d}`)) return;
    if (ask === "marker") { day = d; kept = null; step = "markers"; open = true; return; }
    try {
      const [t] = await ledger<DayTotal[]>("GET", "/history?days=1");
      if (t && (t.verdict == null || ask)) { day = t.day; kept = null; step = "question"; open = true; }
      else remember(`verdict-asked:${d}`, "1");
    } catch { /* asked again on the next check */ }
  }
  $effect(() => {
    curfewActive;
    untrack(() => check());
    const timer = setInterval(check, 60_000);
    return () => clearInterval(timer);
  });

  const ask = $derived(page.url.searchParams.get("ask"));
  $effect(() => {
    if (ask !== "verdict" && ask !== "marker") return;
    const a: Ask = ask;
    untrack(() => {
      check(a);
      const url = new URL(page.url);
      url.searchParams.delete("ask");
      goto(url.pathname + url.search + url.hash, { replaceState: true, noScroll: true, keepFocus: true }).catch(() => {});
    });
  });

  function close() {
    remember(`verdict-asked:${day}`, "1");
    open = false;
  }
  function answer(v: Verdict) {
    kept = v;
    step = "markers";
    answerVerdict(day, v).catch(() => { /* the phone's notification can still take it */ });
  }

  const LABEL: Record<Verdict, string> = { yes: "Yes", mostly: "Mostly", no: "No" };
</script>

{#if open}
  <Sheet onclose={close} tone="night" label="verdict-q">
    {#if step === "question"}
      <h2 id="verdict-q">Did today go the way you wanted?</h2>
      <p class="why">One tap. It doesn't earn or cost anything; Trends uses it to check whether Days that met the Daily goal are the Days that felt good.</p>
      <div class="answers">
        <button class="btn yes" onclick={() => answer("yes")}>Yes</button>
        <button class="btn mostly" onclick={() => answer("mostly")}>Mostly</button>
        <button class="btn no" onclick={() => answer("no")}>No</button>
      </div>
      <button class="btn ghost small later" onclick={close}>Not now</button>
    {:else}
      <div class="step" in:fade={{ duration: ms("base") }}>
        {#if kept}<p class="cap kept">Kept: {LABEL[kept]}</p>{/if}
        <h2 id="verdict-q">Anything new today?</h2>
        <p class="why">A tap adds a Marker for today. Before and after, in Trends, compares the two weeks either side of it.</p>
        <MarkerChips />
        <button class="btn small done" onclick={close}>Done</button>
      </div>
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
  /* The Markers step: the sheet's own gap between its parts, the chips tinted like the answers. */
  .step { display: flex; flex-direction: column; gap: 14px; --chip-bg: #1f2440; --chip-line: var(--night-voucher); }
  .kept { margin: 0 0 -8px; color: var(--night); }
  .done { align-self: center; min-width: 120px; margin-top: 4px; background: #1f2440; border-color: var(--night-voucher); }
</style>
