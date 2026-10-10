<script lang="ts">
  // Is meeting my goal becoming a habit? Loop Habit Tracker's idea: a score
  // that rises with each goal Day and fades slowly with misses, so one missed
  // Day dents it rather than wiping it out the way a streak does. Each Day
  // moves it 1/19th of the way toward 100% (goal met) or 0% (missed), which
  // halves a gap in about 13 Days. Ticks along the bottom mark goal Days.
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

  const W = 600, x1 = 592, y1 = 8;
  const H = $derived(fit ? drawHeight(pw, ph, 170) : 170);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  // Room at the left for the axis's name and "100%", and below for the goal
  // ticks and the months, held in screen pixels so a narrow card doesn't
  // crowd them together.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * 4)));
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
</script>

<TrendCard title="Habit strength">
  <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
  <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Habit strength over time">
    <ChartAxis ticks={[0, 0.5, 1]} {yAt} {x0} {x1} {y0} {y1} title="Strength" format={(v) => `${v * 100}%`} />
    {#each days as d, i}{#if d.goal_met}<rect x={xAt(i) - 0.9} y={y0 + 4} width="1.8" height="6" fill="var(--voucher)" />{/if}{/each}
    <path d={scores.map((s, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(s).toFixed(1)}`).join("")} fill="none" stroke="var(--goal)" stroke-width="2.4" stroke-linejoin="round" />
    {#each months as m}<text x={xAt(m.i)} y={H - 4}>{monthOf(m.d.day)}</text>{/each}
  </svg>
  </div>
  {#snippet foot()}
    Strength is <b>{Math.round(now * 100)}%</b>{#if Math.round(now * 100) === Math.round(then * 100)}, the same as two weeks ago{:else}, {now > then ? "up" : "down"} from {Math.round(then * 100)}% two weeks ago{/if}. A missed Day dents it a little; it never drops to zero the way a streak does.
  {/snippet}
</TrendCard>
