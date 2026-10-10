<script lang="ts">
  // How does this streak compare with my others? The last nine runs of goal
  // Days (two or more long), oldest at the top: the current one in green,
  // the best outlined in gold. The gaps between them show that coming back
  // is normal.
  import TrendCard from "../../components/TrendCard.svelte";
  import { goalRuns } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const runs = $derived(goalRuns(history));
  const shown = $derived(runs.filter((r) => r.length >= 2).slice(-9));
  const best = $derived(Math.max(1, ...runs.map((r) => r.length)));
  const lastDay = $derived(history.at(-1)?.day);
  const yesterday = $derived(history.at(-2)?.day);
  /** The run still going: it ends today, or yesterday while today's goal is still open. */
  const current = $derived(runs.at(-1) && (runs.at(-1)!.end === lastDay || runs.at(-1)!.end === yesterday) ? runs.at(-1)! : null);
</script>

<TrendCard title="Streak ladder">
  {#if !shown.length}
    <p class="empty">Two goal Days in a row start the ladder.</p>
  {:else}
    <div class="ladder" class:fit>
      {#each shown as r (r.end)}
        <div class="rung">
          <i class:current={r === current} class:best={r.length === best} style="width: {(r.length / best) * 100}%"></i>
          <span class:gold={r.length === best}>{r.length} d{r.length === best ? ", best" : ""}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet foot()}
    {#if current}Your current streak is <b>{current.length}</b> Days; your best is <b>{best}</b>.{:else}No streak running; your best is <b>{best}</b> Days.{/if}
  {/snippet}
</TrendCard>

<style>
  /* In a tablet slot the list takes the spare height and scrolls. */
  .ladder.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .ladder { display: flex; flex-direction: column; gap: 6px; }
  .rung { display: grid; grid-template-columns: minmax(0, 1fr) 80px; align-items: center; gap: 8px; }
  .rung i { display: block; height: 14px; border-radius: 4px; background: #2fb36b; opacity: .55; min-width: 4px; }
  .rung i.current { background: var(--voucher); opacity: 1; }
  .rung i.best { outline: 2px solid var(--goal); outline-offset: -2px; }
  .rung span { font: 500 11px var(--mono); color: var(--muted); }
  .rung span.gold { color: var(--goal); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
