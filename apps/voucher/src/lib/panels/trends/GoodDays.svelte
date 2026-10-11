<script lang="ts">
  // Does doing one thing go with another going better? For each source, the
  // Days it earned against the Days it didn't, on the same Day and the Day
  // after: did another source earn more, were more blocked opens walked away
  // from, was the Day's longest focus stretch longer, the night after
  // longer, or the energy answer higher? A good night, a busy calendar, and
  // late Distraction are drivers too (rules below), and a focus stretch with
  // an Unlock or Distraction in the hour before it is set against stretches
  // without. Plain averages, no guessing at causes. Unlocks and Distraction
  // are never Day drivers of Voucher outcomes, and Unlocked minutes never an
  // outcome: earning is what pays for Unlocks, so those pairs would partly
  // be the Bank's own bookkeeping. For the same reason Distraction minutes
  // are an outcome only of what lies outside that economy (a good night and
  // a busy calendar), never of a source; late Distraction goes only with the
  // night after and the next Day's energy. A Day without the data (no night
  // recorded, no calendar chosen, no energy answer, no device reporting
  // Distraction, no Distraction spans) is missing, never zero. Which
  // findings show, and how sure each is, comes from lib/correlate.ts (its
  // showing rule and confidence tiers), every pair corrected together.
  // Findings are grouped by what changed, groups by how much changed in all
  // (each change in its outcome's usual Day-to-Day spread), largest first.
  //
  // One-third slot (and the phone): group boxes in two columns that each keep
  // their own height, scrolling, with a fade while more is below. Two-thirds:
  // one row a finding on a shared set of gridlines, each unit (Vouchers,
  // minutes, percent) fitted to the findings it has and labelled on its own
  // row of ticks; a hollow dot for Days without, a filled one for Days with.
  import TrendCard from "../../components/TrendCard.svelte";
  import { styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  import { correlate, MIN_N, STRETCH, type BreakDriver, type StretchDay, type Tested } from "../../correlate";
  import { curfew } from "../../curfew.svelte";
  import { clock } from "../../time";
  import { measured } from "../../notes.svelte";
  import type { DayTotal } from "../../types";

  let { history, timeZone = "UTC" }: { history: DayTotal[]; timeZone?: string } = $props();
  const fit = fitsSlot();
  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));

  // The rules for the drivers that aren't sources, each against the
  // person's own Days in the range shown, never a fixed norm.
  /** A good night: asleep at least as long as half the nights recorded (the
   *  median), so the two sides fill up equally fast and "good" is measured
   *  against your own nights, not a textbook eight hours. */
  const GOOD_NIGHT_SHARE = 1 / 2;
  /** A busy Day: calendar busy minutes among the top third of the Days with
   *  calendar data, out of the ordinary while still common enough to reach
   *  MIN_N within a few weeks. A Day with no busy minutes is never busy. */
  const BUSY_SHARE = 1 / 3;
  /** Late Distraction: at least LATE_MINUTES of Distraction from LATE_FROM
   *  (22:00 on the clock) until the Day ends. */
  const LATE_FROM = 22 * 60;
  const LATE_MINUTES = 15;

  type Unit = "vouchers" | "minutes" | "percent" | "energy";
  /** Something that changes from Day to Day: its name, color, unit, which way is better, and its value on a Day (NaN when unknown). */
  type Measure = { id: string; name: string; color: string; unit: Unit; up: boolean; note: string; value: (d: DayTotal) => number };
  /** Something that happens or doesn't, as the left label shows it: on its Day, the Day after, and (against sleep) the night after. */
  type Doer = { id: string; color: string; days: string; after: string; night: string };
  /** A Day driver: 1 on Days it happened, 0 on Days it didn't, -1 when unknown. */
  type DayDriver = { id: string; name: string; did: number[] };

  const sources = $derived([...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))]);
  /** The Day's longest focus stretch, as Before and after's "Longest focus" takes it. */
  const longest = (d: DayTotal) => (d.stretches?.length ? Math.max(...d.stretches) : NaN);
  const SLEEP = "~asleep", ENERGY = "~energy", DISTRACTED = "~distracted", GOOD_NIGHT = "~goodnight", BUSY = "~busy", LATE = "~late";
  /** The Day's Distraction minutes, every app and device together, or NaN when no device reported. */
  const distracted = (d: DayTotal) => (measured(d) ? Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) : NaN);
  const measures = $derived<Measure[]>([
    ...sources.map((id): Measure => {
      const s = styleOf(id);
      return { id, name: s.name, color: s.color, unit: "vouchers", up: true, note: "Vouchers", value: (d) => d.by_source?.[id] ?? 0 };
    }),
    { id: "~walked", name: "Walked away", color: "var(--muted)", unit: "percent", up: true, note: "% of blocked opens", value: (d) => (d.opens ? (Math.min(d.walked ?? 0, d.opens) / d.opens) * 100 : NaN) },
    { id: "~longest", name: "Longest focus stretch", color: "var(--ink)", unit: "minutes", up: true, note: "minutes", value: longest },
    { id: DISTRACTED, name: "Distraction", color: "var(--muted)", unit: "minutes", up: false, note: "minutes", value: distracted },
    // The night that led into the Day.
    { id: SLEEP, name: "Time asleep", color: "var(--sleep)", unit: "minutes", up: true, note: "minutes", value: (d) => d.sleep?.asleep ?? NaN },
    { id: ENERGY, name: "Energy", color: "var(--energy)", unit: "energy", up: true, note: "1 to 5", value: (d) => d.energy ?? NaN },
  ]);
  /** Stretch by stretch, after a break (an Unlock or Distraction in the hour before) or not; see lib/correlate.ts. */
  const lengths: Measure = { id: STRETCH, name: "Focus stretch length", color: "var(--ink)", unit: "minutes", up: true, note: "minutes", value: () => NaN };
  const doers = $derived<Doer[]>([
    ...sources.map((id): Doer => { const s = styleOf(id); return { id, color: s.color, days: `${s.short} Days`, after: `Day after ${s.short}`, night: `Night after ${s.short}` }; }),
    { id: "~unlock", color: "var(--spend)", days: "After an Unlock", after: "After an Unlock", night: "" },
    { id: "~distraction", color: "var(--muted)", days: "After Distraction", after: "After Distraction", night: "" },
    { id: GOOD_NIGHT, color: "var(--night)", days: "After a good night", after: "", night: "" },
    { id: BUSY, color: "var(--ink)", days: "Busy Days", after: "Day after a busy Day", night: "Night after a busy Day" },
    { id: LATE, color: "var(--muted)", days: "", after: "After late Distraction", night: "Late Distraction" },
  ]);
  const measureOf = $derived(new Map([...measures, lengths].map((m) => [m.id, m])));
  const doerOf = $derived(new Map(doers.map((d) => [d.id, d])));
  /** Sources that are time in an app: a session there is itself a focus stretch. Tasks, Workout, and Steps aren't. */
  const makesStretches = (id: string) => !["tasks", "workout", "steps"].includes(id);

  // Moments as minutes after the Day began (Curfew's end), on the Ledger's clock.
  const dayStart = $derived(Math.round(curfew.end * 60));
  const sinceStart = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h * 60 + m - dayStart + 1440) % 1440; };
  const span = ([a, b]: [string, string]): [number, number] => { const from = sinceStart(a); return [from, from + (Date.parse(b) - Date.parse(a)) / 60_000]; };
  /** The value that `share` of `values` are at or above. */
  const topShare = (values: number[], share: number) => [...values].sort((a, b) => a - b)[values.length - Math.ceil(values.length * share)];
  /** Minutes of Distraction from LATE_FROM to the Day's end, or NaN without spans. */
  const lateMinutes = (d: DayTotal) => {
    if (!d.distraction_spans) return NaN;
    const from = (LATE_FROM - dayStart + 1440) % 1440;
    return d.distraction_spans.map(span).reduce((t, [a, b]) => t + Math.max(0, Math.min(b, 1440) - Math.max(a, from)), 0);
  };
  const dayDrivers = $derived.by((): DayDriver[] => {
    const nights = days.flatMap((d) => (d.sleep ? [d.sleep.asleep] : []));
    const good = nights.length ? topShare(nights, GOOD_NIGHT_SHARE) : Infinity;
    const loads = days.flatMap((d) => (d.calendar ? [d.calendar.busy_minutes] : []));
    const busy = loads.length ? topShare(loads, BUSY_SHARE) : Infinity;
    return [
      ...sources.map((id) => ({ id, name: styleOf(id).name, did: days.map((d) => ((d.by_source?.[id] ?? 0) > 0 ? 1 : 0)) })),
      { id: GOOD_NIGHT, name: "Good nights", did: days.map((d) => (d.sleep ? (d.sleep.asleep >= good ? 1 : 0) : -1)) },
      { id: BUSY, name: "Busy Days", did: days.map((d) => (d.calendar ? (d.calendar.busy_minutes > 0 && d.calendar.busy_minutes >= busy ? 1 : 0) : -1)) },
      { id: LATE, name: "Late Distraction", did: days.map((d) => { const m = lateMinutes(d); return m === m ? (m >= LATE_MINUTES ? 1 : 0) : -1; }) },
    ];
  });
  /** Each Day's timed stretches against its Unlocks, and against its Distraction where every device sent spans. */
  const breaks = $derived.by((): BreakDriver[] => {
    const unlock: StretchDay[] = [], distraction: StretchDay[] = [];
    for (const d of days) {
      const stretches = (d.timed_stretches ?? []).map((s) => ({ start: sinceStart(s.start), minutes: s.minutes }));
      if (!stretches.length) continue;
      if (d.unlocks) unlock.push({ day: d.day, stretches, breaks: d.unlocks.map(span) });
      if (d.distraction_spans) distraction.push({ day: d.day, stretches, breaks: d.distraction_spans.map(span) });
    }
    return [{ id: "~unlock", days: unlock }, { id: "~distraction", days: distraction }];
  });

  /** Pairs left untested. A night belongs to the Day it leads into, so it
   *  is an outcome only of the Day before (lag 1, "Night after") and a
   *  driver only of its own Day (lag 0): each night meets each Day once. */
  function skip(driver: string, outcome: string, lag: 0 | 1): boolean {
    // Distraction minutes are what Unlocks are spent on and what earning
    // pays for, so only drivers outside that economy go with them.
    if (outcome === DISTRACTED) return !(driver === BUSY || (driver === GOOD_NIGHT && lag === 0));
    // An Anki session both makes an Anki Day and is a focus stretch, so the same Day's pair says nothing.
    if (lag === 0 && outcome === "~longest" && makesStretches(driver)) return true;
    if (outcome === SLEEP && lag === 0) return true;
    if (driver === GOOD_NIGHT) return lag === 1 || outcome === SLEEP;
    // Late Distraction only with the night after and the next Day's energy.
    if (driver === LATE) return !(lag === 1 && (outcome === SLEEP || outcome === ENERGY));
    return false;
  }

  const tested = $derived(correlate(
    days.map((d) => d.day),
    dayDrivers.map(({ id, did }) => ({ id, did })),
    measures.map((m) => ({ id: m.id, values: days.map(m.value) })),
    breaks,
    { skip },
  ));
  type Group = { outcome: Measure; findings: Tested[] };
  const groups = $derived.by((): Group[] => {
    const by = new Map<string, Tested[]>();
    for (const t of tested) if (t.shown) by.set(t.outcome, [...(by.get(t.outcome) ?? []), t]);
    const total = (list: Tested[]) => list.reduce((a, t) => a + t.effect, 0);
    return [...by]
      .sort((a, b) => total(b[1]) - total(a[1]))
      .map(([id, list]) => ({ outcome: measureOf.get(id)!, findings: list.sort((a, b) => b.effect - a.effect) }));
  });
  /** Outcomes with something to compare but no finding yet. */
  const quiet = $derived(measures.filter((m) => !groups.some((g) => g.outcome.id === m.id) && days.some((d) => !Number.isNaN(m.value(d)))));
  /** Each Day driver's Days with and without (those with data), for the empty state's meters. */
  const progress = $derived(dayDrivers.flatMap((dr) => {
    const withN = dr.did.filter((x) => x === 1).length, withoutN = dr.did.filter((x) => x === 0).length;
    return withN + withoutN ? [{ name: dr.name, color: doerOf.get(dr.id)!.color, id: dr.id, withN, withoutN }] : [];
  }));

  const key = (f: Tested) => `${f.driver}|${f.outcome}|${f.lag}`;
  const better = (f: Tested, o: Measure) => (o.up ? f.withAvg > f.withoutAvg : f.withAvg < f.withoutAvg);
  const num = (v: number, u: Unit) => (u === "vouchers" || u === "energy" ? v.toFixed(1) : `${Math.round(v)}${u === "percent" ? "%" : ""}`);
  /** The change, signed with a real minus: "+0.8", "−18 min", or "+9%". */
  const change = (f: Tested, u: Unit) => {
    const d = f.withAvg - f.withoutAvg;
    return `${d < 0 ? "−" : "+"}${num(Math.abs(d), u)}${u === "minutes" ? " min" : ""}`;
  };
  const LEVEL = ["Very low", "Low", "Medium", "High"];
  const noun = (f: Tested) => (f.per === "stretch" ? "stretches" : "Days");

  // Which layout: two columns of boxes once the card has the width, and the
  // two-thirds scale once it has the height too (a phone keeps the boxes, in
  // one column, at any height).
  let bodyH = $state(0), bodyW = $state(0);
  const twoCols = $derived(bodyW >= 440);
  const tall = $derived(fit && twoCols && bodyH > 420);

  // The two-thirds scale. Every unit spans the same number of intervals, so
  // they share one set of gridlines, but each picks its own round step and
  // start (not always 0: it's a dot plot) to fit only the findings shown,
  // with a little room so no dot sits on an edge. The number of intervals
  // (4 to 6) is whichever gives the smallest change shown the longest line.
  // Each unit's ticks sit under its first group's heading, scrolling with it.
  type Axis = { key: string; unit: Unit; name: string; lo: number; step: number; first: string };
  const PAD = 0.06;
  const NAMES: Record<Unit, string> = { vouchers: "Vouchers a Day", minutes: "Minutes", percent: "Percent", energy: "Energy, 1 to 5" };
  /** One axis per unit, as designed. "group" gives each group its own, for far longer lines when one source (Tasks) earns many times what the rest do. */
  const PER = "group" as "unit" | "group";
  /** The smallest round step (1, 2, 2.5, or 5 times a power of ten) above `raw`. */
  function stepAbove(raw: number): number {
    const p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s > raw * (1 + 1e-9)) ?? 10 * p;
  }
  /** The roundest axis of `n` intervals that holds every value with room to spare. */
  function fitAxis(values: number[], n: number): { lo: number; step: number } {
    const min = Math.min(...values), max = Math.max(...values), pad = (max - min) * PAD;
    // Start below any step that could fit and take the first that does (a
    // padded edge under zero doesn't count, since the axis stops at zero).
    for (let step = stepAbove((max - min) / n / 2); ; step = stepAbove(step)) {
      let lo = Math.max(0, Math.floor((min - pad) / step) * step);
      const spare = Math.floor((lo + n * step - max - pad) / step + 1e-9);
      if (spare < 0) continue;
      // Spare intervals go half below, half above, never under zero.
      lo = Math.max(0, lo - Math.floor(spare / 2) * step);
      return { lo, step };
    }
  }
  const scale = $derived.by(() => {
    const keyOf = (g: Group) => (PER === "unit" ? g.outcome.unit : g.outcome.id);
    const sets = new Map<string, Group[]>();
    for (const g of groups) sets.set(keyOf(g), [...(sets.get(keyOf(g)) ?? []), g]);
    let best = { n: 5, axes: [] as Axis[], low: -1, mean: -1 };
    for (const n of [5, 4, 6]) {
      const axes = [...sets].map(([key, gs]): Axis => {
        const fs = gs.flatMap((g) => g.findings);
        return { key, unit: gs[0].outcome.unit, name: NAMES[gs[0].outcome.unit], first: gs[0].outcome.id, ...fitAxis(fs.flatMap((f) => [f.withAvg, f.withoutAvg]), n) };
      });
      // Each axis's smallest change shown, as a share of the track: the
      // smallest of those as long as can be, then the rest on average.
      const shares = axes.map((a) => Math.min(...sets.get(a.key)!.flatMap((g) => g.findings).map((f) => Math.abs(f.withAvg - f.withoutAvg))) / (n * a.step));
      const low = Math.min(...shares), mean = shares.reduce((x, y) => x + y, 0) / shares.length;
      if (low > best.low * 1.05 || (low > best.low * 0.95 && mean > best.mean)) best = { n, axes, low, mean };
    }
    return { ...best, of: (g: Group) => best.axes.find((a) => a.key === keyOf(g))! };
  });
  const ticks = (a: Axis) => {
    const places = (String(+a.step.toPrecision(3)).split(".")[1] ?? "").length;
    return Array.from({ length: scale.n + 1 }, (_, i) => String(+(a.lo + a.step * i).toFixed(places)));
  };
  /** The axis whose ticks sit under this group's heading, if it is that axis's first group. */
  const startsAxis = (g: Group) => scale.axes.find((a) => a.first === g.outcome.id);

  // Value labels above the dots. JetBrains Mono is 0.6em a letter, so a
  // label's width is known without measuring. Labels that would touch are
  // pushed apart, each away from the other; none leaves the track.
  const LABEL_PX = 10, GAP = 4;
  let trackW = $state(0);
  const wide = (s: string) => s.length * 0.6 * LABEL_PX;
  function labels(xa: number, ta: string, xb: number, tb: string): [number, number] {
    const W = trackW, wa = wide(ta), wb = wide(tb);
    const flip = xb < xa;
    const [x1, w1, x2, w2] = flip ? [xb, wb, xa, wa] : [xa, wa, xb, wb];
    let l1 = x1 - w1 / 2, l2 = x2 - w2 / 2;
    if (l1 + w1 + GAP > l2) { const mid = (x1 + x2) / 2; l1 = mid - GAP / 2 - w1; l2 = mid + GAP / 2; }
    l1 = Math.max(0, Math.min(l1, W - w1 - GAP - w2));
    l2 = Math.min(Math.max(l2, l1 + w1 + GAP), W - w2);
    return flip ? [l2, l1] : [l1, l2];
  }
  const xOf = (v: number, a: Axis) => ((v - a.lo) / (scale.n * a.step)) * trackW;

  // The fade at the bottom shows only while more is below.
  let scroller = $state<HTMLElement>();
  let more = $state(false);
  $effect(() => {
    // Reading the groups re-checks when they change.
    if (!scroller || !groups.length) return;
    const el = scroller;
    const check = () => (more = el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  });
</script>

<!-- Confidence, like a signal icon: one bar Low, two Medium, three High. -->
{#snippet bars(f: Tested)}
  <span class="conf" role="img" aria-label="{LEVEL[f.confidence]} confidence">
    <i class:on={f.confidence >= 1} style="height: 5px"></i><i class:on={f.confidence >= 2} style="height: 8px"></i><i class:on={f.confidence >= 3} style="height: 11px"></i>
  </span>
{/snippet}

{#snippet pill(f: Tested, o: Measure)}
  <b class="pill" class:good={better(f, o)}>{change(f, o.unit)}</b>
{/snippet}

{#snippet split(f: Tested, w: number)}
  {@const share = Math.round((w - 2) * (f.withoutN / (f.withN + f.withoutN)))}
  <span class="split" aria-label="{f.withoutN} {noun(f)} without, {f.withN} with">
    <span>{f.withoutN}</span>
    <span class="sbar" style="width: {w}px"><i class="without" style="width: {Math.max(3, share)}px"></i><i class="with"></i></span>
    <span>{f.withN} {noun(f)}</span>
  </span>
{/snippet}

{#snippet arrow(good: boolean)}
  <svg class="arrow" class:worse={!good} width="16" height="8" viewBox="0 0 16 8" aria-hidden="true"><path d="M1 4 H13" /><path d="M10 1 L14.5 4 L10 7" fill="none" /></svg>
{/snippet}

{#snippet who(f: Tested)}
  {@const d = doerOf.get(f.driver)!}
  <span class="who"><i style="background: {d.color}"></i><span>{!f.lag ? d.days : f.outcome === SLEEP ? d.night : d.after}</span></span>
{/snippet}

<!-- The key's two-colored marks: crimson for worse, green for better, a thin slash where they meet. -->
{#snippet both(head: boolean)}
  <svg class="both" width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
    <path class="w" d="M1 5 H10" /><path class="g" d="M12 5 H{head ? 19 : 21}" />
    {#if head}<path class="g head" d="M16.5 2 L20.5 5 L16.5 8" />{/if}
    <path class="slash" d="M10.2 9 L12.2 1" />
  </svg>
{/snippet}

{#snippet glyph()}
  <span class="conf" aria-hidden="true"><i class="on" style="height: 5px"></i><i class="on" style="height: 8px"></i><i style="height: 11px"></i></span>
{/snippet}

<!-- One unit's row of ticks: its name in the label column, a number on each gridline. -->
{#snippet axis(a: Axis)}
  <div class="axis">
    <span class="name">{a.name}</span>
    <span class="ticks">{#each ticks(a) as t, i (i)}<span style="left: {(i / scale.n) * 100}%" class:first={i === 0} class:last={i === scale.n}>{t}</span>{/each}</span>
  </div>
{/snippet}

<TrendCard title="What goes with a good Day">
  <div class="body" class:fit bind:clientHeight={bodyH} bind:clientWidth={bodyW}>
    {#if !groups.length}
      {@const short = progress.filter((p) => Math.min(p.withN, p.withoutN) < MIN_N)}
      {#if short.length || !progress.length}
        <p class="empty">Needs more Days. Each activity needs {MIN_N} Days with it and {MIN_N} without before this can compare them.</p>
        {#if short.length}
          <div class="meters" class:fit>
            {#each short as p (p.id)}
              {@const without = p.withoutN < p.withN}
              {@const n = Math.min(p.withN, p.withoutN)}
              <div class="meter">
                <span class="who"><i style="background: {p.color}"></i><span>{p.name}</span></span>
                <span class="bar"><i style="width: {(n / MIN_N) * 100}%; background: {p.color}"></i></span>
                <span class="count">{n} of {MIN_N} Days {without ? "without" : "with"}</span>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="empty">Nothing stands out yet: no activity goes with a change in anything else that is both big enough and steady enough to show.</p>
      {/if}
    {:else if !tall}
      <div class="scroller" class:fit class:more bind:this={scroller}>
        <div class="boxes" class:two={twoCols}>
          {#each groups as g (g.outcome.id)}
            <section class="box">
              <h3><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.unit === "vouchers" ? "Vouchers a Day" : g.outcome.note}</span></h3>
              {#each g.findings as f (key(f))}
                {@const good = better(f, g.outcome)}
                <div class="finding">
                  <div class="line1">{@render who(f)}<span class="end">{@render pill(f, g.outcome)}{@render bars(f)}</span></div>
                  <div class="line2"><span class="vals"><span class="was">{num(f.withoutAvg, g.outcome.unit)}</span>{@render arrow(good)}<span>{num(f.withAvg, g.outcome.unit)}</span></span>{@render split(f, 60)}</div>
                </div>
              {/each}
            </section>
          {/each}
        </div>
        <p class="aside">Correlations, not causes.</p>
      </div>
    {:else}
      <div class="mid">
        <div class="grid" aria-hidden="true" bind:clientWidth={trackW}>{#each { length: scale.n + 1 } as _, i (i)}<i style="left: {(i / scale.n) * 100}%"></i>{/each}</div>
        <div class="rows" class:more bind:this={scroller}>
          {#each groups as g (g.outcome.id)}
            {@const ax = scale.of(g)}
            {@const own = startsAxis(g)}
            <h3 class="ghead"><span><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.note}</span></span></h3>
            {#if own}<div class="inline">{@render axis(own)}</div>{/if}
            {#each g.findings as f (key(f))}
              {@const u = g.outcome.unit}
              {@const a = xOf(f.withoutAvg, ax)}
              {@const b = xOf(f.withAvg, ax)}
              {@const ta = num(f.withoutAvg, u)}
              {@const tb = `${num(f.withAvg, u)}${u === "minutes" ? " min" : ""}`}
              {@const at = labels(a, ta, b, tb)}
              {@const good = better(f, g.outcome)}
              {@const color = doerOf.get(f.driver)!.color}
              <div class="row">
                <div class="left">{@render who(f)}{@render split(f, 50)}</div>
                <div class="track">
                  <span class="label was" style="left: {at[0]}px">{ta}</span>
                  <span class="label" style="left: {at[1]}px">{tb}</span>
                  <span class="line" class:worse={!good} style="left: {Math.min(a, b)}px; width: {Math.abs(b - a)}px"></span>
                  <span class="dot hollow" style="left: {a}px; border-color: {color}"></span>
                  <span class="dot" style="left: {b}px; background: {color}"></span>
                </div>
                <span class="end">{@render pill(f, g.outcome)}{@render bars(f)}</span>
              </div>
            {/each}
          {/each}
        </div>
      </div>
      <div class="key">
        <span><i class="ring"></i>Days without</span>
        <span><i class="disc"></i>Days with</span>
        <span>worse {@render both(false)} better</span>
        <span>{@render glyph()}confidence</span>
      </div>
      {#if quiet.length}
        {@const vouchersOnly = quiet.every((m) => m.unit === "vouchers")}
        <p class="quiet">Nothing stands out yet for {#each quiet as m, i (m.id)}{i ? (i === quiet.length - 1 ? (quiet.length > 2 ? ", or " : " or ") : ", ") : ""}<b><i style="background: {m.color}"></i>{m.name}</b>{/each}{vouchersOnly ? " Vouchers" : ""}</p>
      {/if}
    {/if}
  </div>
  {#snippet foot()}
    {#if tall}From {days.length} Days. Correlations, not causes.
    {:else}<span class="keyline"><span>Without {@render both(true)} with</span><span>worse {@render both(false)} better</span><span>{@render glyph()}confidence</span><span class="nb">Correlations, not causes.</span></span>{/if}
  {/snippet}
</TrendCard>

<style>
  /* The two-thirds columns: driver labels, the scale, then the pill and bars. */
  .body { --label-col: 158px; --end-col: 82px; --col-gap: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .body.fit { flex: 1; min-height: 0; }

  /* A driver: its dot and "Anki Days" or "Day after Workout". */
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }
  .who i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* The change, one look at every confidence (the bars say how sure): its
     direction's color on a tint of it, green when better and crimson when
     worse. Crimson text is lib/about.ts's crimson text tint lifted a little
     (#ef5e76), so it reads at 4.5:1 on the tint over a box (4.7:1) as well
     as on the card (5.2:1). */
  .pill { font: 700 11px/1 var(--mono); padding: 3px 5px; border-radius: 6px; white-space: nowrap; color: #ef5e76; background: color-mix(in oklab, var(--worse) 13%, transparent); }
  .pill.good { color: var(--voucher); background: color-mix(in oklab, var(--voucher) 13%, transparent); }

  /* Confidence: three bars like a signal icon. */
  .conf { flex: none; display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; }
  .conf i { display: block; width: 3px; border-radius: 1px; background: var(--line); }
  .conf i.on { background: var(--muted); }
  .end { display: inline-flex; align-items: center; justify-self: end; gap: 6px; }

  /* Days without (hollow) and with (filled), as one bar split by count. */
  .split { display: inline-flex; align-items: center; gap: 4px; font: 500 9px var(--mono); color: var(--muted); white-space: nowrap; }
  .sbar { display: flex; gap: 2px; height: 5px; }
  .sbar i { display: block; height: 100%; border-radius: 1.5px; }
  .sbar .without { flex: none; border: 1px solid var(--axis-ink); }
  .sbar .with { flex: 1; min-width: 3px; background: var(--muted); }

  .arrow { flex: none; }
  .arrow path { stroke: var(--voucher); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  /* Crimson is dim on the card (2.7:1), so its strokes are thicker. */
  .arrow.worse path { stroke: var(--worse); stroke-width: 2.4; }

  /* One-third: boxes in two columns that each keep their own height. */
  .scroller.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .scroller.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent); }
  .boxes { display: flex; flex-direction: column; gap: 8px; }
  .boxes.two { display: block; columns: 2; column-gap: 8px; }
  .boxes.two .box { break-inside: avoid; margin-bottom: 8px; }
  .box { display: flex; flex-direction: column; gap: 7px; padding: 7px 10px 8px; border-radius: 10px; background: var(--raised); }
  h3 { margin: 0; display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 13px; font-weight: 700; color: var(--ink); }
  h3 i { flex: none; align-self: center; width: 10.5px; height: 10.5px; border-radius: 50%; }
  h3 b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .unit { flex: none; font: 500 9px var(--mono); color: var(--muted); white-space: nowrap; }
  .finding { display: flex; flex-direction: column; gap: 3px; }
  .line1, .line2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .vals { display: flex; align-items: center; gap: 5px; font: 600 11px var(--mono); color: var(--ink); white-space: nowrap; }
  .was { color: var(--muted); }

  /* Two-thirds: labels, the scale, then the pill and bars. */
  .axis, .row { display: grid; grid-template-columns: var(--label-col) minmax(0, 1fr) var(--end-col); column-gap: var(--col-gap); }
  .axis { align-items: center; height: 14px; }
  .axis .name { font: 600 9px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ticks { position: relative; height: 12px; }
  .ticks span { position: absolute; top: 0; transform: translateX(-50%); font: 500 var(--axis-size)/12px var(--mono); color: var(--axis-ink); white-space: nowrap; }
  .ticks .first { transform: none; }
  .ticks .last { transform: translateX(-100%); }
  .mid { flex: 1; min-height: 0; position: relative; border-bottom: 1px solid var(--divider); }
  /* The gridlines, drawn once behind every row and pinned while they scroll. */
  .grid { position: absolute; inset: 0 calc(var(--end-col) + var(--col-gap)) 0 calc(var(--label-col) + var(--col-gap)); pointer-events: none; }
  .grid i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .grid i:last-child { transform: translateX(-1px); }
  .rows { position: absolute; inset: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  /* Only the rows fade; the gridlines behind stay solid. */
  .rows.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent); }
  .ghead { flex: none; padding: 8px 0 2px; border-top: 1px solid var(--divider); font-size: 14px; }
  .ghead:first-child { border-top-color: transparent; padding-top: 4px; }
  /* A card-colored backing, so gridlines don't run through the letters. */
  .ghead > span { display: inline-flex; align-items: baseline; gap: 7px; min-width: 0; max-width: 100%; padding-right: 6px; background: var(--surface); }
  .ghead .unit { font-size: 10px; }
  /* Rows share out spare height when they fit; past that they scroll. */
  .row { flex: 1 0 auto; min-height: 44px; align-items: stretch; }
  .left { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
  .left .who { font-size: 13px; color: var(--ink); }
  .track { position: relative; }
  .track > span { position: absolute; }
  .dot { top: calc(50% + 6px); width: 11px; height: 11px; border-radius: 50%; transform: translate(-50%, -50%); }
  .dot.hollow { width: 10px; height: 10px; border: 1.8px solid; background: var(--surface); }
  .line { top: calc(50% + 5px); height: 2px; background: var(--voucher); }
  .line.worse { top: calc(50% + 4.5px); height: 3px; background: var(--worse); }
  .label { bottom: calc(50% - 6px + 8px); font: 600 10px/12px var(--mono); color: var(--ink); white-space: nowrap; }
  .label.was { color: var(--muted); }
  .row .end { align-self: center; }
  /* Ticks under a heading, backed so the gridlines don't run through them. */
  .inline { flex: none; padding-top: 2px; }
  .inline .ticks span { padding: 0 2px; background: var(--surface); }
  .inline .ticks .first { margin-left: -2px; }
  .inline .ticks .last { margin-left: 2px; }

  .key { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .key > span { display: inline-flex; align-items: center; gap: 6px; }
  .key .ring { width: 9px; height: 9px; border-radius: 50%; border: 1.6px solid var(--muted); }
  .key .disc { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
  .both { flex: none; overflow: visible; }
  .both path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .both .w { stroke: var(--worse); }
  .both .g { stroke: var(--voucher); stroke-width: 2; }
  .both .head { stroke-width: 1.6; }
  .both .slash { stroke: var(--ink); stroke-width: 1.2; }

  .quiet { flex: none; margin: 0; padding: 7px 12px; border: 1.5px dashed var(--line); border-radius: 10px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .quiet b { color: var(--ink); }
  .quiet b i { display: inline-block; width: 7px; height: 7px; margin: 0 5px 1px 2px; border-radius: 50%; vertical-align: middle; }

  /* The one-third foot doubles as the key. */
  .keyline { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; font-size: 12px; }
  .keyline > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .keyline .nb { margin-left: auto; }
  /* On a narrow card (the phone) the key fills the foot's one line, so the
     caveat closes the list instead. */
  .aside { display: none; margin: 0; font-size: 12px; color: var(--muted); }
  @container card (max-width: 470px) {
    .keyline .nb { display: none; }
    .aside { display: block; }
  }

  /* Needs more Days: how far each source is from 8 Days each way. */
  .meters { display: flex; flex-direction: column; gap: 8px; }
  .meters.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .meter { display: grid; grid-template-columns: minmax(0, 120px) minmax(40px, 1fr) auto; align-items: center; gap: 10px; }
  .meter .who { color: var(--ink); font-size: 13px; }
  .count { font: 500 11px var(--mono); color: var(--muted); white-space: nowrap; }
</style>
