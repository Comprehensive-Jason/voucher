<script lang="ts">
  // Days as a grid, a column per week from Monday, twelve weeks in view.
  // Greens grow with what was earned; a Day that met the goal turns gold
  // (the goal's colour everywhere), so a run of met goals stands out. Swipe back through earlier weeks as far
  // as the Ledger's first Day; Days before it and Days to come stay blank.
  // Zoomed out to Year, the last 53 weeks fit the width at once (no swiping),
  // with the year's totals below; the card keeps its 12-week height.
  import type { DayTotal } from "../types";
  import { untrack } from "svelte";
  import TodayButton from "../components/TodayButton.svelte";
  import ZoomSwitch from "../components/ZoomSwitch.svelte";
  import { shiftDay } from "../time";
  import { fade } from "svelte/transition";
  import { easeOut, ms } from "../motion";

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
  // The last 53 weeks, left to right like the 12 weeks, all in view at once.
  // Zooming out shrinks the 12 weeks into the right-hand end of the year;
  // zooming in grows them back.
  let zoom = $state<"weeks" | "year">("weeks");
  function setZoom(z: "weeks" | "year") {
    if (z === zoom) return;
    atEnd = true; // the 12 weeks reopen on the latest weeks
    zoom = z;
  }
  /** The card's height at 12 weeks, which the Year view keeps. */
  let weeksHeight = $state(0);
  let cardHeight = $state(0);
  $effect(() => { if (zoom === "weeks" && cardHeight) weeksHeight = cardHeight; });
  const levelOf = (d: DayTotal) => (d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3)));
  const byDay = $derived(new Map(history.map((d) => [d.day, d])));
  const YEAR_WEEKS = 53;
  /** A column per week from Monday, oldest first, ending with this week. Days
   *  before the Ledger's first or still to come are blank. A week's month
   *  label shows where a month begins. */
  const year = $derived.by(() => {
    const last = history.at(-1)?.day;
    if (!last) return [] as { month: string; days: { day: string; level: number; blank: boolean }[] }[];
    const monday = shiftDay(last, -((new Date(`${last}T12:00:00Z`).getUTCDay() + 6) % 7));
    const start = shiftDay(monday, -(YEAR_WEEKS - 1) * 7);
    return Array.from({ length: YEAR_WEEKS }, (_, w) => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = shiftDay(start, w * 7 + i), t = byDay.get(day);
        return { day, level: t ? levelOf(t) : 0, blank: !t || (!!firstDay && day < firstDay) || day > last };
      });
      const first = days.find((d) => d.day.slice(8) === "01");
      return { month: first ? MONTHS[Number(first.day.slice(5, 7)) - 1] : "", days };
    });
  });
  // The 12 weeks' cells are sized from the card's width (see the styles); the
  // year's are as wide as 53 columns allow and stretch to fill the card's
  // height. The zoom scales each direction by its own ratio, so the 12 weeks
  // line up with the year's last 12 columns.
  let width = $state(0);
  const weeksPitch = $derived((width - 80) / 12 + 4);
  /** Shrinks to (or grows from) the 12 weeks' size at the right edge, where this week is. */
  function yearZoom(node: Element) {
    const cell = node.querySelector(".h")?.getBoundingClientRect();
    const fx = cell?.width ? weeksPitch / (cell.width + 2) : 1;
    const fy = cell?.height ? weeksPitch / (cell.height + 2) : 1;
    return { duration: ms("move"), easing: easeOut,
      tick: (t: number) => (node as HTMLElement).style.setProperty("--zoom-t", String(t)),
      css: (t: number) => `transform: scale(${fx + (1 - fx) * t}, ${fy + (1 - fy) * t}); opacity: ${Math.min(1, t * 2)}` };
  }
  /** The year's numbers, under the grid. */
  const stats = $derived.by(() => {
    const kept = year.flatMap((w) => w.days).filter((d) => !d.blank).map((d) => byDay.get(d.day)!);
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
  const awayFromToday = $derived((zoom === "weeks" && !atEnd) || (!!selected && !!lastDay && selected !== lastDay));
  function backToToday() {
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
    if (lastDay) onpick?.(lastDay);
  }
</script>

<section class="card" class:wide={!keyBelow} bind:offsetHeight={cardHeight} style={zoom === "year" && weeksHeight ? `box-sizing: border-box; height: ${weeksHeight}px` : ""}>
  <div class="cardhead">
    <span class="cap">Vouchers earned</span>
    <div class="tools">
      <TodayButton show={awayFromToday} onclick={backToToday} />
      <ZoomSwitch options={[{ id: "weeks", label: "12 weeks" }, { id: "year", label: "Year" }]} value={zoom} onchange={(z) => setZoom(z as "weeks" | "year")} />
    </div>
  </div>
  <!-- The two views overlap while one zooms into the other. -->
  <div class="stack" bind:clientWidth={width}>
  {#if zoom === "year"}
    <div class="grid year" transition:fade={{ duration: ms("move") }}>
      <div class="labels" aria-hidden="true">
        <span class="corner"></span>
        {#each WEEKDAYS as w}<span class="weekday">{w}</span>{/each}
      </div>
      <div class="yclip">
        <div class="heat yheat" transition:yearZoom>
          {#each year as week (week.days[0].day)}
            <span class="month">{week.month}</span>
            {#each week.days as c (c.day)}
              {#if c.blank}<div class="h blank"></div>
              {:else}<button class="h h{c.level}" class:sel={c.day === selected} title={c.day} aria-label="Show {c.day} by hour" onclick={() => onpick?.(c.day)}></button>{/if}
            {/each}
          {/each}
        </div>
      </div>
    </div>
  {:else}
  <div class="grid" transition:fade={{ duration: ms("move") }}>
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
  </div>
  {#if zoom === "year"}
    <!-- The year's numbers, at the foot of the card's 12-week height. -->
    <div class="ystats" transition:fade={{ duration: ms("move") }}>
      <div><b>{stats.earned.toLocaleString("en-US")}</b><span>earned</span></div>
      <div class="gold"><b>{stats.goalDays}</b><span>goal days</span></div>
      <div class="gold"><b>{stats.best}</b><span>longest streak</span></div>
      <div><b>{stats.topMonth}</b><span>best month</span></div>
    </div>
  {/if}
  {#if keyBelow}
    <div class="heatkey">
      <span class="scale">Fewer<i class="h"></i><i class="h h1"></i><i class="h h2"></i><i class="h h3"></i>More</span>
      <span class="scale goalkey"><i class="h h4"></i>Goal met, {goal}+</span>
    </div>
  {/if}
</section>

<style>
  /* A named container, so the Today button can shrink to its arrow on a narrow card. */
  .card { container: card / inline-size; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .goalkey { color: var(--goal); }
  /* Takes the card's height in Year, which keeps the 12 weeks' height. */
  .stack { display: grid; flex: 1 1 auto; min-height: 0; overflow: clip; overflow-clip-margin: 16px; }
  .stack > * { grid-area: 1 / 1; }
  /* A fixed weekday column beside a scroller of week-columns: twelve fill the
     visible width, and earlier weeks sit off to the left. Cells are sized
     against the whole grid (a size container): 100cqw less the labels (26),
     the gap after them (4), the outline room (3 + 3), and 11 gaps (44). */
  .grid { position: relative; --labels: 26px; --cell: calc((100cqw - 80px) / 12); container-type: inline-size; display: flex; gap: 4px; align-self: start; }
  .labels { flex: none; width: var(--labels); display: grid; grid-template-rows: 14px repeat(7, var(--cell)); gap: 4px; padding-top: 3px; }
  .scroller { flex: 1; min-width: 0; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-left: 3px; overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .heat {
    display: grid; grid-template-rows: 14px repeat(7, var(--cell)); grid-auto-flow: column; gap: 4px;
    grid-auto-columns: var(--cell); width: max-content;
    /* Room for the picked Day's outline, which the scroller would clip. */
    padding: 3px;
  }
  /* Year: the same layout with 53 columns and 2px gaps, sized the same way:
     100cqw less the labels, the gap, the outline room, and 52 gaps (104),
     over 53 columns. The cells start as low as the 12 weeks' (21px down),
     so zooming lines them up. */
  .year { --cell: calc((100cqw - 140px) / 53); align-self: stretch; min-height: 0; }
  /* Rows share the height, so a Day is as tall as the room allows. */
  .year .labels { gap: 2px; grid-template-rows: 14px repeat(7, minmax(0, 1fr)); padding: 5px 0 3px; }
  .year .weekday { font-size: 9px; overflow: visible; }
  /* Clipped on the left only, where the zoom spills over the weekday labels;
     the last month's name can run into the card's padding on the right. */
  .yclip { flex: 1; min-width: 0; clip-path: inset(-100vh -16px -100vh 0); }
  .yheat { gap: 2px; padding: 5px 3px 3px; height: 100%; box-sizing: border-box; grid-template-rows: 14px repeat(7, minmax(0, 1fr)); transform-origin: calc(100% - 3px) 21px; }
  .yheat .h { border-radius: 2px; aspect-ratio: auto; height: 100%; }
  /* Month names fade out early while zooming (--zoom-t runs 0 to 1), so they never show blown up. */
  .yheat .month { font-size: 9px; opacity: clamp(0, (var(--zoom-t, 1) - .75) * 4, 1); }
  .yheat .h.sel { outline-width: 1.5px; }
  .weekday, .month { font: 500 10px/1 var(--mono); color: var(--muted); display: flex; align-items: center; white-space: nowrap; }
  .month { scroll-snap-align: start; align-items: flex-end; overflow: visible; }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; padding: 0; border: 0; display: block; width: 100%; }
  button.h { cursor: pointer; }
  /* The Day the hour chart is showing. */
  .h.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
  button.h:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: var(--goal); }
  .h.blank { background: transparent; }
  .heatkey { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); margin-top: auto; }
  .scale { display: flex; align-items: center; gap: 4px; }
  .scale i { width: 12px; display: inline-block; }
  .wide { padding: 18px; border-radius: 18px; flex: none; }
  .ystats { margin-top: auto; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 8px; }
  .ystats div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: #1f2226; min-width: 0; }
  .ystats b { font: 700 18px/1.1 var(--mono); color: var(--ink); }
  .ystats .gold b { color: var(--goal); }
  .ystats span { font-size: 11px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The key follows the numbers in Year. */
  .ystats + .heatkey { margin-top: 0; }
</style>
