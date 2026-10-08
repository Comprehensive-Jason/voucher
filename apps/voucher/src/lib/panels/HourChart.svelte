<script lang="ts">
  // Each Day's earnings hour by hour, one block per Voucher coloured by source,
  // with a dot under each hour that had a Redemption. Today shows first;
  // swipe (or the arrows) back through earlier Days, as far as the Ledger
  // keeps their logs. Past Days load as they come near the screen.
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

  function columnsOf(summary: DaySummary | undefined) {
    const cols = Array.from({ length: HOURS }, () => ({ blocks: [] as string[], redeemed: false }));
    for (const e of [...(summary?.log ?? [])].reverse()) {
      const h = hourOf(e.at, timeZone);
      const col = h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
      if (e.kind === "earned") cols[col].blocks.push(sourceOf(e.task).color);
      else if (e.kind === "redeemed") cols[col].redeemed = true;
    }
    return cols;
  }
  // Blocks keep their full height until a busy hour needs them smaller to fit.
  function blockOf(cols: ReturnType<typeof columnsOf>) {
    const n = Math.max(1, ...cols.map((c) => c.blocks.length));
    return Math.min(most, (chart - (n - 1) * 2) / n);
  }

  async function load(index: number) {
    const day = days[index];
    if (!day || day === today.day || past[day]) return;
    try { past[day] = await ledger<DaySummary>("GET", `/day?date=${day}`); } catch { /* stays blank */ }
  }

  function onScroll() {
    if (!scroller) return;
    shown = Math.round(scroller.scrollLeft / scroller.clientWidth);
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
      {@const block = blockOf(cols)}
      <div class="day">
        <div class="chart" style="height: {chart}px">
          {#each cols as c}
            <div class="col">
              {#each c.blocks as color}<div class="block" style="height: {block}px; background: {color}"></div>{/each}
            </div>
          {/each}
        </div>
        <div class="dots">
          {#each cols as c}<div><i class:on={c.redeemed}></i></div>{/each}
        </div>
        <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
      </div>
    {/each}
  </div>
  <div class="legend">
    {#each Object.values(SOURCES) as s}<span><i style="background: {s.color}"></i>{tall ? s.name : s.short}</span>{/each}
    <span><i class="round"></i>Redeemed (dot)</span>
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
  .col { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; height: 100%; }
  .block { border-radius: 3px; }
  .dots { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; }
  .dots i.on { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  .legend { display: flex; column-gap: 12px; row-gap: 6px; flex-wrap: wrap; font-size: 12px; color: #c9cdd1; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; }
  .legend i.round { border-radius: 50%; background: var(--ink); }
  .tall { gap: 14px; padding: 18px; border-radius: 18px; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .day { gap: 14px; }
  .tall .dots { height: 18px; }
  .tall .dots i { width: 10px; height: 10px; }
  .tall .block { border-radius: 4px; }
</style>
