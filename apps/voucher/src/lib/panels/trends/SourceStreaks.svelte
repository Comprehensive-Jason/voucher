<script lang="ts">
  // Which habits am I keeping up? A row per switched-on source over the last
  // 28 Days, a cell filled in its colour on each Day it earned at least one
  // Voucher, and how many Days in a row it's earned up to now.
  import TrendCard from "../../components/TrendCard.svelte";
  import { compareSources, styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  import type { DayTotal, SourceProgress } from "../../types";

  let { history, sources }: { history: DayTotal[]; sources: SourceProgress[] } = $props();
  const days = $derived(history.slice(-28));
  // The switched-on sources, or, without that list, whichever sources earned in these Days.
  const ids = $derived(sources.length ? sources.filter((s) => s.on).map((s) => s.id) : [...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))]);
  const rows = $derived(ids
    .map((id) => ({ ...styleOf(id), id }))
    .sort((a, b) => compareSources(a, b))
    .map((s) => {
      const hit = days.map((d) => (d.by_source?.[s.id] ?? 0) > 0);
      // Days in a row up to now; today doesn't break it while it's still open.
      let run = 0;
      for (let i = hit.length - 1; i >= 0; i--) { if (hit[i]) run++; else if (i < hit.length - 1) break; }
      return { ...s, hit, run };
    }));
  const longest = $derived([...rows].sort((a, b) => b.run - a.run)[0]);
</script>

<TrendCard title="Source streaks">
  <div class="grid" class:fit>
    {#each rows as r (r.id)}
      <div class="row">
        <span class="name">{r.name}</span>
        <div class="cells">{#each r.hit as on, i}<i style={on ? `background: ${r.color}` : ""} title={days[i]?.day}></i>{/each}</div>
        <span class="run" class:none={!r.run}>{r.run ? `${r.run} d` : "–"}</span>
      </div>
    {/each}
  </div>
  {#snippet foot()}
    {#if longest && longest.run}<b>{longest.name}</b> has earned every Day for <b>{longest.run}</b> Days; filled squares are Days with at least one Voucher, last 4 weeks.{:else}Filled squares are Days a source earned at least one Voucher, last 4 weeks.{/if}
  {/snippet}
</TrendCard>

<style>
  /* In a tablet slot the list takes the spare height and scrolls. */
  .grid.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .grid { display: flex; flex-direction: column; gap: 6px; }
  .row { display: grid; grid-template-columns: 96px minmax(0, 1fr) 40px; align-items: center; gap: 8px; }
  .name { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .cells { display: grid; grid-template-columns: repeat(28, minmax(0, 1fr)); gap: 2px; }
  .cells i { display: block; aspect-ratio: 1; border-radius: 2px; background: #22262a; }
  .run { font: 700 11px var(--mono); color: var(--ink); text-align: right; }
  .run.none { color: var(--muted); }
</style>
