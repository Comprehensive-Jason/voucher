<script lang="ts">
  // Streaks: how does this one compare with my others, and where do streaks
  // tend to end? Above them, the two numbers that matter more after a miss:
  // goal Days in the last two weeks, and how long a lapse usually lasts (and
  // whether lapses are getting shorter), so a miss reads as information. A column for each length from 1 Day to your best, as tall as
  // the number of streaks that reached it, so the drop from one column to the
  // next is where streaks end. Today's length is green, your best outlined in
  // gold. The line above gives the odds, from finished streaks, of this one
  // reaching the next milestone.
  import TrendCard from "../../components/TrendCard.svelte";
  import { goalRuns } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const runs = $derived(goalRuns(history));
  const lastDay = $derived(history.at(-1)?.day);
  const yesterday = $derived(history.at(-2)?.day);
  /** The run still going: it ends today, or yesterday while today's goal is still open. */
  const current = $derived(runs.at(-1) && (runs.at(-1)!.end === lastDay || runs.at(-1)!.end === yesterday) ? runs.at(-1)! : null);
  const finished = $derived(current ? runs.slice(0, -1) : runs);
  const best = $derived(Math.max(1, ...runs.map((r) => r.length)));
  /** How many streaks (finished or not) reached each length, 1 to best. */
  const reached = $derived(Array.from({ length: best }, (_, i) => runs.filter((r) => r.length >= i + 1).length));
  const tallest = $derived(Math.max(1, ...reached));

  const MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 365];
  const odds = $derived.by(() => {
    if (!current) return null;
    const goal = MILESTONES.find((m) => m > current.length);
    const from = finished.filter((r) => r.length >= current.length);
    if (!goal || from.length < 3) return { goal, share: null, n: from.length };
    return { goal, share: from.filter((r) => r.length >= goal).length / from.length, n: from.length };
  });
  // ---- Bouncing back ----
  /** Settled Days: today only once its goal is met, since it can still be. */
  const settled = $derived(history.at(-1)?.goal_met ? history : history.slice(0, -1));
  const lately = $derived(settled.slice(-14).filter((d) => d.goal_met).length);
  /** Lengths of finished lapses: missed Days in a row, ended by a goal Day. */
  const lapses = $derived.by(() => {
    const out: number[] = [];
    let run = 0, seenGoal = false;
    for (const d of settled) {
      if (d.goal_met) { if (run && seenGoal) out.push(run); run = 0; seenGoal = true; }
      else run++;
    }
    return out;
  });
  const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const lapse = $derived(middle(lapses));
  /** The last six lapses against the ones before, once there are enough of both. */
  const recent = $derived(lapses.length >= 9 ? middle(lapses.slice(-6)) : null);
  const earlier = $derived(lapses.length >= 9 ? middle(lapses.slice(0, -6)) : null);
  const days = (n: number) => `${n} ${n === 1 ? "Day" : "Days"}`;

  /** Where finished streaks usually stop: the middle length. */
  const typical = $derived.by(() => {
    const s = finished.map((r) => r.length).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  });
</script>

<TrendCard title="Streaks">
  {#if !runs.length}
    <p class="empty">A goal Day starts the first streak.</p>
  {:else}
    <div class="stats">
      <div><b>{lately} of {Math.min(14, settled.length)}</b><span>goal Days lately</span></div>
      {#if lapse !== null}
        <div><b>{days(recent ?? lapse)}</b><span>{#if recent !== null && earlier !== null && recent !== earlier}typical lapse, {recent < earlier ? "down" : "up"} from {earlier}{:else}a lapse usually lasts{/if}</span></div>
      {/if}
    </div>
    <p class="lead">
      {#if current && odds?.share !== null && odds?.share !== undefined}You're on day <b>{current.length}</b>; <b>{Math.round(odds.share * 100)}%</b> of streaks that reached day {current.length} lasted to day {odds.goal}.
      {:else if current}You're on day <b>{current.length}</b>; your best is <b>{best}</b>.
      {:else if typical}No streak running. Streaks usually end around day <b>{typical}</b>; your best is <b>{best}</b>.
      {:else}Your best is <b>{best}</b> Days.{/if}
    </p>
    <div class="bars" class:fit role="img" aria-label="How many streaks reached each length">
      {#each reached as n, i}
        <div class="col" title="{n} {n === 1 ? 'streak' : 'streaks'} reached day {i + 1}">
          <i class:now={current && current.length === i + 1} class:best={i + 1 === best} style="height: {(n / tallest) * 100}%"></i>
        </div>
      {/each}
    </div>
    <div class="axis"><span>1 day</span><span>{best} days</span></div>
  {/if}
</TrendCard>

<style>
  .stats { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .stats div { display: flex; flex-direction: column; gap: 2px; padding: 10px 12px; border-radius: 12px; background: #1f2226; min-width: 0; }
  .stats b { font: 700 18px/1.1 var(--font); color: var(--ink); white-space: nowrap; }
  .stats span { font-size: 12px; color: var(--muted); }
  .lead { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--muted); }
  .lead b { color: var(--ink); font-family: var(--mono); }
  .bars { height: 120px; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid #3a3f45; }
  .bars.fit { flex: 1; min-height: 40px; height: auto; }
  .col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
  .col i { display: block; width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: #2fb36b; opacity: .5; transition: height var(--t-move) var(--ease-out); }
  .col i.now { background: var(--voucher); opacity: 1; }
  .col i.best { outline: 2px solid var(--goal); outline-offset: -2px; opacity: 1; }
  .axis { display: flex; justify-content: space-between; font: 500 10px var(--mono); color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
