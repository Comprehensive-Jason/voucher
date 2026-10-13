<script lang="ts">
  // A running Experiment, from its row on the Insights card: where it is,
  // when its verdict comes, and ending it early. Ending early undoes the
  // change, which for a tightening is a loosening, so it waits for 06:00.
  import Sheet from "$core/components/Sheet.svelte";
  import Marker from "$core/components/Marker.svelte";
  import { backWords, progress } from "$core/insights/experiments";
  import { insights } from "$core/insights/store.svelte";
  import { running } from "$core/insights/text";
  import type { Experiment } from "$core/insights/types";
  import { shiftDay, shortDate } from "$core/time";
  import { actionFailed } from "$core/toast.svelte";

  let { e, today, onclose }: { e: Experiment; today: string; onclose: () => void } = $props();
  const p = $derived(progress(e, today));
  const d = (day: string) => shortDate(day, today);
  let busy = $state(false);

  async function end(ev: Event) {
    busy = true;
    try { await insights.end(e.id, false); onclose(); } catch (err) { actionFailed(err, "The Ledger didn't end it. Try again.", ev.currentTarget as Element); } finally { busy = false; }
  }
</script>

<Sheet {onclose} label="exp-h">
  <span class="cap exp"><Marker kind="rule" color="var(--marker)" size={12} />Experiment</span>
  <h2 id="exp-h">{running(e, p.waiting ? 0 : p.day)[0].text}</h2>
  <div class="points">
    {#if p.waiting}<p>It starts at <b>06:00</b>, with its Marker.</p>{/if}
    <p><b>{d(e.start_day)}</b> to <b>{d(shiftDay(e.start_day, e.settle_days - 1))}</b> settle in. <b>{d(p.measureStart)}</b> to <b>{d(shiftDay(e.verdict_day, -1))}</b> are compared with the 14 Days before.</p>
    <p>The verdict comes on <b>{d(e.verdict_day)}</b>, in one notification.</p>
    <p>Ending it now means no verdict, and {backWords(e).replace(/^Go back/, "going back").replace(/^Unblock/, "unblocking")}: {"DailyGoal" in e.change ? "that waits for the next Day" : "a loosening, so it waits until 06:00"}.</p>
  </div>
  <div class="actions">
    <button class="btn ghost" onclick={onclose}>Keep going</button>
    <button class="btn danger" disabled={busy} onclick={end}>End it now</button>
  </div>
</Sheet>

<style>
  .exp { color: var(--marker); display: flex; align-items: center; gap: 7px; }
  .points { display: flex; flex-direction: column; gap: 6px; }
  .points p { position: relative; margin: 0; padding-left: 13px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .points p::before { content: ""; position: absolute; left: 2px; top: .66em; width: 4px; height: 4px; border-radius: 50%; background: var(--muted); }
  .points b { color: var(--ink); font-family: var(--mono); font-weight: 600; }
  .actions { display: grid; grid-template-columns: auto 1fr; gap: 10px; margin-top: 2px; }
</style>
