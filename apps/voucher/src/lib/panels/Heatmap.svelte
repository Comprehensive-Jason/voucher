<script lang="ts">
  // Days as a grid, a column per week from Monday, as many weeks as fit.
  // Greens grow with what was earned; a Day that met the goal turns gold (the
  // goal's colour everywhere), so a run of met goals stands out. Swipe back
  // through earlier weeks as far as the Ledger's first Day; Days before it and
  // Days to come stay blank. Zoomed out to Year, the last 53 weeks squeeze
  // into the same width; the rows never change height, so zooming only
  // squishes the grid sideways. Under either, four numbers for what's in view.
  import type { DayTotal } from "../types";
  import { untrack } from "svelte";
  import TodayButton from "../components/TodayButton.svelte";
  import Legend from "../components/Legend.svelte";
  import ZoomSwitch from "../components/ZoomSwitch.svelte";
  import { shiftDay } from "../time";
  import { easeOut, ms } from "../motion";
  import { fitsSlot } from "../fit.svelte";
  import { dayOfMoment, notes } from "../notes.svelte";
  /** In a tablet slot, the squares also fit the slot's height. */
  const inSlot = fitsSlot();
  let graphHeight = $state(0);

  let { history, goal, keyBelow = true, firstDay, selected, onpick }: {
    history: DayTotal[]; goal: number; keyBelow?: boolean;
    /** The Ledger's first Day; Days before it are blank, not "nothing earned". */
    firstDay?: string;
    /** The Day the hour chart shows, outlined here. */
    selected?: string;
    /** Tapping a Day asks the hour chart to show it. */
    onpick?: (day: string) => void;
  } = $props();

  const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const WEEKDAYS = ["Mon", "", "Wed", "", "Fri", "", ""];
  const levelOf = (d: DayTotal) => (d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3)));
  const byDay = $derived(new Map(history.map((d) => [d.day, d])));
  const lastDay = $derived(history.at(-1)?.day);
  type Cell = { day: string; level: number; blank: boolean };
  type Week = { month: string; days: Cell[] };

  // ---- Sizes ----
  // The rows are sized so the card stays as tall as it was with twelve
  // square weeks and no numbers: the numbers take their height out of the
  // grid, so the cells are a little smaller and more weeks fit across. Both
  // views share the rows; only the columns differ.
  let width = $state(0); // the grid's width, right of the weekday labels
  let tilesHeight = $state(64);
  const GAP = 4, YGAP = 2, PAD = 3, YEAR_WEEKS = 53;
  // In a slot, no taller than its height allows: the month row (14), the
  // outline room (6), and 7 gaps (28), with 7 rows of squares.
  const fromWidth = $derived(width ? Math.max(14, Math.floor((width - 50) / 12 - (12 + tilesHeight) / 7)) : 20);
  const cell = $derived(inSlot && graphHeight ? Math.max(8, Math.min(fromWidth, Math.floor((graphHeight - 48) / 7))) : fromWidth);
  const pitch = $derived(cell + GAP);
  /** Weeks that fit across at once. */
  const fit = $derived(Math.max(1, Math.floor((width - 2 * PAD + GAP) / pitch)));
  const yearCell = $derived(Math.max(1, (width - 2 * PAD - (YEAR_WEEKS - 1) * YGAP) / YEAR_WEEKS));

  /** Weeks from Monday, oldest first, ending with this week; `count` weeks at least. */
  function weeksBack(count: number): Week[] {
    const last = lastDay;
    if (!last) return [];
    const monday = shiftDay(last, -((new Date(`${last}T12:00:00Z`).getUTCDay() + 6) % 7));
    const oldest = history[0]?.day ?? last;
    const have = Math.floor((Date.parse(`${monday}T12:00:00Z`) - Date.parse(`${oldest}T12:00:00Z`)) / (7 * 86_400_000)) + 1;
    const n = Math.max(count, have);
    const start = shiftDay(monday, -(n - 1) * 7);
    return Array.from({ length: n }, (_, w) => {
      const days = Array.from({ length: 7 }, (_, i) => {
        const day = shiftDay(start, w * 7 + i), t = byDay.get(day);
        return { day, level: t ? levelOf(t) : 0, blank: !t || (!!firstDay && day < firstDay) || day > last };
      });
      // A month's name heads the week its first Day falls in.
      const first = days.find((d) => d.day.slice(8) === "01");
      return { month: first ? MONTHS[Number(first.day.slice(5, 7)) - 1] : "", days };
    });
  }
  const weeks = $derived(weeksBack(fit));
  const year = $derived(weeksBack(YEAR_WEEKS).slice(-YEAR_WEEKS));

  // Open on the latest weeks, and stay there as weeks are added, unless scrolled back.
  let scroller = $state<HTMLDivElement>();
  let atEnd = $state(true);
  let scrollLeft = $state(0);
  $effect(() => {
    weeks.length;
    if (scroller && untrack(() => atEnd)) { scroller.scrollLeft = scroller.scrollWidth; scrollLeft = scroller.scrollLeft; }
  });
  function onScroll() {
    if (!scroller) return;
    scrollLeft = scroller.scrollLeft;
    atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
  }

  // ---- Zoom ----
  let zoom = $state<"weeks" | "year">("weeks");
  function setZoom(z: "weeks" | "year") {
    if (z === zoom) return;
    atEnd = true; // the weeks reopen on the latest weeks
    zoom = z;
  }
  /** Squeezes sideways toward the right edge, where this week is: the weeks
   *  to the year's column width, or the year out from it. The rows never move. */
  function squish(node: Element, { year: isYear }: { year: boolean }) {
    const ratio = pitch / (yearCell + YGAP); // how much wider a week is than a year's column
    const from = isYear ? ratio : 1 / ratio;
    return { duration: ms("move"), easing: easeOut,
      tick: (t: number) => (node as HTMLElement).style.setProperty("--zoom-t", String(t)),
      css: (t: number) => `transform: scaleX(${from + (1 - from) * t}); opacity: ${t}` };
  }

  // ---- Numbers ----
  /** The weeks on screen: all of the year, or the weeks scrolled into view. */
  const inView = $derived.by(() => {
    if (zoom === "year") return year;
    const first = Math.max(0, Math.min(weeks.length - fit, Math.round(scrollLeft / pitch)));
    return weeks.slice(first, first + fit);
  });
  const stats = $derived.by(() => {
    const kept = inView.flatMap((w) => w.days).filter((d) => !d.blank).map((d) => byDay.get(d.day)!);
    let run = 0, best = 0;
    for (const d of kept) { run = d.goal_met ? run + 1 : 0; best = Math.max(best, run); }
    const months = new Map<string, number>();
    for (const d of kept) months.set(d.day.slice(0, 7), (months.get(d.day.slice(0, 7)) ?? 0) + d.earned);
    const top = [...months.entries()].sort((a, b) => b[1] - a[1])[0];
    const earned = kept.reduce((n, d) => n + d.earned, 0);
    return {
      earned,
      goalDays: kept.filter((d) => d.goal_met).length,
      best,
      average: kept.length ? (earned / kept.length).toFixed(1) : "–",
      topMonth: top ? MONTHS[Number(top[0].slice(5, 7)) - 1] : "–",
    };
  });

  // "Today": back to the latest weeks, with today picked.
  const awayFromToday = $derived((zoom === "weeks" && !atEnd) || (!!selected && !!lastDay && selected !== lastDay));
  function backToToday() {
    scroller?.scrollTo({ left: scroller.scrollWidth, behavior: "smooth" });
    if (lastDay) onpick?.(lastDay);
  }
  // Days with a Marker get a small corner tick, and the Marker's text in the tooltip.
  $effect(() => { notes.load(); });
  const marked = $derived.by(() => {
    const out = new Map<string, string[]>();
    for (const m of notes.markers) { const d = dayOfMoment(m.at); out.set(d, [...(out.get(d) ?? []), m.text]); }
    return out;
  });
</script>

<section class="card tile" class:wide={!keyBelow} style="--cell: {cell}px; --ycell: {yearCell}px">
  <div class="cardhead">
    <span class="cap">Activity</span>
    <div class="tools">
      <TodayButton show={awayFromToday} onclick={backToToday} />
      <ZoomSwitch options={[{ id: "weeks", label: "12 weeks" }, { id: "year", label: "Year" }]} value={zoom} onchange={(z) => setZoom(z as "weeks" | "year")} />
    </div>
  </div>
  <!-- What's in view, in numbers. -->
  <div class="stats" bind:offsetHeight={tilesHeight}>
    <div><b>{stats.earned.toLocaleString("en-US")}</b><span>earned</span></div>
    <div class="gold"><b>{stats.goalDays}</b><span>goal Days</span></div>
    <div class="gold"><b>{stats.best}</b><span>best streak</span></div>
    {#if zoom === "year"}<div><b>{stats.topMonth}</b><span>best month</span></div>
    {:else}<div><b>{stats.average}</b><span>per Day</span></div>{/if}
  </div>
  <div class="graph" class:fit={inSlot} bind:clientHeight={graphHeight}>
    <!-- Shared by both views and outside the scroller, so they never move or bounce. -->
    <div class="labels" aria-hidden="true">
      <span></span>
      {#each WEEKDAYS as w}<span class="weekday">{w}</span>{/each}
    </div>
    <!-- The two views overlap while one squeezes into the other. -->
    <div class="stack" bind:clientWidth={width}>
      {#if zoom === "year"}
        <div class="heat yheat" transition:squish={{ year: true }}>
          {#each year as week (week.days[0].day)}
            <span class="month">{week.month}</span>
            {#each week.days as c (c.day)}
              {#if c.blank}<div class="h blank"></div>
              {:else}<button class="h h{c.level}" class:sel={c.day === selected} class:marked={marked.has(c.day)} title={[c.day, ...(marked.get(c.day) ?? [])].join("\n")} aria-label="Show {c.day} by hour" onclick={() => onpick?.(c.day)}></button>{/if}
            {/each}
          {/each}
        </div>
      {:else}
        <div class="scroller" bind:this={scroller} onscroll={onScroll} transition:squish={{ year: false }}>
          <div class="heat">
            {#each weeks as week (week.days[0].day)}
              <span class="month">{week.month}</span>
              {#each week.days as c (c.day)}
                {#if c.blank}<div class="h blank"></div>
                {:else}<button class="h h{c.level}" class:sel={c.day === selected} class:marked={marked.has(c.day)} title={[c.day, ...(marked.get(c.day) ?? [])].join("\n")} aria-label="Show {c.day} by hour" onclick={() => onpick?.(c.day)}></button>{/if}
              {/each}
            {/each}
          </div>
        </div>
      {/if}
    </div>
  </div>
  {#if keyBelow}
    <Legend scale={{ from: "Fewer", colors: ["#22262a", "#1d4d33", "#24804f", "#2fb36b"], to: "More" }} items={[{ kind: "box", color: "var(--goal)", label: `Goal met, ${goal}+` }]} />
  {/if}
</section>

<style>
  /* A named container, so the Today button can shrink to its arrow on a narrow card. */
  /* Weekday labels beside the grid; the rows (--cell tall, set from the
     card's width in the script) are the same in both views. */
  .graph { display: flex; gap: 4px; }
  /* In a tablet slot the grid takes the spare height and sizes its squares to it. */
  .graph.fit { flex: 1; min-height: 0; overflow: hidden; }
  .labels { flex: none; width: 26px; display: grid; grid-template-rows: 14px repeat(7, var(--cell)); gap: 4px; padding: 3px 0; }
  .weekday, .month { font: 500 10px/1 var(--mono); color: var(--muted); display: flex; align-items: center; white-space: nowrap; }
  /* The two views overlap here. Clipped on the left only, where a squeezing
     view would spill over the labels; the last month's name may run into
     the card's padding on the right. */
  .stack { flex: 1; min-width: 0; display: grid; clip-path: inset(-8px -16px -8px 0); }
  .stack > * { grid-area: 1 / 1; transform-origin: calc(100% - 3px) 50%; }
  /* Past the newest weeks, a further swipe moves the tablet's strip of cards. */
  .scroller { min-width: 0; overflow-x: auto; scroll-snap-type: x proximity; scroll-padding-left: 3px; scrollbar-width: none; }
  .scroller::-webkit-scrollbar { display: none; }
  .heat {
    display: grid; grid-template-rows: 14px repeat(7, var(--cell)); grid-auto-flow: column; gap: 4px;
    grid-auto-columns: var(--cell); width: max-content;
    /* Room for the picked Day's outline, which the scroller would clip. */
    padding: 3px;
  }
  /* Year: 53 narrow columns in the same rows. */
  .yheat { grid-auto-columns: var(--ycell); column-gap: 2px; width: auto; }
  .yheat .h { aspect-ratio: auto; height: 100%; border-radius: 2px; }
  .yheat .h.sel { outline-width: 1.5px; }
  .yheat .month { font-size: 9px; }
  /* Month names fade out early while zooming (--zoom-t runs 0 to 1), so they never show stretched. */
  .month { scroll-snap-align: start; align-items: flex-end; overflow: visible; opacity: clamp(0, (var(--zoom-t, 1) - .75) * 4, 1); }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; padding: 0; border: 0; display: block; width: 100%; }
  button.h { cursor: pointer; position: relative; }
  /* A Day with a Marker: a violet corner. */
  .h.marked::after { content: ""; position: absolute; top: 0; right: 0; width: 0; height: 0; border-top: 6px solid #b69cff; border-left: 6px solid transparent; border-top-right-radius: 3px; }
  .yheat .h.marked::after { border-top-width: 4px; border-left-width: 4px; }
  /* The Day the hour chart is showing. */
  .h.sel { outline: 2px solid var(--ink); outline-offset: 1px; }
  button.h:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: var(--goal); }
  .h.blank { background: transparent; }
  .wide { padding: 18px; border-radius: 18px; flex: none; }
</style>
