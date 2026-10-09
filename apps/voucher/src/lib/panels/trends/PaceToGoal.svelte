<script lang="ts">
  // Am I ahead of my usual self today? Today's Vouchers as a rising line over
  // the middle half of the last 30 Days (by the end of each hour), with the
  // Daily goal across. Under it, the splits: for each Voucher toward the goal,
  // how many minutes ahead of (or behind) your usual time for it you were.
  // The Day runs from 06:00; hours after midnight count as 24 to 29.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, quantile } from "../../trends";
  import type { DaySummary, DayTotal } from "../../types";

  let { history, today, timeZone }: { history: DayTotal[]; today: DaySummary; timeZone: string } = $props();

  const START = 6, END = 30;
  /** Hours since midnight of the Day's start, after-midnight hours past 24. */
  const hoursAt = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h < START ? h + 24 : h) + m / 60; };
  const goal = $derived(today.goal);

  // Today's Vouchers in the order they came.
  const todayTimes = $derived(today.log.filter((e) => e.kind === "earned").map((e) => hoursAt(e.at)).sort((a, b) => a - b));
  // Each past Day's running total at the end of each hour, and when its k-th Voucher came (spread evenly within its hour).
  const past = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length).slice(-30));
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
  const splits = $derived(todayTimes.slice(0, goal).map((t, i) => ({ k: i + 1, ahead: (usualTime(i + 1) - t) * 60 })).filter((s) => !Number.isNaN(s.ahead)));
  /** Where a usual Day loses the most time: the longest gap between Vouchers toward the goal. */
  const slowest = $derived.by(() => {
    let best: { from: number; gap: number } | null = null;
    for (let k = 1; k < goal; k++) {
      const gap = usualTime(k + 1) - usualTime(k);
      if (!Number.isNaN(gap) && (!best || gap > best.gap)) best = { from: k, gap };
    }
    return best;
  });
  const nowH = $derived(hoursAt(new Date().toISOString()));
  const soFar = $derived(todayTimes.filter((t) => t <= nowH).length);
  const usualNow = $derived.by(() => { const b = band.find((x) => x.h >= nowH) ?? band.at(-1); return b; });

  const W = 600, H = 200, x0 = 30, x1 = 592, y1 = 10, y0 = 172;
  const top = $derived(Math.max(goal + 2, ...band.map((b) => b.hi), todayTimes.length) || 1);
  const xAt = (h: number) => x0 + ((h - START) / (END - START)) * (x1 - x0);
  const yAt = (v: number) => y0 - (v / top) * (y0 - y1);
  const bandPath = $derived(band.length ? `M${xAt(START)},${yAt(0)}` + band.map((b) => `L${xAt(b.h)},${yAt(b.hi)}`).join("") + [...band].reverse().map((b) => `L${xAt(b.h)},${yAt(b.lo)}`).join("") + `L${xAt(START)},${yAt(0)}Z` : "");
  const todayPath = $derived.by(() => {
    let d = `M${xAt(START)},${yAt(0)}`, n = 0;
    for (const t of todayTimes.filter((t) => t <= nowH)) { d += `L${xAt(t)},${yAt(n)}L${xAt(t)},${yAt(++n)}`; }
    return d + `L${xAt(Math.min(nowH, END))},${yAt(n)}`;
  });
  const splitMax = $derived(Math.max(30, ...splits.map((s) => Math.abs(s.ahead))));
  const mins = (m: number) => `${Math.round(Math.abs(m))} min`;
</script>

<TrendCard title="Pace to goal">
  {#if perDay.length < 3}
    <p class="empty">A few Days of history draw your usual pace.</p>
  {:else}
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Today's Vouchers against your usual Day">
      <path d={bandPath} fill="rgba(61,220,132,.16)" />
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" />
      <text x={x0 + 4} y={yAt(goal) - 5} style="fill: var(--goal)">goal {goal}</text>
      {#if !Number.isNaN(usualGoal)}<line x1={xAt(usualGoal)} x2={xAt(usualGoal)} y1={yAt(goal) - 6} y2={yAt(goal) + 6} stroke="var(--goal)" stroke-width="2" />{/if}
      <path d={todayPath} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      <circle cx={xAt(Math.min(nowH, END))} cy={yAt(soFar)} r="4.5" fill="var(--voucher)" />
      {#each [6, 9, 12, 15, 18, 21, 24] as h}<text x={xAt(h)} y={H - 6} text-anchor="middle">{String(h % 24).padStart(2, "0")}</text>{/each}
    </svg>
    {#if splits.length}
      <!-- One bar per Voucher so far: up and green when it came sooner than usual, down and red when later. -->
      <div class="splits" aria-label="Splits">
        {#each Array(goal) as _, i}
          {@const s = splits[i]}
          <div class="split" title={s ? `Voucher ${s.k}: ${mins(s.ahead)} ${s.ahead >= 0 ? "ahead" : "behind"}` : `Voucher ${i + 1}`}>
            {#if s}<i class:behind={s.ahead < 0} style="height: {(Math.abs(s.ahead) / splitMax) * 40}%"></i>{/if}
            <span>{i + 1}</span>
          </div>
        {/each}
      </div>
    {/if}
    <div class="legend">
      <span><i style="background: var(--voucher)"></i>Today</span>
      <span><i class="box"></i>Your usual Day (middle half of the last {perDay.length})</span>
    </div>
  {/if}
  {#snippet foot()}
    {#if perDay.length >= 3 && usualNow}
      At <b>{clockOfHours(Math.min(nowH, END))}</b> you have <b>{soFar}</b>, where a usual Day has {Math.round(usualNow.lo)} to {Math.round(usualNow.hi)}.
      {#if !Number.isNaN(usualGoal)}Most Days reach the goal around <b>{clockOfHours(usualGoal)}</b>.{/if}
      {#if slowest}Usually the longest wait is between Vouchers {slowest.from} and {slowest.from + 1}.{/if}
    {:else}Not enough history yet.{/if}
  {/snippet}
</TrendCard>

<style>
  .splits { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 3px; height: 54px; }
  .split { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: flex-end; }
  /* Ahead rises from the middle line, behind hangs from it. */
  .split i { position: absolute; left: 15%; right: 15%; bottom: 50%; background: var(--voucher); border-radius: 2px 2px 0 0; min-height: 2px; }
  .split i.behind { bottom: auto; top: 50%; background: #ff8a7a; border-radius: 0 0 2px 2px; }
  .split::before { content: ""; position: absolute; left: 0; right: 0; top: 50%; border-top: 1px solid #2c3036; }
  .split span { position: relative; font: 500 9px var(--mono); color: #6f757b; }
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .legend i.box { height: 10px; background: rgba(61, 220, 132, .16); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
