<script lang="ts">
  // Is meeting my goal becoming a habit? Loop Habit Tracker's idea: a score
  // that rises with each goal Day and fades slowly with misses, so one missed
  // Day dents it rather than wiping it out the way a streak does. Each Day
  // moves it 1/19th of the way toward 100% (goal met) or 0% (missed), which
  // halves a gap in about 13 Days. Ticks along the bottom mark goal Days.
  import TrendCard from "../../components/TrendCard.svelte";
  import { monthOf } from "../../trends";
  import type { DayTotal } from "../../types";

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

  const W = 600, H = 170, x0 = 36, x1 = 592, y1 = 8, y0 = 140;
  const xAt = (i: number) => x0 + (days.length > 1 ? (i / (days.length - 1)) * (x1 - x0) : 0);
  const yAt = (v: number) => y0 - v * (y0 - y1);
  const months = $derived(days.map((d, i) => ({ d, i })).filter(({ d, i }) => d.day.slice(8) === "01" && i > 2));
</script>

<TrendCard title="Habit strength">
  <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Habit strength over time">
    {#each [0, 0.5, 1] as v}
      <line x1={x0} x2={x1} y1={yAt(v)} y2={yAt(v)} stroke="#2c3036" stroke-dasharray="3 4" />
      <text x={x0 - 6} y={yAt(v) + 3} text-anchor="end">{v * 100}%</text>
    {/each}
    {#each days as d, i}{#if d.goal_met}<rect x={xAt(i) - 0.9} y={y0 + 4} width="1.8" height="6" fill="var(--voucher)" />{/if}{/each}
    <path d={scores.map((s, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(s).toFixed(1)}`).join("")} fill="none" stroke="var(--goal)" stroke-width="2.4" stroke-linejoin="round" />
    {#each months as m}<text x={xAt(m.i)} y={H - 4}>{monthOf(m.d.day)}</text>{/each}
  </svg>
  {#snippet foot()}
    Strength is <b>{Math.round(now * 100)}%</b>{#if Math.round(now * 100) === Math.round(then * 100)}, the same as two weeks ago{:else}, {now > then ? "up" : "down"} from {Math.round(then * 100)}% two weeks ago{/if}. A missed Day dents it a little; it never drops to zero the way a streak does.
  {/snippet}
</TrendCard>
