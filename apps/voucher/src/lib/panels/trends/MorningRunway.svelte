<script lang="ts">
  // How long do I hold out each morning? A row per week, newest at the
  // bottom (scroll up for earlier ones, as far as the log keeps them), a dot
  // at each Day's first unlock; a hollow dot at the far right for a Day with
  // no unlock at all. The dashed line is the middle first unlock of the last
  // 4 weeks. The hours sit under the scroller and never move.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, mondayOf } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const fit = fitsSlot();
  const START = 6, END = 24;
  const hoursAt = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h < START ? h + 24 : h) + m / 60; };

  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));
  const weeks = $derived.by(() => {
    const map = new Map<string, { day: string; t: number | null }[]>();
    for (const d of days) {
      const key = mondayOf(d.day);
      map.set(key, [...(map.get(key) ?? []), { day: d.day, t: d.first_tear ? hoursAt(d.first_tear) : null }]);
    }
    return [...map.entries()].map(([monday, list]) => ({ monday, list }));
  });
  const recent = $derived(median(days.slice(-28).flatMap((d) => (d.first_tear ? [hoursAt(d.first_tear)] : []))));
  const before = $derived(median(days.slice(-56, -28).flatMap((d) => (d.first_tear ? [hoursAt(d.first_tear)] : []))));

  // Drawn 600 wide; each week a 22-high row.
  const W = 600, x0 = 52, x1 = 560, ROW = 22;
  const H = $derived(weeks.length * ROW);
  const xAt = (h: number) => x0 + ((Math.min(h, END) - START) / (END - START)) * (x1 - x0);

  // Open at the newest weeks.
  let scroller = $state<HTMLDivElement>();
  $effect(() => { weeks.length; if (scroller) scroller.scrollTop = scroller.scrollHeight; });
</script>

<TrendCard title="Morning runway">
  {#if !weeks.length}
    <p class="empty">First unlocks show here as the log fills.</p>
  {:else}
    <div class="wrap" class:fit>
      <div class="rows" bind:this={scroller}>
        <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Each Day's first unlock, by week">
          {#if !Number.isNaN(recent)}<line x1={xAt(recent)} x2={xAt(recent)} y1="0" y2={H} stroke="var(--goal)" stroke-dasharray="4 4" />{/if}
          {#each weeks as w, r (w.monday)}
            {@const y = r * ROW + ROW / 2}
            <text x={x0 - 8} y={y + 3} text-anchor="end">{w.monday.slice(5)}</text>
            <line x1={x0} x2={x1} y1={y} y2={y} stroke="#23272b" />
            {#each w.list as d, i (d.day)}
              {#if d.t === null}<circle cx={x1 + 22} cy={y + (i - 3) * 1.6} r="4" fill="none" stroke="var(--voucher)" stroke-width="1.5"><title>{d.day}: no unlock</title></circle>
              {:else}<circle cx={xAt(d.t)} cy={y + (i - 3) * 1.6} r="4" fill="var(--voucher)" opacity=".8"><title>{d.day}: first unlock {clockOfHours(d.t)}</title></circle>{/if}
            {/each}
          {/each}
        </svg>
      </div>
      <svg class="chart axis" viewBox="0 0 {W} 18" aria-hidden="true">
        {#each [6, 9, 12, 15, 18, 21] as h}<text x={xAt(h)} y="13" text-anchor="middle">{String(h).padStart(2, "0")}</text>{/each}
        <text x={x1 + 22} y="13" text-anchor="middle">none</text>
      </svg>
    </div>
  {/if}
  {#snippet foot()}
    {#if !Number.isNaN(recent)}
      Lately your first unlock comes around <b>{clockOfHours(recent)}</b>{#if !Number.isNaN(before)}, against <b>{clockOfHours(before)}</b> in the 4 weeks before{/if}.
    {:else}No unlocks in the kept log yet.{/if}
  {/snippet}
</TrendCard>

<style>
  .wrap { display: flex; flex-direction: column; gap: 2px; }
  /* About eight weeks in view on a phone; in a tablet slot, whatever height is left. */
  .rows { max-height: 190px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .rows::-webkit-scrollbar { display: none; }
  .wrap.fit { flex: 1; min-height: 0; }
  .wrap.fit .rows { flex: 1; min-height: 0; max-height: none; }
  .axis { flex: none; }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
