<script lang="ts">
  // The notices that concern all of Rules: Protection off or partly on, the
  // looser rules waiting for the morning (one card, or a Review sheet for
  // several), and the grace period after setup. `row` lays them side by side
  // for the tablet's page header; otherwise they stack.
  import { onMount } from "svelte";
  import { fixProtection, ledger, missingProtection, protection, RULES_CHANGED } from "../api";
  import Sheet from "./Sheet.svelte";
  import GraceBanner from "./GraceBanner.svelte";
  import { describe, hhmm, until } from "../rules";
  import type { Protection, Status } from "../types";
  import { reveal } from "../motion";

  let { row = false }: { row?: boolean } = $props();
  /** Notices open out in a column, and fade in place in a row. */
  const axis = $derived(row ? "x" as const : "y" as const);

  let status = $state<Status | null>(null);
  let guard = $state<Protection | null>(null);
  let error = $state<string | null>(null);
  const missing = $derived(missingProtection(guard));

  async function load() {
    try { status = await ledger<Status>("GET", "/status"); error = null; } catch (e) { error = String(e); }
  }
  async function cancel(index: number) {
    try {
      status = await ledger<Status>("POST", `/cancel?index=${index}`);
      window.dispatchEvent(new Event(RULES_CHANGED));
    } catch (e) { error = String(e); }
  }

  // Several waiting changes show as one card that opens a list of them all.
  // The list is a snapshot taken when it opens: cancelling one greys its card
  // in place instead of removing it, so nothing moves under a finger. It
  // reflows only when closed and opened again.
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
    load().then(async () => { guard = await protection(); });
    window.addEventListener(RULES_CHANGED, load);
    return () => window.removeEventListener(RULES_CHANGED, load);
  });
</script>

<div class="notices" class:row>
  {#if error}<p class="error">{error}</p>{/if}
  {#if missing}
    <div class="warn {missing.level}" transition:reveal={{ axis }}>
      <div class="warnbody">
      <div class="warnhead">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M12 8v5M12 16v.01" /></svg>
        <span>{missing.title}</span>
      </div>
      <div class="warntext">{missing.text}</div>
      </div>
      <button onclick={() => missing && fixProtection(missing.part)}>{missing.action}</button>
    </div>
  {/if}

  {#if status}
    {@const s = status.settings}
    <!-- One card whether one change waits or several, so going from one to
         two changes its words without the card leaving and coming back. -->
    {#if status.pending.length}
      <div class="pending" transition:reveal={{ axis }}>
        <div class="ptext">
          <span class="cap">Waiting for {hhmm(s.morning_boundary)}, {until(status.pending[0][1])}</span>
          <span>{status.pending.length === 1 ? describe(status.pending[0], s) : `${status.pending.length} looser rules`}</span>
        </div>
        {#if status.pending.length === 1}
          <button class="pcancel" onclick={() => cancel(0)}>Cancel</button>
        {:else}
          <button class="review" onclick={openReview}>Review</button>
        {/if}
      </div>
    {/if}
    {#if reviewing}
      {@const left = cancelled.filter((c) => !c).length}
      <Sheet onclose={() => (reviewing = false)}>
        <div class="shead">
          <div class="stitle"><h2>Looser rules</h2><span class="cap">Waiting for {hhmm(s.morning_boundary)}{reviewList.length ? `, ${until(reviewList[0][1])}` : ""}</span></div>
          <div class="sactions">
            {#if left > 1}<button class="cancelall" onclick={cancelAll}>Cancel all {left}</button>{/if}
            <button class="done" onclick={() => (reviewing = false)}>Done</button>
          </div>
        </div>
        <div class="plist">
          {#each reviewList as p, j (j)}
            <div class="pcard" class:gone={cancelled[j]}>
              <span class="pdesc">{describe(p, s)}</span>
              {#if cancelled[j]}<span class="cap gonelabel">Cancelled</span>{:else}<button class="pcancel" onclick={() => cancelListed(j)}>Cancel</button>{/if}
            </div>
          {/each}
        </div>
      </Sheet>
    {/if}

  {/if}
  <GraceBanner {axis} />
</div>

<style>
  .notices { display: flex; flex-direction: column; gap: 10px; }
  .notices:not(:has(> *)) { display: none; }
  /* The tablet header: side by side, each as wide as its share. */
  .row { flex-direction: row; align-items: stretch; }
  .row > :global(*) { flex: 1 1 0; min-width: 0; }
  .row .warn { flex-direction: row; align-items: center; gap: 12px; padding: 10px 12px 10px 16px; }
  .row .warn .warnbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .row .warn .warntext { font-size: 13px; }
  .row .warn button { flex: none; min-height: 40px; padding: 0 14px; }
  .warnbody { display: flex; flex-direction: column; gap: 10px; }
  .pending { border-radius: 16px; background: var(--goal-bg); border: 1px solid var(--goal-line); padding: 10px 12px 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .review { flex: none; min-height: 40px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--goal); color: #2a1a04; font: 700 14px var(--font); cursor: pointer; }
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
  .pcancel { flex: none; min-height: 36px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--goal-line); background: transparent; color: var(--goal); font: 700 13px var(--font); cursor: pointer; }
  .cancelall { min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--goal-line); background: var(--goal-bg); color: var(--goal); font: 700 14px var(--font); cursor: pointer; }
  .done { min-height: 40px; padding: 0 18px; border-radius: 12px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 14px var(--font); cursor: pointer; }
  .ptext { display: flex; flex-direction: column; gap: 4px; font-size: 15px; }
  .ptext .cap { color: var(--goal); letter-spacing: .06em; }
  .warn { border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .warn.off { background: #2a1616; border: 1px solid #6b2320; --tone: #ff8a7a; }
  .warn.partial { background: var(--goal-bg); border: 1px solid var(--goal-line); --tone: var(--goal); }
  .warnhead { display: flex; align-items: center; gap: 10px; color: var(--tone); font-size: 16px; font-weight: 700; }
  .warntext { font-size: 14px; line-height: 1.4; }
  .warn button { min-height: 44px; border-radius: 12px; border: 0; background: var(--tone); color: var(--ground); font: 700 14px var(--font); }
  .error { color: var(--goal); }
</style>
