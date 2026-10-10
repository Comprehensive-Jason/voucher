<script lang="ts">
  // How long do I hold out each morning? A row per week, newest at the
  // bottom (scroll up for earlier ones, as far as the log keeps them), a dot
  // at each Day's first Unlock across the whole Day, 06:00 to 06:00, with
  // Curfew's hours shaded in the night colour; a hollow dot in the "none"
  // column at the far right for a Day with no Unlock at all. The further
  // right the dots, the longer the morning ran before the first Distraction.
  // The dashed line is the middle first Unlock of the last 4 weeks. The
  // hours sit under the scroller and never move, drawn as HourAxis draws them.
  // It follows the shared Day: that Day's dot is ringed and its week scrolled
  // into view, and tapping a dot shares its Day.
  import TrendCard from "../../components/TrendCard.svelte";
  import Legend from "../../components/Legend.svelte";
  import { inCurfew } from "../../curfew.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, mondayOf } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";
  import { selection } from "../../selection.svelte";
  import { untrack } from "svelte";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const fit = fitsSlot();
  const START = 6, END = 30;
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
  /** The Day's hours, 6 to 29 (29 is 05:00), and which fall in Curfew. */
  const HOURS = Array.from({ length: END - START }, (_, i) => START + i);
  const night = $derived(HOURS.filter((h) => inCurfew(h % 24)));
  /** The drawing's units per pixel, which keeps its text one size (see TrendCard). */
  let width = $state(0);
  const k = $derived(W / (width || W));

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
    <p class="empty">First Unlocks show here as the log fills.</p>
  {:else}
    <div class="wrap" class:fit bind:clientWidth={width}>
      <div class="rows" bind:this={scroller}>
        <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Each Day's first Unlock, by week">
          <!-- Curfew's hours, in the night colour behind the rows. -->
          {#each night as h (h)}<rect x={xAt(h)} y="0" width={xAt(h + 1) - xAt(h)} height={H} fill="rgba(125, 140, 255, .09)" />{/each}
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
                {#if d.t === null}<circle {cx} {cy} r="4" fill="none" stroke="var(--voucher)" stroke-width="1.5"><title>{d.day}: no Unlock</title></circle>
                {:else}<circle {cx} {cy} r="4" fill="var(--voucher)" opacity=".8"><title>{d.day}: first Unlock {clockOfHours(d.t)}</title></circle>{/if}
              </g>
            {/each}
          {/each}
        </svg>
      </div>
      <!-- As HourAxis draws them: every third hour from each hour's start, Curfew's in the night colour. -->
      <svg class="chart axis" viewBox="0 0 {W} 18" style="--k: {k}" aria-hidden="true">
        {#each HOURS.filter((h) => (h - START) % 3 === 0) as h (h)}<text class="hour" class:night={inCurfew(h % 24)} x={xAt(h)} y="13">{String(h % 24).padStart(2, "0")}</text>{/each}
        <text class="hour" x={x1 + 22} y="13" text-anchor="middle">none</text>
      </svg>
    </div>
    <Legend items={[{ kind: "dot", color: "var(--voucher)", label: "A Day's first Unlock" }, { kind: "ring", color: "var(--voucher)", label: "No Unlock" }, { kind: "usual", color: "var(--goal)", label: "Usual lately" }]} note="further right: a longer morning" />
  {/if}
  {#snippet foot()}
    {#if !Number.isNaN(recent)}
      Lately your first Unlock comes around <b>{clockOfHours(recent)}</b>{#if !Number.isNaN(before)}, against <b>{clockOfHours(before)}</b> in the 4 weeks before{/if}.
    {:else}No Unlocks in the kept log yet.{/if}
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
  /* HourAxis's look: 10px mono hour labels, Curfew's in the night colour. */
  .axis text.hour { font-size: calc(var(--axis-size) * var(--k, 1)); font-weight: 500; }
  .axis text.hour.night { fill: #7d8cff; }
</style>
