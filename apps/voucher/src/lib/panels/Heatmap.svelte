<script lang="ts">
  // Days as a grid, a column per week from Monday, twelve weeks in view.
  // Brightest means the goal was met. Swipe back through earlier weeks as far
  // as the Ledger's first Day; Days before it and Days to come stay blank.
  import type { DayTotal } from "../types";
  import { untrack } from "svelte";
  import TodayButton from "../components/TodayButton.svelte";

  let { history, goal, keyBelow = true, firstDay, selected, onpick }: {
    history: DayTotal[]; goal: number; keyBelow?: boolean;
    /** The Ledger's first Day; Days before it are blank, not "nothing earned". */
    firstDay?: string;
    /** The Day the hour chart shows, outlined here. */
    selected?: string;
    /** Tapping a Day asks the hour chart to show it. */
    onpick?: (day: string) => void;
  } = $props();

  const cells = $derived.by(() => {
    const out: { level: number; blank: boolean; day?: string }[] = [];
    for (const d of history) {
      const level = d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3));
      out.push({ level, blank: !!firstDay && d.day < firstDay, day: d.day });
    }
    while (out.length % 7) out.push({ level: 0, blank: true });
    return out;
  });

  // A column per week; a week's month label shows where a month begins (and
  // on the oldest week), so the grid reads like a calendar.
  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const weeks = $derived.by(() => {
    const out: { month: string; days: typeof cells }[] = [];
    for (let i = 0; i < cells.length; i += 7) {
      const days = cells.slice(i, i + 7);
      // Only weeks with history get a label: blank weeks before the first Day
      // stay unlabelled. The first labelled week names its month.
      const shown = days.filter((d) => d.day && !d.blank);
      const first = shown.find((d) => d.day!.slice(8) === "01");
      const start = shown.length && !out.some((w) => w.month) ? shown[0] : null;
      const at = first ?? start;
      const month = at?.day ? MONTHS[Number(at.day.slice(5, 7)) - 1] + (at.day.slice(5, 7) === "01" ? ` ${at.day.slice(0, 4)}` : "") : "";
      out.push({ month, days });
    }
    return out;
  });
  const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];

  // Open on the latest weeks, and stay there as weeks are added, unless scrolled back.
  let scroller = $state<HTMLDivElement>();
  let atEnd = $state(true);
  $effect(() => {
    cells.length;
    if (scroller && untrack(() => atEnd)) scroller.scrollLeft = scroller.scrollWidth;
  });
  function onScroll() {
    if (scroller) atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
  }
  // "Today": back to the latest weeks, with today picked.
  const lastDay = $derived(history.at(-1)?.day);
  function backToToday() {
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
    if (lastDay) onpick?.(lastDay);
  }
</script>

<section class="card" class:wide={!keyBelow}>
  <div class="head">
    <span class="cap">Vouchers earned, 12 weeks</span>
    {#if !keyBelow}<span class="cap earn">Brightest: {goal}+ (goal met)</span>{/if}
    <TodayButton show={!atEnd || (!!selected && !!lastDay && selected !== lastDay)} onclick={backToToday} />
  </div>
  <div class="grid">
  <!-- Outside the scroller, so the weekday labels never move or bounce. -->
  <div class="labels" aria-hidden="true">
    <span class="corner"></span>
    {#each WEEKDAYS as w}<span class="weekday">{w}</span>{/each}
  </div>
  <div class="scroller" bind:this={scroller} onscroll={onScroll}>
    <div class="heat">
      {#each weeks as week}
        <span class="month">{week.month}</span>
        {#each week.days as c}
          {#if c.day && !c.blank}
            <button class="h h{c.level}" class:sel={c.day === selected} title={c.day} aria-label="Show {c.day} by hour" onclick={() => onpick?.(c.day!)}></button>
          {:else}
            <div class="h blank"></div>
          {/if}
        {/each}
      {/each}
    </div>
  </div>
  </div>
  {#if keyBelow}
    <div class="heatkey">
      <span class="scale">Fewer<i class="h"></i><i class="h h1"></i><i class="h h2"></i><i class="h h3"></i><i class="h h4"></i>More</span>
      <span>Brightest: {goal}+, goal met</span>
    </div>
  {/if}
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; min-height: 28px; }
  .earn { color: var(--voucher); }
  /* A fixed weekday column beside a scroller of week-columns: twelve fill the
     visible width, and earlier weeks sit off to the left. Cells are sized
     against the whole grid (a size container): 100cqw less the labels (26),
     the gap after them (4), the outline room (3 + 3), and 11 gaps (44). */
  .grid { --labels: 26px; --cell: calc((100cqw - 80px) / 12); container-type: inline-size; display: flex; gap: 4px; }
  .labels { flex: none; width: var(--labels); display: grid; grid-template-rows: 14px repeat(7, var(--cell)); gap: 4px; padding-top: 3px; }
  .scroller { flex: 1; min-width: 0; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-left: 3px; overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .heat {
    display: grid; grid-template-rows: 14px repeat(7, var(--cell)); grid-auto-flow: column; gap: 4px;
    grid-auto-columns: var(--cell); width: max-content;
    /* Room for the picked Day's outline, which the scroller would clip. */
    padding: 3px;
  }
  .weekday, .month { font: 500 10px/1 var(--mono); color: var(--muted); display: flex; align-items: center; white-space: nowrap; }
  .month { scroll-snap-align: start; align-items: flex-end; overflow: visible; }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; padding: 0; border: 0; display: block; width: 100%; }
  button.h { cursor: pointer; }
  /* The Day the hour chart is showing. */
  .h.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
  button.h:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: #3ddc84; }
  .h.blank { background: transparent; }
  .heatkey { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
  .scale { display: flex; align-items: center; gap: 4px; }
  .scale i { width: 12px; display: inline-block; }
  .wide { padding: 18px; border-radius: 18px; flex: none; }
</style>
