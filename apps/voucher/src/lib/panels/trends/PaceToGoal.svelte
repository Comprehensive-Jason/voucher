<script lang="ts">
  // Am I ahead of my usual self? The picked Day's Vouchers (today's, unless
  // another card picked a Day) as a rising line over the middle half of the
  // 30 Days before it (by the end of each hour), with the Daily goal across
  // and a tick at your usual time for reaching it. The chart says it all in
  // labels: the dot's count so far, a whisker through it with the usual range
  // at that hour, and the usual goal time on the gold tick. The Day runs from
  // 06:00; hours after midnight count as 24 to 29.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import MarkerLines from "../../components/MarkerLines.svelte";
  import Legend from "../../components/Legend.svelte";
  import { clock, dayLabel } from "../../time";
  import { clockOfHours, median, quantile } from "../../trends";
  import type { DaySummary, DayTotal } from "../../types";
  import { ledger } from "../../api";
  import { inCurfew } from "../../curfew.svelte";
  import { selection } from "../../selection.svelte";
  import { markerKeys, notes } from "../../notes.svelte";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  let { history, today, timeZone }: { history: DayTotal[]; today: DaySummary; timeZone: string } = $props();

  const START = 6, END = 30;
  /** Hours since midnight of the Day's start, after-midnight hours past 24. */
  const hoursAt = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h < START ? h + 24 : h) + m / 60; };
  // The picked Day: today's live summary, or that Day's fetched from the Ledger.
  const chosen = $derived(selection.day ?? today.day);
  const isToday = $derived(chosen === today.day);
  let fetched = $state<DaySummary | null>(null);
  $effect(() => {
    const day = chosen;
    if (day === today.day) return;
    ledger<DaySummary>("GET", `/day?date=${day}`).then((d) => { if (chosen === day) fetched = d; }).catch(() => {});
  });
  const summary = $derived(isToday ? today : fetched?.day === chosen ? fetched : null);
  const goal = $derived(summary?.goal ?? today.goal);

  // The Day's Vouchers in the order they came.
  const todayTimes = $derived((summary?.log ?? []).filter((e) => e.kind === "earned").map((e) => hoursAt(e.at)).sort((a, b) => a - b));
  // Each past Day's running total at the end of each hour, and when its k-th Voucher came (spread evenly within its hour).
  const past = $derived(history.filter((d) => d.day < chosen && d.hours && d.hours.length).slice(-30));
  const perDay = $derived(past.map((d) => {
    const counts = Array.from({ length: END - START }, (_, i) => d.hours![(START + i) % 24]);
    const cum: number[] = [];
    counts.reduce((a, c, i) => (cum[i] = a + c), 0);
    const times: number[] = [];
    counts.forEach((c, i) => { for (let j = 1; j <= c; j++) times.push(START + i + j / c); });
    return { cum, times };
  }));
  const band = $derived(Array.from({ length: END - START }, (_, i) => {
    const vals = perDay.map((d) => d.cum[i]);
    return { h: START + i + 1, lo: quantile(vals, 0.25), hi: quantile(vals, 0.75) };
  }));
  /** Your usual time for the k-th Voucher: the middle of the Days that reached it. */
  const usualTime = (k: number) => median(perDay.map((d) => d.times[k - 1]).filter((t) => t !== undefined));
  const usualGoal = $derived(usualTime(goal));
  // Today runs up to now; a past Day to its end.
  const nowH = $derived(isToday ? hoursAt(new Date().toISOString()) : END);
  const soFar = $derived(todayTimes.filter((t) => t <= nowH).length);
  /** The usual band at now, read off the drawn band between its hour ends. */
  const usualNow = $derived.by(() => {
    const pts = [{ h: START, lo: 0, hi: 0 }, ...band];
    const j = pts.findIndex((b) => b.h >= nowH);
    if (j < 0) return pts.at(-1)!;
    if (j === 0) return pts[0];
    const a = pts[j - 1], b = pts[j], f = (nowH - a.h) / (b.h - a.h);
    return { h: nowH, lo: a.lo + (b.lo - a.lo) * f, hi: a.hi + (b.hi - a.hi) * f };
  });

  const W = 600, x1 = 592, y1 = 10;
  const H = $derived(fit ? drawHeight(pw, ph, 240) : 240);
  const y0 = $derived(H - 28);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  const top = $derived(Math.max(goal + 2, ...band.map((b) => b.hi), todayTimes.length) || 1);
  $effect(() => { notes.load(); });
  /** The chosen Day's Markers, at their hour. */
  const marks = $derived(notes.on(chosen).map((m) => ({ ...m, h: hoursAt(m.at) })));
  const xAt = (h: number) => x0 + ((h - START) / (END - START)) * (x1 - x0);
  const yAt = (v: number) => y0 - (v / top) * (y0 - y1);
  /** Vouchers up the side, in a round step that gives at most five lines. */
  const ticks = $derived.by(() => {
    const step = [1, 2, 5, 10, 20, 50].find((s) => top / s <= 4) ?? 100;
    return Array.from({ length: Math.floor(top / step) + 1 }, (_, i) => i * step);
  });
  // Room at the left for the axis's name and its widest number, held in
  // screen pixels so a narrow card doesn't crowd them together.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * Math.max(...ticks.map((t) => String(t).length)))));
  const bandPath = $derived(band.length ? `M${xAt(START)},${yAt(0)}` + band.map((b) => `L${xAt(b.h)},${yAt(b.hi)}`).join("") + [...band].reverse().map((b) => `L${xAt(b.h)},${yAt(b.lo)}`).join("") + `L${xAt(START)},${yAt(0)}Z` : "");
  const todayPath = $derived.by(() => {
    let d = `M${xAt(START)},${yAt(0)}`, n = 0;
    for (const t of todayTimes.filter((t) => t <= nowH)) { d += `L${xAt(t)},${yAt(n)}L${xAt(t)},${yAt(++n)}`; }
    return d + `L${xAt(Math.min(nowH, END))},${yAt(n)}`;
  });

  // Where the labels go. Sizes are screen px times k, like the axis text, so
  // each label is a box we can test against the others, the goal line, and
  // (when the labels hang left of now) the Day's own line.
  type Box = { l: number; r: number; t: number; b: number };
  /** The box of a label: `n` characters of `px` mono text on baseline `y`. */
  const boxOf = (x: number, y: number, n: number, px: number, anchor: "start" | "middle" | "end"): Box => {
    const w = n * px * 0.62 * k, l = anchor === "start" ? x : anchor === "end" ? x - w : x - w / 2;
    return { l, r: l + w, t: y - px * 0.74 * k, b: y + px * 0.2 * k };
  };
  const hits = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const inside = (a: Box) => a.t >= y1 - 2 * k && a.b <= y0 - 1 * k && a.r <= W && a.l >= x0;
  const nowX = $derived(xAt(Math.min(nowH, END)));
  const nowY = $derived(yAt(soFar));
  const goalY = $derived(yAt(goal));
  const lo = $derived(Math.round(usualNow.lo)), hi = $derived(Math.round(usualNow.hi));
  const rangeText = $derived(lo === hi ? `usual ${lo}` : `usual ${lo} to ${hi}`);
  const goalText = $derived(`goal ${goal}`);
  const goalBox = $derived(boxOf(x0 + 4 * k, goalY - 5 * k, goalText.length, 9, "start"));
  const goalLine = $derived<Box>({ l: x0, r: x1, t: goalY - 1.5 * k, b: goalY + 1.5 * k });
  // Labels hang right of now, in the Day's empty future, when they fit;
  // otherwise (late at night, or a past Day ending at the right edge) left.
  const right = $derived(isToday && W - nowX >= (9 + 0.62 * 9 * Math.max(rangeText.length, String(soFar).length + 1)) * k);
  /** Where the Day's line runs, as a box, over the hours a left-hanging label spans. */
  const lineBox = (l: number): Box => {
    const h = START + ((l - x0) / (x1 - x0)) * (END - START);
    return { l, r: nowX, t: nowY - 1.5, b: yAt(todayTimes.filter((t) => t <= h).length) + 1.5 };
  };
  const count = $derived.by(() => {
    const n = String(soFar).length;
    // Right of now it sits level with the dot, kept above the hour labels.
    const ry = Math.min(nowY + 3.5 * k, y0 - 3 * k);
    if (right) return { x: nowX + 8 * k, y: ry, anchor: "start" as const, box: boxOf(nowX + 8 * k, ry, n, 10, "start") };
    // Left of now the line comes in level with the dot, so the count sits above it.
    const x = nowX - 3 * k;
    for (const y of [nowY - 7 * k, nowY + 15 * k]) {
      const box = boxOf(x, y, n, 10, "end");
      if (inside(box) && !hits(box, goalLine) && !hits(box, goalBox)) return { x, y, anchor: "end" as const, box };
    }
    return { x, y: nowY - 7 * k, anchor: "end" as const, box: boxOf(x, nowY - 7 * k, n, 10, "end") };
  });
  const range = $derived.by(() => {
    const yHi = yAt(usualNow.hi), yLo = yAt(usualNow.lo), mid = (yHi + yLo) / 2;
    const far = nowY - yHi > yLo - nowY ? yHi : yLo, near = far === yHi ? yLo : yHi;
    const tries = [nowY < yHi || nowY > yLo ? mid : far, far, near, mid, nowY - 13 * k, nowY + 13 * k];
    const x = right ? nowX + 8 * k : nowX - 8 * k, anchor = right ? "start" as const : "end" as const;
    const at = (c: number) => ({ x, y: c + 3.2 * k, anchor, box: boxOf(x, c + 3.2 * k, rangeText.length, 9, anchor) });
    for (const c of tries) {
      const p = at(c);
      if (inside(p.box) && !hits(p.box, count.box) && !hits(p.box, goalLine) && !hits(p.box, goalBox) && (right || !hits(p.box, lineBox(p.box.l)))) return p;
    }
    return at(tries[0]);
  });
  /** The usual goal time on its tick: above the goal line, or below where that's taken. */
  const goalTime = $derived.by(() => {
    if (Number.isNaN(usualGoal)) return null;
    const x = Math.min(Math.max(xAt(usualGoal), x0 + 15 * k), W - 15 * k), text = clockOfHours(Math.round(usualGoal * 60) / 60);
    for (const y of [goalY - 7 * k, goalY + 14 * k]) {
      const box = boxOf(x, y, text.length, 9, "middle");
      if (!hits(box, goalBox) && !hits(box, count.box) && !hits(box, range.box) && box.t >= y1 - 4 * k) return { x, y, text };
    }
    return null;
  });
</script>

<TrendCard title="Pace to goal" date={{ day: chosen, today: today.day, oldest: history[0]?.day, onpick: (d) => selection.set("pace", { day: d === today.day ? null : d, picked: false }) }}>
  {#if perDay.length < 3}
    <p class="empty">A few Days of history draw your usual pace.</p>
  {:else}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
    <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Today's Vouchers against your usual Day">
      <!-- Curfew's hours, in the night colour: earning still counts there. -->
      {#each Array(END - START) as _, i}{#if inCurfew((START + i) % 24)}<rect x={xAt(START + i)} y={y1} width={xAt(START + i + 1) - xAt(START + i) + 0.5} height={y0 - y1} style="fill: var(--night-band)" />{/if}{/each}
      <ChartAxis {ticks} {yAt} {x0} {x1} {y0} {y1} title="Vouchers" />
      <path d={bandPath} fill="var(--voucher)" fill-opacity=".16" />
      <MarkerLines marks={marks.map((m) => ({ x: xAt(m.h), text: m.text, rule: m.rule }))} {y0} {y1} />
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" />
      <text class="tag" x={x0 + 4 * k} y={goalY - 5 * k} style="fill: var(--goal)">{goalText}</text>
      {#if !Number.isNaN(usualGoal)}<line x1={xAt(usualGoal)} x2={xAt(usualGoal)} y1={goalY - 5 * k} y2={goalY + 5 * k} stroke="var(--goal)" stroke-width="2" />{/if}
      <!-- The usual range at now: a whisker through the dot's hour. -->
      <line x1={nowX} x2={nowX} y1={yAt(usualNow.hi)} y2={yAt(usualNow.lo)} stroke="var(--voucher)" stroke-opacity=".7" stroke-width="1.5" />
      {#each [usualNow.hi, usualNow.lo] as v}<line x1={nowX - 4 * k} x2={nowX + 4 * k} y1={yAt(v)} y2={yAt(v)} stroke="var(--voucher)" stroke-opacity=".7" stroke-width="1.5" />{/each}
      <path d={todayPath} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      <circle cx={nowX} cy={nowY} r="4.5" fill="var(--voucher)" />
      <text class="tag big" x={count.x} y={count.y} text-anchor={count.anchor} style="fill: var(--voucher)">{soFar}</text>
      <text class="tag" x={range.x} y={range.y} text-anchor={range.anchor} style="fill: var(--voucher); opacity: .8">{rangeText}</text>
      {#if goalTime}<text class="tag" x={goalTime.x} y={goalTime.y} text-anchor="middle" style="fill: var(--goal)">{goalTime.text}</text>{/if}
      <!-- Every third hour across the whole Day, as HourAxis draws them: Curfew's in the night colour. -->
      {#each [6, 9, 12, 15, 18, 21, 24, 27] as h}<text x={xAt(h)} y={H - 6} text-anchor="middle" style={inCurfew(h % 24) ? "fill: var(--night)" : undefined}>{String(h % 24).padStart(2, "0")}</text>{/each}
    </svg>
    </div>
    <Legend items={[
      { kind: "line", color: "var(--voucher)", label: dayLabel(chosen, today.day) },
      { kind: "box", color: "color-mix(in srgb, var(--voucher) 16%, transparent)", label: `Your usual Day (middle half of the last ${perDay.length})` },
      ...markerKeys(marks),
    ]} />
  {/if}
</TrendCard>


<style>
  /* Labels on the chart: a halo in the card's colour keeps them readable
     where they cross a grid line or the band's edge. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.big { font-size: calc(10px * var(--k, 1)); font-weight: 700; }
</style>
