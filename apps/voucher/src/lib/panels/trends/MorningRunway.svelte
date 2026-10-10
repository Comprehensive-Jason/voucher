<script lang="ts">
  // How long do I hold out each morning? A row per week, newest at the
  // bottom (scroll up for earlier ones, as far as the log keeps them), a dot
  // at each Day's first unlock; a hollow dot at the far right for a Day with
  // no unlock at all. The further right the dots, the longer the morning ran
  // before the first Distraction. The dashed line is the middle first unlock
  // of the last 4 weeks. The hours sit under the scroller and never move.
  // It follows the shared Day: that Day's dot is ringed and its week scrolled
  // into view, and tapping a dot shares its Day.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, mondayOf } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";
  import { selection } from "../../selection.svelte";
  import { untrack } from "svelte";

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

  // Open at the newest weeks; follow the shared Day to its week.
  let scroller = $state<HTMLDivElement>();
  const today = $derived(history.at(-1)?.day ?? "");
  const chosen = $derived(selection.day ?? today);
  const chosenRow = $derived(weeks.findIndex((w) => w.monday === mondayOf(chosen)));
  $effect(() => { weeks.length; if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  $effect(() => {
    selection.seq;
    const row = chosenRow;
    untrack(() => {
      if (!scroller || selection.from === "runway") return;
      if (row < 0) { scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }); return; }
      // The row's place in pixels: the SVG scales to the scroller's width.
      const px = (row * ROW + ROW / 2) * (scroller.clientWidth / W);
      scroller.scrollTo({ top: Math.max(0, px - scroller.clientHeight / 2), behavior: "smooth" });
    });
  });
  const pick = (day: string) => selection.set("runway", { day: day === today ? null : day, picked: true });
</script>

<TrendCard title="Morning runway" date={{ day: selection.day ?? today, today, oldest: days[0]?.day, onpick: (d) => selection.set("runway-step", { day: d === today ? null : d, picked: false }) }}>
  {#if !weeks.length}
    <p class="empty">First unlocks show here as the log fills.</p>
  {:else}
    <div class="legend">
      <span><i class="dot"></i>A Day's first Unlock</span>
      <span><i class="ring"></i>No Unlock</span>
      <span><i class="usual"></i>Usual lately</span>
      <span class="small">further right: a longer morning</span>
    </div>
    <div class="wrap" class:fit>
      <div class="rows" bind:this={scroller}>
        <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Each Day's first unlock, by week">
          {#if !Number.isNaN(recent)}<line x1={xAt(recent)} x2={xAt(recent)} y1="0" y2={H} stroke="var(--goal)" stroke-dasharray="4 4" />{/if}
          {#if chosenRow >= 0}<rect x="0" y={chosenRow * ROW} width={W} height={ROW} rx="4" fill="#ffffff" opacity=".045" />{/if}
          {#each weeks as w, r (w.monday)}
            {@const y = r * ROW + ROW / 2}
            <text x={x0 - 8} y={y + 3} text-anchor="end">{w.monday.slice(5)}</text>
            <line x1={x0} x2={x1} y1={y} y2={y} stroke="#23272b" />
            {#each w.list as d, i (d.day)}
              {@const cx = d.t === null ? x1 + 22 : xAt(d.t)}
              {@const cy = y + (i - 3) * 1.6}
              {#if d.day === chosen}<circle {cx} {cy} r="8" fill="none" stroke="var(--ink)" stroke-width="1.5" />{/if}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <g class="dot" onclick={() => pick(d.day)}>
                <circle {cx} {cy} r="9" fill="transparent" />
                {#if d.t === null}<circle {cx} {cy} r="4" fill="none" stroke="var(--voucher)" stroke-width="1.5"><title>{d.day}: no unlock</title></circle>
                {:else}<circle {cx} {cy} r="4" fill="var(--voucher)" opacity=".8"><title>{d.day}: first unlock {clockOfHours(d.t)}</title></circle>{/if}
              </g>
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
  .dot { cursor: pointer; }
  .legend { display: flex; flex-wrap: wrap; gap: 4px 12px; font-size: 12px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { display: inline-block; width: 8px; height: 8px; border-radius: 50%; }
  .legend i.dot { background: var(--voucher); }
  .legend i.ring { border: 1.5px solid var(--voucher); box-sizing: border-box; }
  .legend i.usual { width: 2px; height: 12px; border-radius: 0; background: repeating-linear-gradient(180deg, var(--goal) 0 3px, transparent 3px 5px); }
  .legend .small { margin-left: auto; font-size: 11px; color: #6f757b; }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
