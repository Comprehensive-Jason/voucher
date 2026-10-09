<script lang="ts">
  // Zoom: Day shows one Day hour by hour (below); Week and Month show a bar
  // per Day across the week (Monday first) or calendar month, with the same
  // stacking, ticks, and list, and arrows that step a whole week or month.
  //
  // Each Day's earnings hour by hour (its totals are in the list below): a bar per hour, split into a segment per
  // source and topped with its count, over faint tick lines, with a triangle under
  // each hour that had a Redemption. Tap a bar to pick that hour: the others
  // fade and the line below lists its count per source (otherwise it lists
  // the whole Day's). Today shows first; swipe (or the arrows) back through
  // earlier Days, as far as the Ledger keeps logs. Past Days load as they
  // come near the screen.
  import { tick, untrack } from "svelte";
  import { ledger } from "../api";
  import { compareSources, groupOf, sourceOf, styleOf } from "../sources";
  import { clock, dayLabel, hourOf, shiftDay } from "../time";
  import Marker from "../components/Marker.svelte";
  import type { DaySummary, DayTotal } from "../types";
  import ScrollCue from "../components/ScrollCue.svelte";
  import TodayButton from "../components/TodayButton.svelte";
  import ZoomSwitch from "../components/ZoomSwitch.svelte";
  import { easeOut, ms } from "../motion";
  /** The new zoom level fades in from a little larger (zooming out) or smaller (zooming in). */
  function zoomIn(_node: Element, { out }: { out: boolean }) {
    return { duration: ms("move"), easing: easeOut, css: (t: number) => `opacity: ${t}; transform: scale(${1 + (out ? 0.06 : -0.06) * (1 - t)})` };
  }
  let listEl = $state<HTMLDivElement>();
  /** One page's exact width. Pages fill the scroller, which can be a fraction
   *  of a pixel wide, while clientWidth is whole pixels: stepping by it drifts
   *  a little per page, and far back in time the page before showed as a
   *  sliver on the left until scroll snapping caught up. The computed width is
   *  exact and ignores the zoom's scale transform. */
  function pageWidth(el: HTMLElement): number {
    const first = el.firstElementChild;
    return (first && parseFloat(getComputedStyle(first).width)) || el.clientWidth;
  }

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

  // Segments stack in the order sources are listed everywhere
  // (compareSources), so a source sits at the same place in every bar (the
  // first at the bottom). Days past the kept log come last.
  type Part = { id: string; name: string; color: string; n: number };
  const EARLIER = "Earlier, by source not kept";
  function partsOf(counts: Map<string, Part>): Part[] {
    return [...counts.values()].sort((a, b) => Number(a.id === EARLIER) - Number(b.id === EARLIER) || compareSources(a, b));
  }
  function columnsOf(summary: DaySummary | undefined) {
    const cols = Array.from({ length: HOURS }, () => ({ counts: new Map<string, Part>(), total: 0, redeemed: 0 }));
    for (const e of summary?.log ?? []) {
      const h = hourOf(e.at, timeZone);
      const col = h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
      if (e.kind === "earned") {
        const { name, color } = sourceOf(e.task);
        const part = cols[col].counts.get(name) ?? { id: groupOf(e.task.split(":")[0]), name, color, n: 0 };
        part.n++;
        cols[col].counts.set(name, part);
        cols[col].total++;
      } else if (e.kind === "redeemed") cols[col].redeemed += e.tickets;
    }
    // Bars draw top to bottom, so the first source in the order ends up lowest.
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
    if (!want) return;
    untrack(() => {
      // The chart keeps its zoom: Day slides to that Day; Week or Month
      // slides to the page holding it, with its bar picked.
      if (zoom !== "day") {
        if (!periodScroller) return;
        let index = pages.indexOf(zoom === "week" ? mondayOf(want.day) : monthOf(want.day));
        if (index < 0) index = want.day < pages[0] ? 0 : pages.length - 1;
        const at = daysOf(pages[index]).indexOf(want.day);
        const pick = at >= 0 && totalOf(want.day)?.earned ? at : null;
        if (index === page) { periodPick = pick; return; }
        // Passing other pages would clear the pick, so it's made once the scroll lands.
        landing = { page: index, pick };
        periodScroller.scrollTo({ left: index * pageWidth(periodScroller), behavior: "smooth" });
        return;
      }
      if (!scroller) return;
      let index = days.indexOf(want.day);
      if (index < 0) index = want.day < days[0] ? 0 : days.length - 1;
      scroller.scrollTo({ left: index * pageWidth(scroller), behavior: "smooth" });
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
    // The Daily goal for the whole Day, whichever hour is picked: when it was met, or how far it got.
    const goal = !current ? "–" : current.goal_met_at ? `met ${clock(current.goal_met_at, timeZone)}` : `${current.earned} of ${current.goal}`;
    return { label: now.label, total: rows.reduce((n, r) => n + r.n, 0), rows, redeemed: now.redeemed, anyRedeemed: day.redeemed > 0, goal, goalMet: !!current?.goal_met };
  });
  /** The hour the Daily goal was met, on the Day in view (a gold mark under its bar). */
  function goalColOf(summary: DaySummary | undefined): number | null {
    if (!summary?.goal_met_at) return null;
    const h = hourOf(summary.goal_met_at, timeZone);
    return h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
  }
  // ---- Week and Month ----
  // Each is a row of pages, one week (Monday first) or calendar month per
  // screen width, back to the Ledger's first Day: swipe or use the arrows,
  // as with Days. Switching zoom keeps the time in view: Week opens on the
  // week holding the Day you were on, and Day opens on the Day you picked.
  type Zoom = "day" | "week" | "month";
  let zoom = $state<Zoom>("day");
  let periodPick = $state<number | null>(null);
  let totals = $state<Record<string, DayTotal>>({});
  let periodScroller = $state<HTMLDivElement>();
  let page = $state(0);
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
  const weekdayOf = (d: string) => (new Date(`${d}T12:00:00Z`).getUTCDay() + 6) % 7; // Monday 0
  const mondayOf = (d: string) => shiftDay(d, -weekdayOf(d));
  const monthOf = (d: string) => `${d.slice(0, 7)}-01`;
  const nextMonth = (first: string) => { const [y, m] = first.split("-").map(Number); return new Date(Date.UTC(y, m, 1, 12)).toISOString().slice(0, 10); };
  /** The first Day of every page, oldest first. */
  function pagesFor(zoom: Zoom): string[] {
    if (zoom === "day") return [] as string[];
    const oldest = firstDay && firstDay < today.day ? firstDay : today.day;
    const out: string[] = [];
    if (zoom === "week") for (let d = mondayOf(oldest); d <= today.day && out.length < 400; d = shiftDay(d, 7)) out.push(d);
    else for (let d = monthOf(oldest); d <= today.day && out.length < 120; d = nextMonth(d)) out.push(d);
    return out;
  }
  const pages = $derived(pagesFor(zoom));
  function daysOf(start: string): string[] {
    if (zoom === "week") return Array.from({ length: 7 }, (_, i) => shiftDay(start, i));
    const out: string[] = [];
    for (let d = start; d < nextMonth(start); d = shiftDay(d, 1)) out.push(d);
    return out;
  }
  function labelOf(index: number): string {
    const start = pages[index], back = pages.length - 1 - index;
    if (!start) return "";
    if (zoom === "week") return back === 0 ? "This week" : back === 1 ? "Last week" : `Week of ${start}`;
    const [y, m] = start.split("-").map(Number);
    return `${MONTHS[m - 1]}${y !== Number(today.day.slice(0, 4)) ? " " + y : ""}`;
  }
  // The whole history, fetched once when Week or Month is first opened;
  // today's numbers come live from `today`.
  let fetched = false;
  $effect(() => {
    if (zoom === "day" || fetched) return;
    fetched = true;
    const span = firstDay && firstDay < today.day ? Math.round((Date.parse(`${today.day}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 86_400_000) + 1 : 1;
    ledger<DayTotal[]>("GET", `/history?days=${Math.min(1100, span)}`).then((list) => {
      const next: Record<string, DayTotal> = {};
      for (const t of list) next[t.day] = t;
      totals = next;
    }).catch(() => { fetched = false; });
  });
  const totalOf = (day: string): DayTotal | undefined => (day === today.day
    ? { day, earned: today.earned, redeemed: today.redeemed, goal_met: today.goal_met, by_source: today.by_source } : totals[day]);
  function colsOf(start: string) {
    return daysOf(start).map((day) => {
      const t = totalOf(day);
      const counts = new Map<string, Part>();
      for (const [id, n] of Object.entries(t?.by_source ?? {})) {
        const { name, color } = styleOf(id);
        const part = counts.get(name) ?? { id: groupOf(id), name, color, n: 0 };
        part.n += n;
        counts.set(name, part);
      }
      // Days past the kept log have a total but no sources: one grey segment.
      const known = [...counts.values()].reduce((a, q) => a + q.n, 0);
      if (t && t.earned > known) counts.set(EARLIER, { id: EARLIER, name: EARLIER, color: "#6c7177", n: t.earned - known });
      const total = [...counts.values()].reduce((a, q) => a + q.n, 0);
      return { day, total, redeemed: t?.redeemed ?? 0, goal: !!t?.goal_met, parts: partsOf(counts), segments: partsOf(counts).reverse(), future: day > today.day };
    });
  }
  const pageCols = $derived(pages[page] ? colsOf(pages[page]) : []);
  const periodBreakdown = $derived.by(() => {
    const all = new Map<string, Part>();
    for (const c of pageCols) for (const q of c.parts) { const sum = all.get(q.name) ?? { ...q, n: 0 }; sum.n += q.n; all.set(q.name, sum); }
    const picked = periodPick === null ? null : pageCols[periodPick];
    const rows = partsOf(all).map((q) => ({ ...q, n: picked ? picked.parts.find((r) => r.name === q.name)?.n ?? 0 : q.n }));
    return { label: picked ? dayLabel(picked.day, today.day) : labelOf(page), total: rows.reduce((n, r) => n + r.n, 0), rows,
      redeemed: picked ? picked.redeemed : pageCols.reduce((n, c) => n + c.redeemed, 0), anyRedeemed: pageCols.some((c) => c.redeemed > 0),
      goal: picked ? (picked.goal ? "met" : "–") : `${pageCols.filter((c) => c.goal).length} of ${pageCols.filter((c) => !c.future).length} days`,
      goalMet: picked ? picked.goal : pageCols.some((c) => c.goal) };
  });
  const shownBreakdown = $derived(zoom === "day" ? breakdown : periodBreakdown);

  /** Bumped on each zoom change, so the new view plays its entrance once. */
  let entrance = $state(0);
  /** True while the new view's bars rise (the last of up to 31 starts 12 ms after the one before). */
  let entering = $state(false);
  let enteringTimer = 0;
  let zoomedOut = $state(true);
  const LEVELS: Zoom[] = ["day", "week", "month"];
  async function setZoom(z: Zoom) {
    if (z === zoom) return;
    // The time in view now: the Day on screen, or the picked (else last) Day of the page.
    const anchor = zoom === "day" ? days[shown]
      : periodPick !== null ? pageCols[periodPick]?.day
      : pageCols.filter((c) => !c.future).at(-1)?.day ?? today.day;
    zoomedOut = LEVELS.indexOf(z) > LEVELS.indexOf(zoom);
    // Which page opens is settled before the new view draws, so its first
    // frame already knows which page is in view (only that one plays the rise).
    let index: number;
    if (z === "day") {
      index = days.indexOf(anchor ?? today.day);
      if (index < 0) index = days.length - 1;
      shown = index; onToday = index >= days.length - 1;
    } else {
      const list = pagesFor(z);
      index = list.indexOf(z === "week" ? mondayOf(anchor ?? today.day) : monthOf(anchor ?? today.day));
      if (index < 0) index = list.length - 1;
      page = index;
    }
    zoom = z; periodPick = null; pick = null; entrance++;
    entering = true;
    clearTimeout(enteringTimer);
    enteringTimer = window.setTimeout(() => (entering = false), ms("move") + 31 * 12 + 60);
    await tick();
    if (z === "day") {
      if (scroller) scroller.scrollLeft = index * pageWidth(scroller);
      load(index - 1); load(index); load(index + 1);
    } else if (periodScroller) periodScroller.scrollLeft = index * pageWidth(periodScroller);
  }
  /** A page the history grid sent the chart to, and the bar to pick there. */
  let landing: { page: number; pick: number | null } | null = null;
  function onPeriodScroll() {
    if (!periodScroller) return;
    const now = Math.round(periodScroller.scrollLeft / pageWidth(periodScroller));
    if (landing) {
      page = now;
      if (now === landing.page && Math.abs(periodScroller.scrollLeft - now * pageWidth(periodScroller)) < 2) { periodPick = landing.pick; landing = null; }
      else periodPick = null;
      return;
    }
    if (now !== page) periodPick = null;
    page = now;
  }
  function step(by: number) {
    if (zoom === "day") go(by);
    else periodScroller?.scrollTo({ left: (page + by) * pageWidth(periodScroller), behavior: "smooth" });
  }
  const onLatest = $derived(zoom === "day" ? shown >= days.length - 1 : page >= pages.length - 1);
  const atStart = $derived(zoom === "day" ? shown === 0 : page === 0);
  function backToToday() {
    if (zoom === "day") go(days.length - 1 - shown);
    else periodScroller?.scrollTo({ left: (pages.length - 1) * pageWidth(periodScroller), behavior: "smooth" });
  }

  function onScroll() {
    if (!scroller) return;
    const now = Math.round(scroller.scrollLeft / pageWidth(scroller));
    if (now !== shown) pick = null;
    shown = now;
    if (Math.abs(scroller.scrollLeft - now * pageWidth(scroller)) < 2) onToday = now >= days.length - 1;
    load(shown - 1); load(shown); load(shown + 1);
  }
  function go(by: number) {
    const target = Math.max(0, Math.min(days.length - 1, shown + by));
    onToday = target >= days.length - 1;
    scroller?.scrollTo({ left: target * pageWidth(scroller), behavior: "smooth" });
  }

  // Open on today, and move on to the new today when a Day is added, unless
  // scrolled back. Only a change in the number of Days does this: Today's
  // numbers refresh every few seconds, and snapping on each refresh pulled the
  // view back to today in the middle of a slide to yesterday.
  let onToday = $state(true);
  let lastCount = 0;
  $effect(() => {
    const count = days.length;
    const el = scroller;
    untrack(() => {
      if (!el || count === lastCount) return;
      lastCount = count;
      if (!onToday) return;
      el.scrollLeft = el.scrollWidth;
      shown = count - 1;
      load(shown - 1);
    });
  });
</script>

<section class="card" class:tall>
  <div class="cardhead">
    <div class="switcher">
      <button class="nav" aria-label="Earlier {zoom}" disabled={atStart} onclick={() => step(-1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <!-- The zoom switch says hours or days, so the title only names the time. -->
      <!-- A date never breaks in the middle when the name wraps. -->
      <span class="cap title">{#each (zoom === "day" ? dayLabel(days[shown], today.day) : labelOf(page)).split(" ") as word, i}{i ? " " : ""}<span class="word">{word}</span>{/each}</span>
      <button class="nav" aria-label="Later {zoom}" disabled={onLatest} onclick={() => step(1)}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
    <div class="tools">
      <TodayButton show={!onLatest} onclick={backToToday} />
      <ZoomSwitch options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} value={zoom} onchange={(z) => setZoom(z as Zoom)} />
    </div>
  </div>
  <!-- A new zoom level grows in from the old one's scale (larger when zooming
       out, smaller when zooming in), and its bars rise one after another. -->
  {#key entrance}
  <div class="viewport" class:entering in:zoomIn={{ out: zoomedOut }}>
  {#if zoom === "day"}
  <div class="days" bind:this={scroller} onscroll={onScroll}>
    {#each days as day (day)}
      {@const cols = columnsOf(summaryOf(day))}
      {@const unit = unitOf(cols)}
      {@const here = days[shown] === day}
      {@const goalCol = goalColOf(summaryOf(day))}
      <div class="day" class:here>
        <div class="chart" style="height: {chart}px">
          <div class="tick" style="bottom: {plot / 2}px"><span class="mono">{topOf(cols) / 2}</span></div>
          <div class="tick" style="bottom: {plot}px"><span class="mono">{topOf(cols)}</span></div>
          {#each cols as c, i}
            <button class="col" style="--i: {i}" class:faded={here && pick !== null && pick !== i} class:picked={here && pick === i} class:goal={i === goalCol}
              aria-label="{String(FIRST_HOUR + i).padStart(2, '0')}:00, {c.total} earned" aria-pressed={here && pick === i}
              onclick={() => (pick = pick === i || !c.total ? null : i)}>
              {#if c.total}
                <span class="mono n">{c.total}</span>
                <div class="bar" style="height: {Math.max(c.total * unit, c.segments.length * MIN_SEGMENT)}px">
                  {#each c.segments as seg}<i style="flex: {seg.n} 0 {MIN_SEGMENT}px; background: {seg.color}"></i>{/each}
                </div>
              {/if}
              {#if i === goalCol}<i class="goalmark" title="Daily goal met"></i>{/if}
            </button>
          {/each}
        </div>
        <div class="dots">
          {#each cols as c}<div>{#if c.redeemed}<Marker kind="redeemed" size={tall ? 9 : 7} /><span class="mono tn">{c.redeemed}</span>{/if}</div>{/each}
        </div>
        <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
      </div>
    {/each}
  </div>
  {:else}
    <div class="days" bind:this={periodScroller} onscroll={onPeriodScroll}>
      {#each pages as first, pi (first)}
        {@const cols = colsOf(first)}
        {@const busiest = Math.max(0, ...cols.map((c) => c.total))}
        {@const top = Math.max(2, busiest + (busiest % 2))}
        {@const unit = plot / top}
        {@const n = cols.length}
        {@const here = pi === page}
        {@const gap = n > 7 ? 2 : tall ? 10 : 8}
        <div class="day period" class:here>
          <div class="chart" style="height: {chart}px; grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px">
            <div class="tick" style="bottom: {plot / 2}px"><span class="mono">{top / 2}</span></div>
            <div class="tick" style="bottom: {plot}px"><span class="mono">{top}</span></div>
            {#each cols as c, i (c.day)}
              {@const picked = here && periodPick === i}
              <button class="col" class:faded={here && periodPick !== null && periodPick !== i} class:picked class:future={c.future} class:goal={c.goal}
                style="--i: {i}" aria-label="{c.day}, {c.total} earned" aria-pressed={picked} disabled={c.future}
                onclick={() => (periodPick = periodPick === i || !c.total ? null : i)}>
                {#if c.total}
                  <!-- A month's bars are too narrow for every count: it labels the busiest Day and the picked one. -->
                  {#if n <= 7 || picked || ((!here || periodPick === null) && c.total === busiest)}<span class="mono n">{c.total}</span>{:else}<span class="mono n blank"></span>{/if}
                  <div class="bar" style="height: {Math.max(c.total * unit, c.segments.length * MIN_SEGMENT)}px">
                    {#each c.segments as seg}<i style="flex: {seg.n} 0 {MIN_SEGMENT}px; background: {seg.color}"></i>{/each}
                  </div>
                {/if}
                {#if c.goal}<i class="goalmark" title="Daily goal met"></i>{/if}
              </button>
            {/each}
          </div>
          <div class="dots" style="grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px">
            <!-- A month's columns only have room for the count; the list names the triangle. -->
            {#each cols as c}<div>{#if c.redeemed}{#if n <= 7}<Marker kind="redeemed" size={tall ? 9 : 7} />{/if}<span class="mono tn">{c.redeemed}</span>{/if}</div>{/each}
          </div>
          <div class="mono axis periodaxis" style="grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px">
            {#each cols as c, i}
              <span class:today={c.day === today.day}>{zoom === "week" ? ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"][i] : [0, 7, 14, 21, 28].includes(i) ? i + 1 : ""}</span>
            {/each}
          </div>
        </div>
      {/each}
    </div>
  {/if}
  </div>
  {/key}
  <div class="legend">
    <!-- Outside the scrolling list, so it stays put when the list bounces. -->
    <div class="row head"><span class="mono when">{shownBreakdown.label}</span><span class="mono">{shownBreakdown.total} earned</span></div>
    <div class="lframe">
    <ScrollCue target={listEl} />
    <div class="list" aria-live="polite" bind:this={listEl}>
    {#each shownBreakdown.rows as row (row.name)}
      <div class="row" class:zero={!row.n}><span class="mk"><Marker kind="source" color={row.color} /></span><span class="name">{row.name}</span><b class="mono">{row.n || "–"}</b></div>
    {/each}
    {#if shownBreakdown.anyRedeemed}
      <div class="row" class:zero={!shownBreakdown.redeemed}><span class="mk"><Marker kind="redeemed" /></span><span class="name">Redeemed</span><b class="mono">{shownBreakdown.redeemed || "–"}</b></div>
    {/if}
    <!-- The gold mark under a bar: the hour the Daily goal was met, or a Day that met it. -->
    <div class="row goalrow" class:zero={!shownBreakdown.goalMet}><span class="mk"><Marker kind="goal" /></span><span class="name">Daily goal</span><b class="mono">{shownBreakdown.goal}</b></div>
    {#if !shownBreakdown.rows.length && !shownBreakdown.anyRedeemed}
      <div class="row none">{zoom !== "day" ? `Nothing earned ${zoom === "week" ? "this week" : "this month"}` : current && current.earned > 0 ? `${current.earned} earned; the hour-by-hour detail isn't kept this far back` : days[shown] === today.day ? "Nothing earned yet" : "Nothing earned this Day"}</div>
    {/if}
    </div>
    </div>
    <!-- Stays at the bottom of the box, however long the list is. -->
    {#if shownBreakdown.rows.length}<div class="hintline">{zoom === "day" ? (pick === null ? "Tap a bar to see that hour" : "Tap it again for the whole day") : periodPick === null ? "Tap a bar to see that day" : `Tap it again for the whole ${zoom}`}</div>{/if}
  </div>
</section>

<style>
  /* A named container, so the Today button can shrink to its arrow on a narrow card. */
  .card { container: card / inline-size; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  /* Clipped to its own box while it zooms in: Android's WebView kept the
     scroller's clip at the unscaled size, so a few pixels of the page before
     showed at the left edge as the view grew or shrank into place. This clip
     scales with the view. */
  .viewport { position: relative; transform-origin: 50% 100%; clip-path: inset(0); }
  /* After a zoom change, the bars on screen rise from the axis one after another. */
  /* Only the page in view plays it: animating every page's bars put them on
     their own layers, and Android's WebView let the page before flicker
     in at the left edge. */
  .entering .here .bar { animation: rise var(--t-move) var(--ease-out) both; animation-delay: calc(var(--i, 0) * 12ms); transform-origin: 50% 100%; }
  @keyframes rise { from { transform: scaleY(0); } }
  .col.future { cursor: default; }
  .n.blank { height: 11px; }
  .periodaxis { display: grid; justify-content: stretch; }
  .periodaxis span { text-align: center; white-space: nowrap; }
  .periodaxis span.today { color: var(--ink); font-weight: 700; }
  .switcher { display: flex; align-items: center; gap: 2px; margin-left: -8px; min-width: 0; }
  /* A long name ("Week of 2026-07-27") breaks onto a second line on a narrow card. */
  .title .word { white-space: nowrap; }
  .title { display: -webkit-box; -webkit-box-orient: vertical; -webkit-line-clamp: 2; line-clamp: 2; overflow: hidden; line-height: 1.15; }
  .switcher:not(:has(.nav)) { margin-left: 0; }
  .nav { width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; background: none; color: var(--muted); cursor: pointer; }
  .nav:disabled { opacity: .3; cursor: default; }
  /* One Day per screen width, snapping, with no scrollbar: the arrows and
     the header say where you are. */
  .days { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; overscroll-behavior-x: contain; scrollbar-width: none; }
  .days::-webkit-scrollbar { display: none; }
  /* Each page clips its own drawing, so nothing from a neighbour shows. */
  .day { contain: paint; flex: 0 0 100%; scroll-snap-align: start; display: flex; flex-direction: column; gap: 12px; }
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
    transition: opacity var(--t-base) ease;
  }
  .col.faded { opacity: .3; }
  .col.picked .n { color: var(--ink); font-weight: 700; }
  .col:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; border-radius: 4px; }
  .n { font-size: 10px; line-height: 11px; text-align: center; color: var(--muted); }
  /* A bar grows to its new height, and its segments to their new shares, when an hour earns. */
  .bar { display: flex; flex-direction: column; gap: 1px; border-radius: 4px 4px 2px 2px; overflow: hidden; transition: height var(--t-move) var(--ease-out); }
  .bar i { min-height: 0; transition: flex-grow var(--t-move) var(--ease-out); }
  .dots { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; align-items: center; gap: 2px; min-width: 0; }
  /* How many were torn, beside the triangle (alone in a month's narrow columns). */
  .tn { font-size: 9px; line-height: 1; font-weight: 700; color: var(--ink); }
  .tall .tn { font-size: 10px; }
  /* Gold just under the axis line below a bar: the Daily goal was met (that
     Day, or in that hour). It sits in the gap above the triangles, so the bars
     keep all their height. */
  .goalmark { position: absolute; left: 0; right: 0; bottom: -7px; height: 3px; border-radius: 2px; background: var(--goal); pointer-events: none; }
  .col.goal .n { color: var(--goal); font-weight: 700; }
  .row.goalrow b { color: var(--goal); }
  .row.goalrow.zero b { color: var(--muted); }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  /* The picked hour's (or the whole Day's) count per source; it doubles as
     the colour key, since it names every colour on screen. */
  .legend { display: flex; flex-direction: column; padding: 4px 12px; border-radius: 12px; background: #1f2226; font-size: 13px; color: #c9cdd1; }
  .lframe { position: relative; display: flex; flex-direction: column; }
  .list { position: relative; display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; min-height: 30px; border-top: 1px solid var(--divider); }
  .row.head { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; border-top: 0; font-size: 11px; color: var(--muted); }
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
  .tall .cardhead, .tall .days, .tall .viewport { flex: none; }
  .tall .legend { flex: 1; min-height: 96px; }
  .tall .lframe { flex: 1; min-height: 0; }
  .tall .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; }
  .tall .hintline { flex: none; }
  .tall .row.head { flex: none; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .day { gap: 14px; }
  .tall .dots { height: 18px; }
  .tall .n { font-size: 11px; }
</style>
