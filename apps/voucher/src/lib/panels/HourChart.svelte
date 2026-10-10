<script lang="ts">
  // Two twins share this chart (`measure`): Vouchers earned, from the log,
  // and Distraction time, from the minutes the phone reports per app and
  // hour (shown by blocklist), drawn over a salmon outline of the time
  // Unlocks allowed.
  //
  // Zoom: Day shows one Day hour by hour (below); Week and Month show a bar
  // per Day across the week (Monday first) or calendar month, with the same
  // stacking, ticks, and list, and arrows that step a whole week or month.
  //
  // Each Day's earnings hour by hour (its totals are in the list below): a bar per hour, split into a segment per
  // source and topped with its count, over faint tick lines. The strip under
  // the bars marks the hour the Daily goal was met with a star on Vouchers
  // earned, and each hour's Unlocks (a triangle and the Vouchers torn) on
  // Distraction time. Tap a bar to pick that hour: the others
  // fade and the line below lists its count per source (otherwise it lists
  // the whole Day's). Today shows first; swipe (or the arrows) back through
  // earlier Days, as far as the Ledger keeps logs. Past Days load as they
  // come near the screen.
  //
  // Distraction time's list also says how often a blocked open (opening a
  // blocklisted app while nothing is unlocked) ended without an Unlock:
  // "Walked away 49 of 67", over the Day, week, or month in view (or the
  // picked Day), whichever hour is picked, since opens aren't kept by hour.
  import { tick, untrack } from "svelte";
  import { ledger } from "../api";
  import { compareSources, groupOf, sourceOf, styleOf } from "../sources";
  import { blocklistOf } from "../blocklists";
  import { clock, dayLabel, hourOf, periodLabel, shiftDay } from "../time";
  import CardHead from "../components/CardHead.svelte";
  import Marker from "../components/Marker.svelte";
  import type { Blocklist, DaySummary, DayTotal, DeviceUsage, Entry } from "../types";
  import ScrollCue from "../components/ScrollCue.svelte";
  import ZoomSwitch from "../components/ZoomSwitch.svelte";
  import { ms, zoomFade } from "../motion";
  import { selection } from "../selection.svelte";
  import { inCurfew } from "../curfew.svelte";
  import { clock as clockOf, hourOfMoment, notes } from "../notes.svelte";

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

  let { today, timeZone, tall = false, firstDay, measure = "earned", blocklists = {}, device = null }: {
    today: DaySummary; timeZone: string; tall?: boolean;
    /** What the bars count: Vouchers earned, or minutes in Distractions. */
    measure?: "earned" | "distraction";
    /** Distraction time only: each app takes its blocklist's colour. */
    blocklists?: Record<string, Blocklist>;
    /** Distraction time only: this device's blocked opens today, fresher than the Ledger's for today. */
    device?: DeviceUsage | null;
    /** The oldest Day whose log the Ledger keeps; without it, only today shows. */
    firstDay?: string;
  } = $props();

  const FIRST_HOUR = 6;
  // The whole Day, 06:00 to 06:00: Vouchers earned during Curfew count too,
  // and Curfew's hours are shaded in the night colour.
  const HOURS = 24;
  /** A clock hour's column: 06:00 first, 05:00 last. */
  const columnOf = (h: number) => (h - FIRST_HOUR + 24) % 24;
  const hourOfColumn = (i: number) => (FIRST_HOUR + i) % 24;
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
  const minutes = $derived(measure === "distraction");
  /** Distraction time counts by blocklist, not by app: each app's or site's
   *  minutes go to the blocklist the measuring device said it was on (it
   *  knows each app's package, and which apps are games), or else to the
   *  blocklist naming an app of that name or that site, or else to Other. That keeps the bars and
   *  the list to a handful of rows, each in its blocklist's colour. */
  const OTHER: Part = { id: "~other", name: "Other", color: "#9aa0a6", n: 0 };
  function listPart(app: string, said?: string): Part {
    const id = said && blocklists[said] ? said : blocklistOf(app, blocklists);
    return id ? { id, name: blocklists[id].name, color: blocklists[id].color, n: 0 } : { ...OTHER };
  }
  /** Adds an app's minutes to its blocklist's part. */
  function addTo(counts: Map<string, Part>, app: string, m: number, lists?: Record<string, string>) {
    const fresh = listPart(app, lists?.[app]);
    const part = counts.get(fresh.id) ?? fresh;
    part.n += m;
    counts.set(fresh.id, part);
  }
  function partsOf(counts: Map<string, Part>): Part[] {
    return [...counts.values()].sort((a, b) => minutes
      ? Number(a.id === OTHER.id) - Number(b.id === OTHER.id) || a.name.localeCompare(b.name)
      : Number(a.id === EARLIER) - Number(b.id === EARLIER) || compareSources(a, b));
  }
  /** A bar's segments, top to bottom: neighbours of one colour (apps on the
   *  same blocklist) join into one block, so a bar doesn't turn to stripes. */
  function segmentsOf(counts: Map<string, Part>): Part[] {
    const out: Part[] = [];
    for (const p of partsOf(counts).reverse()) {
      const last = out.at(-1);
      if (minutes && last && last.color === p.color) out[out.length - 1] = { ...last, n: last.n + p.n };
      else out.push(p);
    }
    return out;
  }
  /** Minutes in clock hour `h` the most-silent device wasn't watching. */
  const silentAt = (summary: DaySummary | undefined, h: number) =>
    Math.max(0, ...Object.values(summary?.silent ?? {}).map((hours) => hours[h] ?? 0));
  /** Markers in clock hour `h` of `day`. */
  const marksAt = (day: string, h: number) => notes.on(day).filter((m) => Math.floor(hourOfMoment(m.at)) === h);
  $effect(() => { notes.load(); });

  /** Minutes Unlocked in each clock hour (midnight first): each tear runs on
   *  from the Unlock before it, if that was still going. */
  function unlockedByHour(log: Entry[]): number[] {
    const out = Array<number>(24).fill(0);
    const hourCache = new Map<number, number>();
    const hourAt = (ms: number) => {
      const key = Math.floor(ms / 1_800_000); // half hours, for zones a half hour off
      if (!hourCache.has(key)) hourCache.set(key, hourOf(new Date(key * 1_800_000).toISOString(), timeZone));
      return hourCache.get(key)!;
    };
    let end = 0;
    const tears = log.filter((e): e is Extract<Entry, { kind: "redeemed" }> => e.kind === "redeemed").sort((a, b) => a.at.localeCompare(b.at));
    for (const t of tears) {
      const start = Math.max(Date.parse(t.at), end);
      end = start + t.minutes * 60_000;
      for (let at = start; at < end; at += 60_000) out[hourAt(at)]++;
    }
    return out;
  }
  function columnsOf(summary: DaySummary | undefined) {
    const cols = Array.from({ length: HOURS }, () => ({ counts: new Map<string, Part>(), total: 0, redeemed: 0, unlocked: 0 }));
    const colOf = columnOf;
    if (minutes) {
      for (const [app, hours] of Object.entries(summary?.usage ?? {})) {
        hours.forEach((m, h) => {
          if (!m) return;
          const col = cols[colOf(h)];
          addTo(col.counts, app, m, summary?.usage_lists);
          col.total += m;
        });
      }
      unlockedByHour(summary?.log ?? []).forEach((m, h) => (cols[colOf(h)].unlocked += m));
      // The Vouchers torn in each hour, for the triangles under the bars.
      for (const e of summary?.log ?? []) if (e.kind === "redeemed") cols[colOf(hourOf(e.at, timeZone))].redeemed += e.tickets;
      return cols.map((c) => ({ ...c, parts: partsOf(c.counts), segments: segmentsOf(c.counts) }));
    }
    for (const e of summary?.log ?? []) {
      const h = hourOf(e.at, timeZone);
      const col = columnOf(h);
      if (e.kind === "earned") {
        const { name, color } = sourceOf(e.task);
        const part = cols[col].counts.get(name) ?? { id: groupOf(e.task.split(":")[0]), name, color, n: 0 };
        part.n++;
        cols[col].counts.set(name, part);
        cols[col].total++;
      } else if (e.kind === "redeemed") cols[col].redeemed += e.tickets;
    }
    // Bars draw top to bottom, so the first source in the order ends up lowest.
    return cols.map((c) => ({ ...c, parts: partsOf(c.counts), segments: segmentsOf(c.counts) }));
  }
  /** What the line under the chart lists: the picked hour, or the whole Day. */
  function breakdownOf(cols: ReturnType<typeof columnsOf>, pick: number | null) {
    if (pick !== null) {
      const c = cols[pick];
      const hour = hourOfColumn(pick);
      const label = `${String(hour).padStart(2, "0")}:00 to ${String((hour + 1) % 24).padStart(2, "0")}:00`;
      return { label, parts: c.parts, redeemed: c.redeemed, unlocked: c.unlocked };
    }
    const all = new Map<string, Part>();
    for (const c of cols) for (const p of c.parts) {
      const sum = all.get(p.name) ?? { ...p, n: 0 };
      sum.n += p.n;
      all.set(p.name, sum);
    }
    return { label: "All Day", parts: partsOf(all), redeemed: cols.reduce((n, c) => n + c.redeemed, 0), unlocked: cols.reduce((n, c) => n + c.unlocked, 0) };
  }
  /** The top tick line's number: the smallest even number at or above the
   *  busiest hour, and at least 2, so the half-way line is a whole number. */
  function topOf(cols: { total: number; unlocked: number }[]): number {
    const max = Math.max(0, ...cols.map((c) => Math.max(c.total, c.unlocked)));
    return Math.max(2, max + (max % 2));
  }
  // Two tick lines that never move, at half and full height; their numbers
  // follow the Day's busiest hour (topOf), and bars scale to match. Segments
  // never drop below MIN_SEGMENT, and the count on top says exactly how many.
  const LABEL = 14;
  const MIN_SEGMENT = 3;
  const plot = $derived(chart - LABEL);
  function unitOf(cols: { total: number; unlocked: number }[]) {
    return plot / topOf(cols);
  }

  async function load(index: number) {
    const day = days[index];
    if (!day || day === today.day || past[day]) return;
    try { past[day] = await ledger<DaySummary>("GET", `/day?date=${day}`); } catch { /* stays blank */ }
  }

  // ---- The shared Day and span ----
  // Whatever Day and span another card picks, this one shows (selection.svelte.ts);
  // what's picked or scrolled to here, the others show.
  const me = $derived(measure);
  $effect(() => {
    selection.seq;
    untrack(() => { if (selection.from !== me) follow(); });
  });
  async function follow() {
    const want = selection.day ?? today.day;
    if (selection.span !== zoom) await setZoom(selection.span, want);
    // Day slides to that Day; Week or Month slides to the page holding it,
    // with its bar picked if a Day was picked.
    if (zoom !== "day") {
      if (!periodScroller) return;
      let index = pages.indexOf(zoom === "week" ? mondayOf(want) : monthOf(want));
      if (index < 0) index = want < pages[0] ? 0 : pages.length - 1;
      const at = daysOf(pages[index]).indexOf(want);
      const pick = selection.picked && at >= 0 ? at : null;
      if (index === page) { periodPick = pick; return; }
      // Passing other pages would clear the pick, so it's made once the scroll lands.
      landing = { page: index, pick };
      periodScroller.scrollTo({ left: index * pageWidth(periodScroller), behavior: "smooth" });
      return;
    }
    if (!scroller) return;
    let index = days.indexOf(want);
    if (index < 0) index = want < days[0] ? 0 : days.length - 1;
    if (index !== shown) scroller.scrollTo({ left: index * pageWidth(scroller), behavior: "smooth" });
  }
  /** Tells the other cards the Day this one settled on (null for today). */
  function share(day: string | undefined, picked = false) {
    if (day) selection.set(me, { day: day === today.day ? null : day, picked });
  }
  /** After a swipe or step in Week or Month: the shared Day stays if it's on
   *  the new page, else becomes the page's latest Day so far. */
  function sharePage() {
    if (landing || !pages[page]) return;
    const onPage = daysOf(pages[page]);
    const now = selection.day ?? today.day;
    if (!onPage.includes(now)) share(onPage.filter((d) => d <= today.day).at(-1));
  }

  // The picked hour, on the Day in view; moving to another Day lets it go.
  let pick = $state<number | null>(null);
  // The list keeps the Day's sources in place whichever hour is picked, so it
  // doesn't jump; an hour without a source shows a dash for it.
  const breakdown = $derived.by(() => {
    const cols = columnsOf(current);
    const day = breakdownOf(cols, null);
    const now = pick === null ? day : breakdownOf(cols, pick);
    const rows = day.parts.map((p) => ({ ...p, n: now.parts.find((q) => q.name === p.name)?.n ?? 0 }));
    // Distraction time lists the most-used app first.
    if (minutes) rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    // The Daily goal for the whole Day, whichever hour is picked: when it was met, or how far it got.
    const goal = !current ? "–" : current.goal_met_at ? `met ${clock(current.goal_met_at, timeZone)}` : `${current.earned} of ${current.goal}`;
    // Opens aren't kept by hour, so the whole Day's show whichever hour is picked, as the goal does.
    const opens = minutes ? opensOf(days[shown]) : { opens: 0, walked: 0 };
    return { label: now.label, total: rows.reduce((n, r) => n + r.n, 0), rows, redeemed: now.redeemed, goal, goalMet: !!current?.goal_met, unlocked: now.unlocked, opens };
  });
  /** The hour the Daily goal was met, on the Day in view (a gold star under its
   *  bar). Vouchers earned only: Distraction time's strip holds the Unlocks. */
  function goalColOf(summary: DaySummary | undefined): number | null {
    if (minutes || !summary?.goal_met_at) return null;
    const h = hourOf(summary.goal_met_at, timeZone);
    return columnOf(h);
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
    return periodLabel(zoom === "month" ? "month" : "week", start, today.day);
  }
  // The whole history, fetched once when Week or Month is first opened (or
  // at once on Distraction time, whose Day view lists its walk-aways);
  // today's numbers come live from `today`.
  let fetched = false;
  $effect(() => {
    if ((zoom === "day" && !minutes) || fetched) return;
    fetched = true;
    const span = firstDay && firstDay < today.day ? Math.round((Date.parse(`${today.day}T12:00:00Z`) - Date.parse(`${firstDay}T12:00:00Z`)) / 86_400_000) + 1 : 1;
    ledger<DayTotal[]>("GET", `/history?days=${Math.min(1100, span)}`).then((list) => {
      const next: Record<string, DayTotal> = {};
      for (const t of list) next[t.day] = t;
      totals = next;
    }).catch(() => { fetched = false; });
  });
  const totalOf = (day: string): DayTotal | undefined => (day === today.day
    ? { day, earned: today.earned, redeemed: today.redeemed, goal_met: today.goal_met, by_source: today.by_source, unlocked_minutes: today.unlocked_minutes,
        used: Object.fromEntries(Object.entries(today.usage ?? {}).map(([app, hours]) => [app, hours.reduce((a, b) => a + b, 0)])), used_lists: today.usage_lists } : totals[day]);
  function colsOf(start: string) {
    return daysOf(start).map((day) => {
      const t = totalOf(day);
      const counts = new Map<string, Part>();
      if (minutes) {
        for (const [app, n] of Object.entries(t?.used ?? {})) if (n) addTo(counts, app, n, t?.used_lists);
        const total = [...counts.values()].reduce((a, q) => a + q.n, 0);
        return { day, total, unlocked: t?.unlocked_minutes ?? 0, redeemed: t?.redeemed ?? 0, goal: false, parts: partsOf(counts), segments: segmentsOf(counts), future: day > today.day };
      }
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
      return { day, total, unlocked: 0, redeemed: t?.redeemed ?? 0, goal: !!t?.goal_met, parts: partsOf(counts), segments: segmentsOf(counts), future: day > today.day };
    });
  }
  /** A Day's blocked opens and how many ended without an Unlock, all devices
   *  together. Today's history is fetched once, so this device's own live
   *  counts stand in where they're ahead of it. */
  function opensOf(day: string): { opens: number; walked: number } {
    const t = totals[day];
    let opens = t?.opens ?? 0, walked = t?.walked ?? 0;
    if (day === today.day && device) { opens = Math.max(opens, device.blockedOpens); walked = Math.max(walked, device.closedWithoutTearing); }
    return { opens, walked: Math.min(walked, opens) };
  }
  function opensOver(list: string[]): { opens: number; walked: number } {
    return list.reduce((sum, d) => { const o = opensOf(d); return { opens: sum.opens + o.opens, walked: sum.walked + o.walked }; }, { opens: 0, walked: 0 });
  }
  const pageCols = $derived(pages[page] ? colsOf(pages[page]) : []);
  const periodBreakdown = $derived.by(() => {
    const all = new Map<string, Part>();
    for (const c of pageCols) for (const q of c.parts) { const sum = all.get(q.name) ?? { ...q, n: 0 }; sum.n += q.n; all.set(q.name, sum); }
    const picked = periodPick === null ? null : pageCols[periodPick];
    const rows = partsOf(all).map((q) => ({ ...q, n: picked ? picked.parts.find((r) => r.name === q.name)?.n ?? 0 : q.n }));
    if (minutes) rows.sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    return { label: picked ? dayLabel(picked.day, today.day) : labelOf(page), total: rows.reduce((n, r) => n + r.n, 0), rows,
      redeemed: picked ? picked.redeemed : pageCols.reduce((n, c) => n + c.redeemed, 0),
      goal: picked ? (picked.goal ? "met" : "–") : `${pageCols.filter((c) => c.goal).length} of ${pageCols.filter((c) => !c.future).length} Days`,
      goalMet: picked ? picked.goal : pageCols.some((c) => c.goal),
      unlocked: picked ? picked.unlocked : pageCols.reduce((n, c) => n + c.unlocked, 0),
      opens: minutes ? opensOver(picked ? [picked.day] : pageCols.filter((c) => !c.future).map((c) => c.day)) : { opens: 0, walked: 0 } };
  });
  const shownBreakdown = $derived(zoom === "day" ? breakdown : periodBreakdown);

  /** Bumped on each zoom change, so the new view plays its entrance once. */
  let entrance = $state(0);
  /** True while the new view's bars rise (the last of up to 31 starts 12 ms after the one before). */
  let entering = $state(false);
  let enteringTimer = 0;
  let zoomedOut = $state(true);
  const LEVELS: Zoom[] = ["day", "week", "month"];
  /** A switch made here: this card zooms, and the others follow. */
  async function pickZoom(z: Zoom) {
    // Opens on the shared Day, so every card lands on the same one.
    await setZoom(z, selection.day ?? today.day);
    selection.set(me, { span: z, picked: false });
  }
  async function setZoom(z: Zoom, at?: string) {
    if (z === zoom) return;
    // The time in view now: the shared Day, else the Day on screen, or the picked (else last) Day of the page.
    const anchor = at ?? (zoom === "day" ? days[shown]
      : periodPick !== null ? pageCols[periodPick]?.day
      : pageCols.filter((c) => !c.future).at(-1)?.day ?? today.day);
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

<section class="card tile" class:tall>
  <CardHead title={minutes ? "Distraction time" : "Vouchers earned"}
    nav={{ label: zoom === "day" ? dayLabel(days[shown], today.day) : labelOf(page), back: !atStart, forward: !onLatest, onback: () => step(-1), onforward: () => step(1) }}
    today={{ show: !onLatest, onclick: backToToday }}>
    {#snippet tools()}
      <ZoomSwitch options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} value={zoom} onchange={(z) => pickZoom(z as Zoom)} />
    {/snippet}
  </CardHead>
  <!-- A new zoom level grows in from the old one's scale (larger when zooming
       out, smaller when zooming in), and its bars rise one after another. -->
  {#key entrance}
  <div class="viewport" class:entering in:zoomFade={{ out: zoomedOut }}>
  {#if zoom === "day"}
  <div class="days" bind:this={scroller} onscroll={onScroll} onscrollend={() => share(days[shown])}>
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
            {@const quiet = minutes && silentAt(summaryOf(day), hourOfColumn(i)) >= 15}
            {@const marks = marksAt(day, hourOfColumn(i))}
            <button class="col" style="--i: {i}" class:faded={here && pick !== null && pick !== i} class:picked={here && pick === i} class:goal={i === goalCol} class:night={inCurfew(hourOfColumn(i))} class:silent={quiet}
              title={[quiet ? "Voucher wasn't watching for part of this hour, so its minutes may be missing" : "", ...marks.map((m) => `${clockOf(m.at)} ${m.text}`)].filter(Boolean).join("\n") || undefined}
              aria-label="{String(hourOfColumn(i)).padStart(2, '0')}:00, {c.total} earned" aria-pressed={here && pick === i}
              onclick={() => (pick = pick === i || (!c.total && !c.unlocked) ? null : i)}>
              {#if minutes && c.unlocked}<i class="allow" style="height: {c.unlocked * unit}px"></i>{/if}
              {#if c.total}
                <span class="mono n">{c.total}</span>
                <div class="bar" style="height: {Math.max(c.total * unit, c.segments.length * MIN_SEGMENT)}px">
                  {#each c.segments as seg}<i style="flex: {seg.n} 0 {MIN_SEGMENT}px; background: {seg.color}"></i>{/each}
                </div>
              {/if}
              {#if marks.length}<i class="flag" class:rule={marks.every((m) => m.rule)}></i>{/if}
            </button>
          {/each}
        </div>
        <div class="dots">
          <!-- Vouchers earned: a star in the hour the Daily goal was met. Distraction time: each hour's Unlocks. -->
          {#each cols as c, i}
            {#if i === goalCol}<div title="Daily goal met"><Marker kind="goal" size={tall ? 12 : 9} /></div>
            {:else}<div>{#if minutes && c.redeemed}<Marker kind="redeemed" size={tall ? 9 : 7} /><span class="mono tn">{c.redeemed}</span>{/if}</div>{/if}
          {/each}
        </div>
        <!-- A label every three hours, each over its own column. -->
        <div class="mono axis hours">{#each Array(HOURS) as _, i}<span>{i % 3 === 0 ? String(hourOfColumn(i)).padStart(2, "0") : ""}</span>{/each}</div>
      </div>
    {/each}
  </div>
  {:else}
    <div class="days" bind:this={periodScroller} onscroll={onPeriodScroll} onscrollend={sharePage}>
      {#each pages as first, pi (first)}
        {@const cols = colsOf(first)}
        {@const busiest = Math.max(0, ...cols.map((c) => c.total))}
        {@const top = topOf(cols)}
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
                onclick={() => { periodPick = periodPick === i || (!c.total && !c.unlocked) ? null : i; share(c.day, periodPick !== null); }}>
                {#if minutes && c.unlocked}<i class="allow" style="height: {c.unlocked * unit}px"></i>{/if}
                {#if c.total}
                  <!-- A month's bars are too narrow for every count: it labels the busiest Day and the picked one. -->
                  {#if n <= 7 || picked || ((!here || periodPick === null) && c.total === busiest)}<span class="mono n">{c.total}</span>{:else}<span class="mono n blank"></span>{/if}
                  <div class="bar" style="height: {Math.max(c.total * unit, c.segments.length * MIN_SEGMENT)}px">
                    {#each c.segments as seg}<i style="flex: {seg.n} 0 {MIN_SEGMENT}px; background: {seg.color}"></i>{/each}
                  </div>
                {/if}
              </button>
            {/each}
          </div>
          <div class="dots" style="grid-template-columns: repeat({n}, minmax(0, 1fr)); gap: {gap}px">
            <!-- A star under each Day that met the Daily goal, or the Vouchers torn that Day; a month's
                 columns only have room for the count, and the list names the triangle. -->
            {#each cols as c}
              {#if !minutes && c.goal}<div title="Daily goal met"><Marker kind="goal" size={tall ? 12 : n > 7 ? 8 : 9} /></div>
              {:else}<div>{#if minutes && c.redeemed}{#if n <= 7}<Marker kind="redeemed" size={tall ? 9 : 7} />{/if}<span class="mono tn">{c.redeemed}</span>{/if}</div>{/if}
            {/each}
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
    <div class="row head"><span class="mono when">{shownBreakdown.label}</span><span class="mono">{minutes ? `${shownBreakdown.total} min used` : `${shownBreakdown.total} earned`}</span></div>
    <div class="lframe">
    <ScrollCue target={listEl} />
    <div class="list" aria-live="polite" bind:this={listEl}>
    {#each shownBreakdown.rows as row (row.name)}
      <div class="row" class:zero={!row.n}><span class="mk"><Marker kind="source" color={row.color} /></span><span class="name">{row.name}</span><b class="mono">{row.n ? (minutes ? `${row.n} min` : row.n) : "–"}</b></div>
    {/each}
    {#if minutes}
      <!-- Unlocks: the minutes they allowed (the salmon outline on the bars) and the Vouchers torn (the triangles under them). -->
      {@const u = shownBreakdown.unlocked}
      {@const r = shownBreakdown.redeemed}
      {@const o = shownBreakdown.opens}
      <div class="row" class:zero={!u && !r}><span class="mk"><Marker kind="redeemed" /></span><span class="name">Unlocked</span><b class="mono">{[u ? `${u} min` : "", r ? `${r} torn` : ""].filter(Boolean).join(" · ") || "–"}</b></div>
      <!-- Blocked opens that ended without an Unlock: a green arrow turning back. -->
      {#if o.opens}
        <div class="row" title="Opened a blocked app {o.opens} {o.opens === 1 ? 'time' : 'times'} while nothing was unlocked, and left {o.walked} of them without unlocking">
          <span class="mk"><svg class="walkmark" width="12" height="12" viewBox="0 0 12 12" aria-hidden="true"><path d="M10.4 10V6.6a2.6 2.6 0 0 0-2.6-2.6H2.2M4.6 1.4 2 4l2.6 2.6" fill="none" stroke="var(--voucher)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" /></svg></span>
          <span class="name">Walked away</span><b class="mono">{o.walked} of {o.opens}</b>
        </div>
      {/if}
    {/if}
    <!-- The gold star under a bar: the hour the Daily goal was met, or a Day that met it. -->
    {#if !minutes}<div class="row goalrow" class:zero={!shownBreakdown.goalMet}><span class="mk"><Marker kind="goal" /></span><span class="name">Daily goal</span><b class="mono">{shownBreakdown.goal}</b></div>{/if}
    {#if minutes && zoom === "day" && Array.from({ length: 24 }, (_, h) => silentAt(summaryOf(days[shown]), h)).some((m) => m >= 15)}
      <div class="row"><span class="mk"><i class="silentmark"></i></span><span class="name">Not watched</span><b class="mono">{Array.from({ length: 24 }, (_, h) => silentAt(summaryOf(days[shown]), h)).reduce((a, b) => a + b, 0)} min</b></div>
    {/if}
    {#if notes.on(days[shown] ?? "").length && zoom === "day"}
      {#each notes.on(days[shown]) as m (m.at)}
        <div class="row"><span class="mk"><i class="flagmark" class:rule={m.rule}></i></span><span class="name">{m.text}</span><b class="mono">{clockOf(m.at)}</b></div>
      {/each}
    {/if}
    {#if minutes && !shownBreakdown.rows.length}
      <div class="row none empty">{zoom !== "day" ? `No Distraction time ${zoom === "week" ? "this week" : "this month"}` : days[shown] === today.day ? "No Distraction time yet" : "No Distraction time this Day, or none kept this far back"}</div>
    {:else if !minutes && !shownBreakdown.rows.length}
      <div class="row none empty">{zoom !== "day" ? `Nothing earned ${zoom === "week" ? "this week" : "this month"}` : current && current.earned > 0 ? `${current.earned} earned; the hour-by-hour detail isn't kept this far back` : days[shown] === today.day ? "Nothing earned yet" : "Nothing earned this Day"}</div>
    {/if}
    </div>
    </div>
    <!-- Stays at the bottom of the box, however long the list is. -->
    {#if minutes && device?.measured === false}<p class="foot">Minutes need usage access on this device: turn it on in Rules, under Protection.</p>
    {:else if shownBreakdown.rows.length}<p class="foot">{zoom === "day" ? (pick === null ? "Tap a bar to see that hour" : "Tap it again for the whole Day") : periodPick === null ? "Tap a bar to see that Day" : `Tap it again for the whole ${zoom}`}</p>{/if}
  </div>
</section>

<style>
  /* A named container, so the Today button can shrink to its arrow on a narrow card. */
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
  /* One Day per screen width, snapping, with no scrollbar: the arrows and
     the header say where you are. */
  /* No overscroll containment: past the newest (or oldest) page, a further
     swipe moves the tablet's strip of cards instead. */
  .days { display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .days::-webkit-scrollbar { display: none; }
  /* Each page clips its own drawing, so nothing from a neighbour shows, and
     keeps clear space at both sides: at a fractional pixel density (the
     tablet's 1.75) a page can sit a pixel off, and the Unlock outline, which
     reaches 2 px past its bar, showed as a sliver of the page before. The
     3 px each side is wider than that outline's reach plus the pixel. */
  .day { contain: paint; box-sizing: border-box; padding-inline: 3px; flex: 0 0 100%; scroll-snap-align: start; display: flex; flex-direction: column; gap: 12px; }
  .chart { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; align-items: end; border-bottom: 1px solid #3a3f45; }
  /* Bars, dots, and hours leave a gutter on the left for the tick numbers. */
  .chart, .dots, .axis { margin-left: 16px; }
  .chart { position: relative; }
  /* Tick lines sit behind the bars (the columns come later and are positioned). */
  .tick { position: absolute; left: -16px; right: 0; border-top: 1px dashed #2c3036; pointer-events: none; }
  .tick span { position: absolute; left: 0; bottom: -5px; font-size: var(--axis-size); line-height: 1; color: var(--axis-ink); background: var(--surface); padding-right: 3px; }
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
  /* Distraction time: the minutes Unlocks allowed, as a salmon outline (Unlocks' colour everywhere)
     drawn over the bar, so time used past it shows above its top edge. */
  .allow { position: absolute; z-index: 2; left: -2px; right: -2px; bottom: 0; border: 1.5px solid var(--spend); border-top-width: 2.5px; border-bottom: 0; border-radius: 5px 5px 0 0; pointer-events: none; }
  .bar { position: relative; display: flex; flex-direction: column; gap: 1px; border-radius: 4px 4px 2px 2px; overflow: hidden; transition: height var(--t-move) var(--ease-out); }
  .bar i { min-height: 0; transition: flex-grow var(--t-move) var(--ease-out); }
  /* Hours Voucher wasn't watching (a device was silent): hatched, so a low bar there reads as unknown, not as none. */
  .col.silent::after { content: ""; position: absolute; z-index: -1; inset: 0 0 0 0; border-radius: 4px; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .09) 0 3px, transparent 3px 7px); pointer-events: none; }
  .silentmark { display: block; width: 10px; height: 10px; border-radius: 3px; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .35) 0 2px, transparent 2px 4px); }
  /* A Marker: a short flag at the top of its hour; the Marker colour for one written by hand, grey for a rule change. */
  .flag { position: absolute; top: 0; left: 50%; width: 2px; height: 14px; margin-left: -1px; background: var(--marker); border-radius: 1px; pointer-events: none; }
  .flag::after { content: ""; position: absolute; top: 0; left: 2px; width: 6px; height: 5px; background: inherit; border-radius: 0 2px 2px 0; }
  .flag.rule, .flagmark.rule { background: var(--muted); }
  .flagmark { display: block; width: 3px; height: 12px; margin-left: 3px; border-radius: 1px; background: var(--marker); }
  /* Curfew's hours: a night-coloured band behind the bars, across the gaps too. */
  .col.night::before { content: ""; position: absolute; z-index: -1; top: 0; bottom: 0; left: calc(var(--gap, 4px) / -2); right: calc(var(--gap, 4px) / -2); background: color-mix(in srgb, var(--night) 9%, transparent); pointer-events: none; }
  .tall .col.night::before { --gap: 6px; }
  .axis.hours { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; }
  .tall .axis.hours { gap: 6px; }
  .axis.hours span { display: flex; justify-content: center; white-space: nowrap; overflow: visible; }
  .dots { display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; align-items: center; gap: 2px; min-width: 0; }
  /* How many were torn, beside the triangle (alone in a month's narrow columns). */
  .tn { font-size: 9px; line-height: 1; font-weight: 700; color: var(--ink); }
  .tall .tn { font-size: 10px; }
  .col.goal .n { color: var(--goal); font-weight: 700; }
  .row.goalrow b { color: var(--goal); }
  .row.goalrow.zero b { color: var(--muted); }
  .axis { display: flex; justify-content: space-between; font-size: var(--axis-size); color: var(--axis-ink); }
  /* The picked hour's (or the whole Day's) count per source; it doubles as
     the colour key, since it names every colour on screen. */
  .legend { display: flex; flex-direction: column; padding: 4px 12px; border-radius: 12px; background: var(--raised); font-size: 13px; color: #c9cdd1; }
  .lframe { position: relative; display: flex; flex-direction: column; }
  .list { position: relative; display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 12px minmax(0, 1fr) auto; align-items: center; column-gap: 10px; min-height: 30px; border-top: 1px solid var(--divider); }
  .row.head { grid-template-columns: minmax(0, 1fr) auto; column-gap: 10px; border-top: 0; font-size: 11px; color: var(--muted); }
  .row .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row b { font-weight: 500; color: var(--ink); font-variant-numeric: tabular-nums; }
  .row.zero { color: var(--muted); } .row.zero b { color: var(--muted); }
  .when { color: var(--muted); }
  /* An empty list: the shared .empty look (theme.css), in the row's place. */
  .row.none { display: block; padding: 6px 0; }
  /* The shared .foot (theme.css), with a little room under it in the box. */
  .foot { padding: 10px 0 6px; }
  .mk { display: flex; align-items: center; }
  .walkmark { flex: none; display: block; }
  .row.zero .mk { opacity: .35; }
  .tall { gap: 14px; padding: 18px; border-radius: 18px; }
  /* On the tablet the card fills the column above the history grid, so the
     grid stays put level with the next column; the list scrolls inside
     whatever room is left, with its heading row pinned. */
  .tall { flex: 1; min-height: 0; }
  .tall .days, .tall .viewport { flex: none; }
  .tall .legend { flex: 1; min-height: 96px; }
  .tall .lframe { flex: 1; min-height: 0; }
  .tall .list { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .tall .foot { flex: none; }
  .tall .row.head { flex: none; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .day { gap: 14px; }
  .tall .dots { height: 18px; }
  .tall .n { font-size: 11px; }
</style>
