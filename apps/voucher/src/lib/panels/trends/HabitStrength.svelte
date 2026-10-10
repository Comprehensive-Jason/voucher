<script lang="ts">
  // Is meeting my goal becoming a habit? Loop Habit Tracker's idea: a score
  // that rises with each goal Day and fades slowly with misses, so one missed
  // Day dents it rather than wiping it out the way a streak does. Each Day
  // moves it 1/19th of the way toward 100% (goal met) or 0% (missed), which
  // halves a gap in about 13 Days. Ticks along the bottom mark goal Days.
  // The line ends in today's value, and a faint ring two weeks back carries
  // that Day's, so the comparison reads off the chart.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import { monthOf } from "../../trends";
  import type { DayTotal } from "../../types";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  let { history }: { history: DayTotal[] } = $props();
  const STEP = 1 - Math.pow(0.5, 1 / 13);
  // Finished Days only; today joins once it's over.
  const days = $derived(history.slice(0, -1));
  const scores = $derived.by(() => {
    let s = 0;
    return days.map((d) => (s += ((d.goal_met ? 1 : 0) - s) * STEP));
  });
  const now = $derived(scores.at(-1) ?? 0);
  const then = $derived(scores.at(-15) ?? 0);

  const W = 600, y1 = 8;
  const H = $derived(fit ? drawHeight(pw, ph, 170) : 170);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  // Room at the left for the axis's name and "100%", and below for the goal
  // ticks and the months, held in screen pixels so a narrow card doesn't
  // crowd them together.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * 4)));
  const pct = (v: number) => `${Math.round(v * 100)}%`;
  // And at the right for today's value (bold 9px figures, about 5.6px each).
  const x1 = $derived(W - Math.max(8, Math.round(k * (7 + 5.6 * pct(now).length))));
  const y0 = $derived(H - Math.round(18 + 8 * k));
  const xAt = (i: number) => x0 + (days.length > 1 ? (i / (days.length - 1)) * (x1 - x0) : 0);
  const yAt = (v: number) => y0 - v * (y0 - y1);
  /** A label where each month begins, skipping any that would run into the
   *  one before (three letters and a space): years of history thin them out. */
  const months = $derived.by(() => {
    const kept: { d: DayTotal; i: number }[] = [];
    days.forEach((d, i) => { if (d.day.slice(8) === "01" && i > 2 && (!kept.length || xAt(i) - xAt(kept.at(-1)!.i) >= k * 26.4)) kept.push({ d, i }); });
    return kept;
  });
  /** Two weeks back: a ring on the line, and its value just clear of the
   *  line, above or below, centred on the ring or hanging off either side of
   *  it: whichever spot inside the plot sits closest to the ring. On a narrow
   *  chart that can be well above it, over a peak, so a faint leader then
   *  ties the value to its ring. */
  const back = $derived.by(() => {
    if (scores.length < 15) return null;
    const i = scores.length - 15, x = xAt(i), y = yAt(then), text = `${pct(then)} 2 wk ago`, w = text.length * 5.6 * k;
    const spots = [x - w / 2, x - 2 * k, x + 2 * k - w].map((l) => Math.min(Math.max(l, x0 + 2 * k), x1 - w)).flatMap((l) => {
      const ys = scores.map((v, j) => [xAt(j), yAt(v)]).filter(([xj]) => xj >= l - 4 && xj <= l + w + 4).map(([, yj]) => yj);
      return [Math.min(...ys, y - 3 * k) - 4 * k, Math.max(...ys, y + 3 * k) + 11 * k].map((ly) => ({ l, ly }));
    }).filter((p) => p.ly - 6.7 * k >= y1 - 2 * k && p.ly <= y0 - 1 * k);
    const off = (p: { l: number; ly: number }) => Math.abs(p.ly - 3.2 * k - y) + Math.max(0, p.l - x, x - (p.l + w)) / 2;
    const best = spots.sort((p, q) => off(p) - off(q))[0] ?? { l: Math.min(Math.max(x - w / 2, x0), x1 - w), ly: y - 7 * k };
    const lx = Math.min(Math.max(x, best.l), best.l + w), above = best.ly < y;
    const lead = Math.abs(best.ly - 3.2 * k - y) > 12 * k ? { x: lx, from: y + (above ? -4 : 4) * k, to: best.ly + (above ? 3 : -9) * k } : null;
    return { x, y, lx: best.l, ly: best.ly, text, lead };
  });
</script>

<TrendCard title="Habit strength">
  <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
  <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Habit strength over time">
    <ChartAxis ticks={[0, 0.5, 1]} {yAt} {x0} {x1} {y0} {y1} title="Strength" format={(v) => `${v * 100}%`} />
    {#each days as d, i}{#if d.goal_met}<rect x={xAt(i) - 0.9} y={y0 + 4} width="1.8" height="6" fill="var(--voucher)" />{/if}{/each}
    <path d={scores.map((s, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(s).toFixed(1)}`).join("")} fill="none" stroke="var(--goal)" stroke-width="2.4" stroke-linejoin="round" />
    {#each months as m}<text x={xAt(m.i)} y={H - 4}>{monthOf(m.d.day)}</text>{/each}
    {#if back}
      {#if back.lead}<line x1={back.lead.x} x2={back.lead.x} y1={back.lead.from} y2={back.lead.to} stroke="var(--goal)" stroke-width={k} opacity=".45" />{/if}
      <circle cx={back.x} cy={back.y} r={3 * k} fill="var(--surface)" stroke="var(--goal)" stroke-width={1.4 * k} opacity=".7" />
      <text class="tag" x={back.lx} y={back.ly} style="fill: var(--goal); opacity: .65">{back.text}</text>
    {/if}
    {#if days.length}<text class="tag end" x={x1 + 4 * k} y={yAt(now) + 3.2 * k} style="fill: var(--goal)">{pct(now)}</text>{/if}
  </svg>
  </div>
  <!-- What the score is can't be drawn, so it keeps one line of definition. -->
  {#snippet foot()}Goal Days (the ticks) lift it; a missed Day dents it but never zeroes it.{/snippet}
</TrendCard>

<style>
  /* Values on the chart: a halo in the card's colour keeps them readable
     where they cross a grid line or the line itself. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.end { font-weight: 700; }
</style>
