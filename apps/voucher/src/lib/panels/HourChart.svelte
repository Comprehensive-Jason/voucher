<script lang="ts">
  // Each Day's earnings hour by hour (its totals are in the list below): a bar per hour, split into a segment per
  // source and topped with its count, over faint tick lines, with a triangle under
  // each hour that had a Redemption. Tap a bar to pick that hour: the others
  // fade and the line below lists its count per source (otherwise it lists
  // the whole Day's). Today shows first; swipe (or the arrows) back through
  // earlier Days, as far as the Ledger keeps logs. Past Days load as they
  // come near the screen.
  import { onMount, untrack } from "svelte";
  import { ledger } from "../api";
  import { SOURCES, sourceOf } from "../sources";
  import { dayLabel, hourOf, shiftDay } from "../time";
  import Marker from "../components/Marker.svelte";
  import type { DaySummary } from "../types";

  let { today, timeZone, tall = false, firstDay, focus = null, shownDay = $bindable() }: {
    today: DaySummary; timeZone: string; tall?: boolean;
    /** The oldest Day whose log the Ledger keeps; without it, only today shows. */
    firstDay?: string;
    /** A Day to scroll to (from the history grid); `at` makes each request new. */
    focus?: { day: string; at: number } | null;
    /** The Day in view, for the history grid to mark. */
    shownDay?: string;
  } = $props();

  const FIRST_HOUR = 6;
  const HOURS = 18; // 06 to 23; anything after midnight joins the last column
  const chart = $derived(tall ? 150 : 84);

  /** Every Day from the Ledger's first to today, oldest first, so any Day the
   *  history grid offers can be shown. Days older than the kept log show their
   *  total without the hour-by-hour detail. */
  const days = $derived.by(() => {
    const out: string[] = [];
    if (firstDay && firstDay < today.day) {
      for (let d = firstDay; d < today.day && out.length < 3650; d = shiftDay(d, 1)) out.push(d);
    }
    out.push(today.day);
    return out;
  });

  let past = $state<Record<string, DaySummary>>({});
  let shown = $state(0);
  let scroller = $state<HTMLDivElement>();
  const summaryOf = (day: string) => (day === today.day ? today : past[day]);
  const current = $derived(summaryOf(days[shown]));

  // Segments stack in a fixed source order, so a source sits at the same
  // place in every bar (the first at the bottom).
  const ORDER = Object.values(SOURCES).map((s) => s.name);
  type Part = { name: string; color: string; n: number };
  const rank = (name: string) => (ORDER.includes(name) ? ORDER.indexOf(name) : ORDER.length);
  function partsOf(counts: Map<string, Part>): Part[] {
    return [...counts.values()].sort((a, b) => rank(a.name) - rank(b.name));
  }
  function columnsOf(summary: DaySummary | undefined) {
    const cols = Array.from({ length: HOURS }, () => ({ counts: new Map<string, Part>(), total: 0, redeemed: 0 }));
    for (const e of summary?.log ?? []) {
      const h = hourOf(e.at, timeZone);
      const col = h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
      if (e.kind === "earned") {
        const { name, color } = sourceOf(e.task);
        const part = cols[col].counts.get(name) ?? { name, color, n: 0 };
        part.n++;
        cols[col].counts.set(name, part);
        cols[col].total++;
      } else if (e.kind === "redeemed") cols[col].redeemed += e.tickets;
    }
    // Bars draw top to bottom, so the first source in ORDER ends up lowest.
    return cols.map((c) => ({ ...c, parts: partsOf(c.counts), segments: partsOf(c.counts).reverse() }));
  }
  /** What the line under the chart lists: the picked hour, or the whole Day. */
  function breakdownOf(cols: ReturnType<typeof columnsOf>, pick: number | null) {
    if (pick !== null) {
      const c = cols[pick];
      const hour = FIRST_HOUR + pick;
      const label = pick === HOURS - 1 ? "23:00 onward" : `${String(hour).padStart(2, "0")}:00 to ${String(hour + 1).padStart(2, "0")}:00`;
      return { label, parts: c.parts, redeemed: c.redeemed };
    }
    const all = new Map<string, Part>();
    for (const c of cols) for (const p of c.parts) {
      const sum = all.get(p.name) ?? { ...p, n: 0 };
      sum.n += p.n;
      all.set(p.name, sum);
    }
    return { label: "All day", parts: partsOf(all), redeemed: cols.reduce((n, c) => n + c.redeemed, 0) };
  }
  /** The top tick line's number: the smallest even number at or above the
   *  busiest hour, and at least 2, so the half-way line is a whole number. */
  function topOf(cols: ReturnType<typeof columnsOf>): number {
    const max = Math.max(0, ...cols.map((c) => c.total));
    return Math.max(2, max + (max % 2));
  }
  // Two tick lines that never move, at half and full height; their numbers
  // follow the Day's busiest hour (topOf), and bars scale to match. Segments
  // never drop below MIN_SEGMENT, and the count on top says exactly how many.
  const LABEL = 14;
  const MIN_SEGMENT = 3;
  const plot = $derived(chart - LABEL);
  function unitOf(cols: ReturnType<typeof columnsOf>) {
    return plot / topOf(cols);
  }

  async function load(index: number) {
    const day = days[index];
    if (!day || day === today.day || past[day]) return;
    try { past[day] = await ledger<DaySummary>("GET", `/day?date=${day}`); } catch { /* stays blank */ }
  }

  // Report the Day in view, and scroll to a Day the history grid asks for
  // (the nearest kept Day if its log is gone).
  $effect(() => { shownDay = days[shown]; });
  $effect(() => {
    const want = focus;
    if (!want || !scroller) return;
    untrack(() => {
      let index = days.indexOf(want.day);
      if (index < 0) index = want.day < days[0] ? 0 : days.length - 1;
      scroller!.scrollTo({ left: index * scroller!.clientWidth, behavior: "smooth" });
    });
  });

  // The picked hour, on the Day in view; moving to another Day lets it go.
  let pick = $state<number | null>(null);
  // The list keeps the Day's sources in place whichever hour is picked, so it
  // doesn't jump; an hour without a source shows a dash for it.
  const breakdown = $derived.by(() => {
    const cols = columnsOf(current);
    const day = breakdownOf(cols, null);
    const now = pick === null ? day : breakdownOf(cols, pick);
    const rows = day.parts.map((p) => ({ ...p, n: now.parts.find((q) => q.name === p.name)?.n ?? 0 }));
    return { label: now.label, total: rows.reduce((n, r) => n + r.n, 0), rows, redeemed: now.redeemed, anyRedeemed: day.redeemed > 0 };
  });
  function onScroll() {
    if (!scroller) return;
    const now = Math.round(scroller.scrollLeft / scroller.clientWidth);
    if (now !== shown) pick = null;
    shown = now;
    load(shown - 1); load(shown); load(shown + 1);
  }
  function go(by: number) {
    scroller?.scrollTo({ left: (shown + by) * scroller.clientWidth, behavior: "smooth" });
  }

  // Open on today, and stay on today as Days are added, unless scrolled back.
  let onToday = true;
  // Only the number of Days and the scroller re-run this; reading `shown`
  // here would snap every scroll straight back to today.
  $effect(() => {
    const count = days.length;
    const el = scroller;
    untrack(() => {
      if (!el || !onToday) return;
      el.scrollLeft = el.scrollWidth;
      shown = count - 1;
      load(shown - 1);
    });
  });
  onMount(() => {
    const track = () => { onToday = shown >= days.length - 1; };
    scroller?.addEventListener("scrollend", track);
    return () => scroller?.removeEventListener("scrollend", track);
  });
</script>

<section class="card" class:tall>
  <div class="head">
    <div class="switcher">
      {#if days.length > 1}
        <button class="nav" aria-label="Earlier day" disabled={shown === 0} onclick={() => go(-1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
        </button>
      {/if}
      <span class="cap">{dayLabel(days[shown], today.day)}, by hour</span>
      {#if days.length > 1}
        <button class="nav" aria-label="Later day" disabled={shown >= days.length - 1} onclick={() => go(1)}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </button>
      {/if}
    </div>
  </div>
  <div class="days" bind:this={scroller} onscroll={onScroll}>
    {#each days as day (day)}
      {@const cols = columnsOf(summaryOf(day))}
      {@const unit = unitOf(cols)}
      {@const here = days[shown] === day}
      <div class="day">
        <div class="chart" style="height: {chart}px">
          <div class="tick" style="bottom: {plot / 2}px"><span class="mono">{topOf(cols) / 2}</span></div>
          <div class="tick" style="bottom: {plot}px"><span class="mono">{topOf(cols)}</span></div>
          {#each cols as c, i}
            <button class="col" class:faded={here && pick !== null && pick !== i} class:picked={here && pick === i}
              aria-label="{String(FIRST_HOUR + i).padStart(2, '0')}:00, {c.total} earned" aria-pressed={here && pick === i}
              onclick={() => (pick = pick === i || !c.total ? null : i)}>
              {#if c.total}
                <span class="mono n">{c.total}</span>
                <div class="bar" style="height: {Math.max(c.total * unit, c.segments.length * MIN_SEGMENT)}px">
                  {#each c.segments as seg}<i style="flex: {seg.n} 0 {MIN_SEGMENT}px; background: {seg.color}"></i>{/each}
                </div>
              {/if}
            </button>
          {/each}
        </div>
        <div class="dots">
          {#each cols as c}<div>{#if c.redeemed}<Marker kind="redeemed" size={tall ? 10 : 8} />{/if}</div>{/each}
        </div>
        <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
      </div>
    {/each}
  </div>
  <div class="legend">
    <!-- Outside the scrolling list, so it stays put when the list bounces. -->
    <div class="row head"><span class="mono when">{breakdown.label}</span><span class="mono">{breakdown.total} earned</span></div>
    <div class="list" aria-live="polite">
    {#each breakdown.rows as row (row.name)}
      <div class="row" class:zero={!row.n}><span class="mk"><Marker kind="source" color={row.color} /></span><span class="name">{row.name}</span><b class="mono">{row.n || "–"}</b></div>
    {/each}
    {#if breakdown.anyRedeemed}
      <div class="row" class:zero={!breakdown.redeemed}><span class="mk"><Marker kind="redeemed" /></span><span class="name">Redeemed</span><b class="mono">{breakdown.redeemed || "–"}</b></div>
    {/if}
    {#if !breakdown.rows.length && !breakdown.anyRedeemed}
      <div class="row none">{current && current.earned > 0 ? `${current.earned} earned; the hour-by-hour detail isn't kept this far back` : days[shown] === today.day ? "Nothing earned yet" : "Nothing earned this Day"}</div>
    {/if}
    </div>
    <!-- Stays at the bottom of the box, however long the list is. -->
    {#if breakdown.rows.length}<div class="hintline">{pick === null ? "Tap a bar to see that hour" : "Tap it again for the whole day"}</div>{/if}
  </div>
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 28px; }
  .switcher { display: flex; align-items: center; gap: 2px; margin-left: -8px; }
  .switcher:not(:has(.nav)) { margin-left: 0; }
  .nav { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .nav:disabled { opacity: .3; cursor: default; }
  /* One Day per screen width, snapping, with no scrollbar: the arrows and
     the header say where you are. */
  .days { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; }
  .days::-webkit-scrollbar { display: none; }
  .day { flex: 0 0 100%; scroll-snap-align: start; display: flex; flex-direction: column; gap: 12px; }
  .chart { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; align-items: end; border-bottom: 1px solid #3a3f45; }
  /* Bars, dots, and hours leave a gutter on the left for the tick numbers. */
  .chart, .dots, .axis { margin-left: 16px; }
  .chart { position: relative; }
  /* Tick lines sit behind the bars (the columns come later and are positioned). */
  .tick { position: absolute; left: -16px; right: 0; border-top: 1px dashed #2c3036; pointer-events: none; }
  .tick span { position: absolute; left: 0; bottom: -5px; font-size: 9px; line-height: 1; color: #6f757b; background: var(--surface); padding-right: 3px; }
  .col {
    position: relative; display: flex; flex-direction: column; justify-content: flex-end; align-items: stretch; gap: 3px;
    height: 100%; min-width: 0; padding: 0; border: 0; background: none; color: inherit; font: inherit; cursor: pointer;
    transition: opacity .2s ease;
  }
  .col.faded { opacity: .3; }
  .col.picked .n { color: var(--ink); font-weight: 700; }
  .col:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; border-radius: 4px; }
  .n { font-size: 10px; line-height: 11px; text-align: center; color: var(--muted); }
  .bar { display: flex; flex-direction: column; gap: 1px; border-radius: 4px 4px 2px 2px; overflow: hidden; }
  .bar i { min-height: 0; }
  .dots { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; align-items: center; }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  /* The picked hour's (or the whole Day's) count per source; it doubles as
     the colour key, since it names every colour on screen. */
  .legend { display: flex; flex-direction: column; padding: 4px 12px; border-radius: 12px; background: #1f2226; font-size: 13px; color: #c9cdd1; }
  .list { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; min-height: 30px; border-top: 1px solid var(--divider); }
  .row.head { grid-template-columns: minmax(0, 1fr) auto; border-top: 0; font-size: 11px; color: var(--muted); }
  .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row b { font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; }
  .row.zero { color: var(--muted); } .row.zero b { color: var(--muted); }
  .when { color: var(--muted); }
  .none { display: block; color: var(--muted); }
  .hintline { font-size: 11px; color: #6f757b; padding: 6px 0 4px; border-top: 1px solid var(--divider); }
  .mk { display: flex; align-items: center; }
  .row.zero .mk { opacity: .35; }
  .tall { gap: 14px; padding: 18px; border-radius: 18px; }
  /* On the tablet the card fills the column above the history grid, so the
     grid stays put level with the next column; the list scrolls inside
     whatever room is left, with its heading row pinned. */
  .tall { flex: 1; min-height: 0; }
  .tall .head, .tall .days { flex: none; }
  .tall .legend { flex: 1; min-height: 96px; }
  .tall .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; }
  .tall .hintline { flex: none; }
  .tall .row.head { flex: none; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .day { gap: 14px; }
  .tall .dots { height: 18px; }
  .tall .n { font-size: 11px; }
</style>
