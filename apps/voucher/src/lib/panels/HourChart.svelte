<script lang="ts">
  // Each Day's earnings hour by hour: a bar per hour, split into a segment per
  // source and topped with its count, over faint tick lines, with a dot under
  // each hour that had a Redemption. Tap a bar to pick that hour: the others
  // fade and the line below lists its count per source (otherwise it lists
  // the whole Day's). Today shows first; swipe (or the arrows) back through
  // earlier Days, as far as the Ledger keeps logs. Past Days load as they
  // come near the screen.
  import { onMount, untrack } from "svelte";
  import { ledger } from "../api";
  import { SOURCES, sourceOf } from "../sources";
  import { dayLabel, hourOf, shiftDay } from "../time";
  import type { DaySummary } from "../types";

  let { today, timeZone, tall = false, firstDay }: {
    today: DaySummary; timeZone: string; tall?: boolean;
    /** The oldest Day whose log the Ledger keeps; without it, only today shows. */
    firstDay?: string;
  } = $props();

  const FIRST_HOUR = 6;
  const HOURS = 18; // 06 to 23; anything after midnight joins the last column
  const chart = $derived(tall ? 150 : 84);
  const most = $derived(tall ? 24 : 22);

  /** Every Day from the oldest kept to today, oldest first. */
  const days = $derived.by(() => {
    const out: string[] = [];
    if (firstDay && firstDay < today.day) {
      for (let d = firstDay; d < today.day && out.length < 60; d = shiftDay(d, 1)) out.push(d);
    }
    out.push(today.day);
    return out;
  });

  let past = $state<Record<string, DaySummary>>({});
  let shown = $state(0);
  let scroller = $state<HTMLDivElement>();
  const summaryOf = (day: string) => (day === today.day ? today : past[day]);
  const current = $derived(summaryOf(days[shown]));
  const shortName = (name: string) => Object.values(SOURCES).find((s) => s.name === name)?.short ?? name;

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
  /** Tick lines at round steps, at most four up to the busiest hour. */
  function ticksOf(max: number): number[] {
    const step = [1, 2, 5, 10, 20, 50, 100].find((s) => max / s <= 4) ?? 200;
    const out: number[] = [];
    for (let v = step; v <= max; v += step) out.push(v);
    return out;
  }
  // A Voucher is a full block's height until a busy hour needs a smaller
  // scale to fit; segments never drop below MIN_SEGMENT, and the count on top
  // says exactly how many.
  const LABEL = 14;
  const MIN_SEGMENT = 3;
  function unitOf(cols: ReturnType<typeof columnsOf>) {
    const n = Math.max(1, ...cols.map((c) => c.total));
    return Math.min(most, (chart - LABEL) / n);
  }

  async function load(index: number) {
    const day = days[index];
    if (!day || day === today.day || past[day]) return;
    try { past[day] = await ledger<DaySummary>("GET", `/day?date=${day}`); } catch { /* stays blank */ }
  }

  // The picked hour, on the Day in view; moving to another Day lets it go.
  let pick = $state<number | null>(null);
  const breakdown = $derived(breakdownOf(columnsOf(current), pick));
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
    {#if current}
      <span class="cap earn">{tall ? `${current.earned} earned · ${current.redeemed} redeemed` : `+${current.earned} · −${current.redeemed}`}</span>
    {/if}
  </div>
  <div class="days" bind:this={scroller} onscroll={onScroll}>
    {#each days as day (day)}
      {@const cols = columnsOf(summaryOf(day))}
      {@const unit = unitOf(cols)}
      {@const here = days[shown] === day}
      <div class="day">
        <div class="chart" style="height: {chart}px">
          {#each ticksOf(Math.max(0, ...cols.map((c) => c.total))) as v}
            <div class="tick" style="bottom: {v * unit}px"><span class="mono">{v}</span></div>
          {/each}
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
          {#each cols as c}<div><i class:on={c.redeemed}></i></div>{/each}
        </div>
        <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
      </div>
    {/each}
  </div>
  <div class="legend" aria-live="polite">
    <span class="mono when">{breakdown.label}</span>
    {#each breakdown.parts as part (part.name)}<span><i style="background: {part.color}"></i>{tall ? part.name : shortName(part.name)} <b class="mono">{part.n}</b></span>{/each}
    {#if breakdown.redeemed}<span><i class="round"></i>Redeemed <b class="mono">{breakdown.redeemed}</b></span>{/if}
    {#if !breakdown.parts.length && !breakdown.redeemed}<span class="none">{pick === null ? "Nothing earned yet" : "Nothing this hour"}</span>{/if}
  </div>
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 8px; min-height: 28px; }
  .switcher { display: flex; align-items: center; gap: 2px; margin-left: -8px; }
  .switcher:not(:has(.nav)) { margin-left: 0; }
  .nav { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .nav:disabled { opacity: .3; cursor: default; }
  .earn { color: var(--voucher); }
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
  .dots div { display: flex; justify-content: center; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; }
  .dots i.on { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  /* The picked hour's (or the whole Day's) count per source; it doubles as
     the colour key, since it names every colour on screen. */
  .legend { display: flex; column-gap: 12px; row-gap: 6px; flex-wrap: wrap; align-items: center; min-height: 32px; padding: 7px 10px; border-radius: 10px; background: #1f2226; font-size: 12px; color: #c9cdd1; }
  .legend b { font-weight: 500; color: var(--ink); }
  .when { color: var(--muted); font-size: 11px; }
  .none { color: var(--muted); }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; }
  .legend i.round { border-radius: 50%; background: var(--ink); }
  .tall { gap: 14px; padding: 18px; border-radius: 18px; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .day { gap: 14px; }
  .tall .dots { height: 18px; }
  .tall .dots i { width: 10px; height: 10px; }
  .tall .n { font-size: 11px; }
</style>
