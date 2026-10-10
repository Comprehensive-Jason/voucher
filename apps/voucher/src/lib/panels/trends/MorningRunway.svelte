<script lang="ts">
  // How long do I hold out each morning? A row per week (the last 8), a dot
  // at each Day's first tear; a hollow dot at the far right for a Day with no
  // tear at all. The dashed line is the middle first tear of the last 4 weeks.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, mondayOf } from "../../trends";
  import type { DayTotal } from "../../types";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
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
    return [...map.entries()].slice(-8).map(([monday, list]) => ({ monday, list }));
  });
  const recent = $derived(median(days.slice(-28).flatMap((d) => (d.first_tear ? [hoursAt(d.first_tear)] : []))));
  const before = $derived(median(days.slice(-56, -28).flatMap((d) => (d.first_tear ? [hoursAt(d.first_tear)] : []))));

  const W = 600, x0 = 52, x1 = 560, y1 = 6;
  const natural = $derived(y1 + weeks.length * 22 + 22);
  const H = $derived(fit ? drawHeight(pw, ph, natural) : natural);
  const rowH = $derived((H - y1 - 22) / Math.max(1, weeks.length));
  const xAt = (h: number) => x0 + ((Math.min(h, END) - START) / (END - START)) * (x1 - x0);
</script>

<TrendCard title="Morning runway">
  {#if !weeks.length}
    <p class="empty">First unlocks show here as the log fills.</p>
  {:else}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Each Day's first unlock, by week">
      {#each weeks as w, r}
        {@const y = y1 + r * rowH + rowH / 2}
        <text x={x0 - 8} y={y + 3} text-anchor="end">{w.monday.slice(5)}</text>
        <line x1={x0} x2={x1} y1={y} y2={y} stroke="#23272b" />
        {#each w.list as d, i}
          {#if d.t === null}<circle cx={x1 + 22} cy={y + (i - 3) * 1.6} r="4" fill="none" stroke="var(--voucher)" stroke-width="1.5"><title>{d.day}: no unlock</title></circle>
          {:else}<circle cx={xAt(d.t)} cy={y + (i - 3) * 1.6} r="4" fill="var(--voucher)" opacity=".8"><title>{d.day}: first unlock {clockOfHours(d.t)}</title></circle>{/if}
        {/each}
      {/each}
      {#if !Number.isNaN(recent)}<line x1={xAt(recent)} x2={xAt(recent)} y1={y1} y2={H - 20} stroke="var(--goal)" stroke-dasharray="4 4" />{/if}
      {#each [6, 9, 12, 15, 18, 21] as h}<text x={xAt(h)} y={H - 4} text-anchor="middle">{String(h).padStart(2, "0")}</text>{/each}
      <text x={x1 + 22} y={H - 4} text-anchor="middle">none</text>
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
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
