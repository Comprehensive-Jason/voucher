<script lang="ts">
  // The Loosenings waiting for the morning: one gold card whether one change
  // waits or several, with Cancel for one and a Review sheet for several.
  // Rules shows it among its notices; the tablet's Today column shows it at
  // its foot, so a waiting change is in view every time the tablet is. It
  // asks the Ledger itself, again whenever Rules change and on Today's poll.
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED } from "../api";
  import Sheet from "./Sheet.svelte";
  import { describe, hhmm, until } from "../rules";
  import { POLL_MS } from "../live.svelte";
  import type { Status } from "../types";
  import { reveal } from "../motion";

  let { axis = "y" }: { axis?: "x" | "y" } = $props();

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);

  async function load() {
    try { status = await ledger<Status>("GET", "/status"); error = null; } catch (e) { error = String(e); }
  }
  async function cancel(index: number) {
    try {
      status = await ledger<Status>("POST", `/cancel?index=${index}`);
      window.dispatchEvent(new Event(RULES_CHANGED));
    } catch (e) { error = String(e); }
  }

  // The Review list is a snapshot taken when it opens: cancelling one greys
  // its card in place instead of removing it, so nothing moves under a
  // finger. It reflows only when closed and opened again.
  let reviewing = $state(false);
  let reviewList = $state<Status["pending"]>([]);
  let cancelled = $state<boolean[]>([]);
  function openReview() {
    reviewList = [...(status?.pending ?? [])];
    cancelled = reviewList.map(() => false);
    reviewing = true;
  }
  /** Cancels one listed change, wherever it now sits among the waiting ones. */
  async function cancelListed(j: number) {
    const want = JSON.stringify(reviewList[j]);
    const index = status?.pending.findIndex((p) => JSON.stringify(p) === want) ?? -1;
    if (index < 0) { cancelled[j] = true; return; }
    await cancel(index);
    if (!error) cancelled[j] = true;
  }
  async function cancelAll() {
    for (let j = 0; j < reviewList.length; j++) if (!cancelled[j]) await cancelListed(j);
  }

  onMount(() => {
    load();
    // At the morning boundary the changes apply, and the card goes.
    const poll = setInterval(load, POLL_MS);
    window.addEventListener(RULES_CHANGED, load);
    return () => { clearInterval(poll); window.removeEventListener(RULES_CHANGED, load); };
  });
</script>

{#if error}<p class="error">{error}</p>{/if}
{#if status}
  {@const s = status.settings}
  {#if status.pending.length}
    <div class="pending" transition:reveal={{ axis }}>
      <div class="ptext">
        <span class="cap">Waiting for {hhmm(s.morning_boundary)}, {until(status.pending[0][1])}</span>
        <span>{status.pending.length === 1 ? describe(status.pending[0], s) : `${status.pending.length} Loosenings`}</span>
      </div>
      {#if status.pending.length === 1}
        <button class="btn small" onclick={() => cancel(0)}>Cancel</button>
      {:else}
        <button class="btn small" onclick={openReview}>Review</button>
      {/if}
    </div>
  {/if}
  {#if reviewing}
    {@const left = cancelled.filter((c) => !c).length}
    <Sheet onclose={() => (reviewing = false)}>
      <div class="shead">
        <div class="stitle"><h2>Loosenings</h2><span class="cap">Waiting for {hhmm(s.morning_boundary)}{reviewList.length ? `, ${until(reviewList[0][1])}` : ""}</span></div>
        <div class="sactions">
          {#if left > 1}<button class="btn small" onclick={cancelAll}>Cancel all {left}</button>{/if}
          <button class="btn small primary" onclick={() => (reviewing = false)}>Done</button>
        </div>
      </div>
      <div class="plist">
        {#each reviewList as p, j (j)}
          <div class="pcard" class:gone={cancelled[j]}>
            <span class="pdesc">{describe(p, s)}</span>
            {#if cancelled[j]}<span class="cap gonelabel">Cancelled</span>{:else}<button class="btn small" onclick={() => cancelListed(j)}>Cancel</button>{/if}
          </div>
        {/each}
      </div>
    </Sheet>
  {/if}
{/if}

<style>
  .pending { border-radius: 16px; background: var(--goal-bg); border: 1px solid var(--goal-line); padding: 10px 12px 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .shead { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 12px; }
  .stitle { display: flex; flex-direction: column; gap: 4px; }
  .stitle h2 { margin: 0; font-size: 18px; }
  .sactions { display: flex; gap: 8px; }
  /* Cards across the sheet's width: one column on a phone, several on a tablet. */
  .plist { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(100%, 260px), 1fr)); gap: 10px; }
  .pcard { min-height: 64px; border-radius: 14px; background: var(--goal-bg); border: 1px solid var(--goal-line); padding: 10px 10px 10px 14px; display: flex; align-items: center; justify-content: space-between; gap: 10px; font-size: 14px; }
  .pcard.gone { background: transparent; border-color: var(--line); color: var(--muted); }
  .pcard.gone .pdesc { text-decoration: line-through; }
  .gonelabel { color: var(--muted); padding-right: 6px; }
  .pending .btn, .pcard .btn { flex: none; }
  .ptext { min-width: 0; display: flex; flex-direction: column; gap: 4px; font-size: 15px; }
  .ptext .cap { color: var(--goal); letter-spacing: .06em; }
  .error { margin: 0; color: var(--danger); }
</style>
