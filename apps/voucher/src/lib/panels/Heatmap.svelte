<script lang="ts">
  // Days as a grid, a column per week from Monday, twelve weeks in view.
  // Brightest means the goal was met. Swipe back through earlier weeks as far
  // as the Ledger's first Day; Days before it and Days to come stay blank.
  // Zoomed out to Year, the last 53 weeks fit the width at once (no swiping),
  // with the year's totals below so the card keeps its height.
  import type { DayTotal } from "../types";
  import { untrack } from "svelte";
  import TodayButton from "../components/TodayButton.svelte";
  import ZoomSwitch from "../components/ZoomSwitch.svelte";
  import { shiftDay } from "../time";

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
  // ---- Year ----
  let zoom = $state<"weeks" | "year">("weeks");
  /** The card's height at 12 weeks, which the Year view keeps. */
  let weeksHeight = $state(0);
  let cardHeight = $state(0);
  $effect(() => { if (zoom === "weeks" && cardHeight) weeksHeight = cardHeight; });
  const levelOf = (d: DayTotal) => (d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3)));
  const byDay = $derived(new Map(history.map((d) => [d.day, d])));
  /** The last 12 months, oldest first, one row each with a cell per Day of
   *  the month (the "year in pixels" layout). Days before the Ledger's first or
   *  still to come are blank. */
  const year = $derived.by(() => {
    const last = history.at(-1)?.day;
    if (!last) return [] as { name: string; empty: boolean; days: { day: string; level: number; blank: boolean }[] }[];
    const [y, m] = last.split("-").map(Number);
    return Array.from({ length: 12 }, (_, k) => {
      const first = new Date(Date.UTC(y, m - 12 + k, 1, 12));
      const n = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0, 12)).getUTCDate();
      const days = Array.from({ length: n }, (_, i) => {
        const day = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), i + 1, 12)).toISOString().slice(0, 10), t = byDay.get(day);
        return { day, level: t ? levelOf(t) : 0, blank: !t || (!!firstDay && day < firstDay) || day > last };
      });
      const label = MONTHS[first.getUTCMonth()] + (first.getUTCMonth() === 0 ? ` ${String(first.getUTCFullYear()).slice(2)}` : "");
      return { name: label, empty: days.every((d) => d.blank), days };
    });
  });
  /** The year's numbers, under the grid. */
  const stats = $derived.by(() => {
    const kept = year.flatMap((m) => m.days).filter((d) => !d.blank).map((d) => byDay.get(d.day)!);
    let run = 0, best = 0;
    for (const d of kept) { run = d.goal_met ? run + 1 : 0; best = Math.max(best, run); }
    const months = new Map<string, number>();
    for (const d of kept) months.set(d.day.slice(0, 7), (months.get(d.day.slice(0, 7)) ?? 0) + d.earned);
    const top = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
    return {
      earned: kept.reduce((n, d) => n + d.earned, 0),
      goalDays: kept.filter((d) => d.goal_met).length,
      days: kept.length,
      best,
      topMonth: top ? MONTHS[Number(top[0].slice(5, 7)) - 1] : "–",
    };
  });

  // "Today": back to the latest weeks, with today picked.
  const lastDay = $derived(history.at(-1)?.day);
  function backToToday() {
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
    if (lastDay) onpick?.(lastDay);
  }
</script>

<section class="card" class:wide={!keyBelow} bind:offsetHeight={cardHeight} style={zoom === "year" && weeksHeight ? `box-sizing: border-box; height: ${weeksHeight}px` : ""}>
  <div class="head">
    <span class="cap">Vouchers earned</span>
    <ZoomSwitch options={[{ id: "weeks", label: "12 weeks" }, { id: "year", label: "Year" }]} value={zoom} onchange={(z) => (zoom = z as "weeks" | "year")} />
  </div>
  {#if zoom === "year"}
    <!-- A row per month, a column per Day of the month: no weekday labels to
         repeat, and the cells as large as 31 columns allow. -->
    <div class="ywrap"><div class="ygrid">
      <span></span>
      {#each Array.from({ length: 31 }, (_, i) => i) as i}<span class="yday">{[0, 7, 14, 21, 28].includes(i) ? i + 1 : ""}</span>{/each}
      {#each year as month (month.name)}
        <span class="yname" class:empty={month.empty}>{month.name}</span>
        {#each month.days as c (c.day)}
          {#if c.blank}<div class="y blank"></div>
          {:else}<button class="y h{c.level}" class:sel={c.day === selected} title={c.day} aria-label="Show {c.day} by hour" onclick={() => onpick?.(c.day)}></button>{/if}
        {/each}
        {#each Array.from({ length: 31 - month.days.length }) as _}<div></div>{/each}
      {/each}
    </div></div>
    <!-- The year's numbers in one line, so the card keeps its 12-week height. -->
    <div class="yline"><b>{stats.earned.toLocaleString("en-US")}</b> earned · <b>{stats.goalDays}</b> goal days · longest streak <b>{stats.best}</b> · best <b>{stats.topMonth}</b></div>
  {:else}
  <div class="grid">
  <!-- Floats over the grid's right edge, where today is, so it never changes
       the card's height. -->
  <div class="todayslot"><TodayButton show={!atEnd || (!!selected && !!lastDay && selected !== lastDay)} onclick={backToToday} /></div>
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
  {/if}
  {#if keyBelow && zoom === "weeks"}
    <div class="heatkey">
      <span class="scale">Fewer<i class="h"></i><i class="h h1"></i><i class="h h2"></i><i class="h h3"></i><i class="h h4"></i>More</span>
      <span class="earn">Brightest: {goal}+, goal met</span>
    </div>
  {/if}
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .earn { color: var(--voucher); }
  /* A fixed weekday column beside a scroller of week-columns: twelve fill the
     visible width, and earlier weeks sit off to the left. Cells are sized
     against the whole grid (a size container): 100cqw less the labels (26),
     the gap after them (4), the outline room (3 + 3), and 11 gaps (44). */
  .todayslot { position: absolute; right: 6px; top: 50%; transform: translateY(-50%); z-index: 3; filter: drop-shadow(0 4px 10px rgba(0, 0, 0, .55)); }
  .grid { position: relative; --labels: 26px; --cell: calc((100cqw - 80px) / 12); container-type: inline-size; display: flex; gap: 4px; }
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
  /* Year: a row per month and a column per Day, no scrolling. Square cells
     sized from the grid's width (a size container): 100cqw less the month
     names (28) and 31 gaps (62), over 31 columns. */
  /* The wrapper is the size container: a grid can't size its own columns from itself. */
  .ywrap { container-type: inline-size; flex: 1; min-height: 0; display: flex; flex-direction: column; }
  /* Rows share the card's height (it keeps its 12-week height), so each Day is
     as wide as 31 columns allow and up to twice as tall. */
  .ygrid { --y: calc((100cqw - 92px) / 31); flex: 1; min-height: 0; display: grid; grid-template-columns: 28px repeat(31, var(--y)); grid-template-rows: 12px repeat(12, minmax(0, 1fr)); gap: 2px; align-items: stretch; align-content: start; padding: 2px 0; }
  .yname { align-self: center; }
  .yday, .yname { font: 500 9px/1 var(--mono); color: var(--muted); white-space: nowrap; }
  .yday { height: 10px; overflow: visible; }
  .yname.empty { opacity: .4; }
  .y { width: var(--y); height: 100%; max-height: calc(var(--y) * 2); align-self: center; border-radius: 3px; background: #22262a; padding: 0; border: 0; display: block; cursor: pointer; }
  .y.h1 { background: #1d4d33; } .y.h2 { background: #24804f; } .y.h3 { background: #2fb36b; } .y.h4 { background: #3ddc84; }
  .y.blank { background: transparent; cursor: default; }
  .y.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
  .y:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .yline { font-size: 12px; color: var(--muted); line-height: 1.4; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .yline b { color: var(--ink); font: 700 12px var(--mono); }
</style>
