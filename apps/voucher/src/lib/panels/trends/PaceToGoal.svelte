<script lang="ts">
  // Am I ahead of my usual self? The picked Day's Vouchers (today's, unless
  // another card picked a Day) as a rising line over the middle half of the
  // 30 Days before it (by the end of each hour), with the Daily goal across
  // and a tick at your usual time for reaching it. The Day runs from 06:00;
  // hours after midnight count as 24 to 29.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { clockOfHours, median, quantile } from "../../trends";
  import type { DaySummary, DayTotal } from "../../types";
  import { ledger } from "../../api";
  import { inCurfew } from "../../curfew.svelte";
  import { selection } from "../../selection.svelte";
  import { notes } from "../../notes.svelte";
  import DayStepper from "../../components/DayStepper.svelte";
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
  const usualNow = $derived.by(() => { const b = band.find((x) => x.h >= nowH) ?? band.at(-1); return b; });

  const W = 600, x0 = 40, x1 = 592, y1 = 10;
  const H = $derived(fit ? drawHeight(pw, ph, 240) : 240);
  const y0 = $derived(H - 28);
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
  const bandPath = $derived(band.length ? `M${xAt(START)},${yAt(0)}` + band.map((b) => `L${xAt(b.h)},${yAt(b.hi)}`).join("") + [...band].reverse().map((b) => `L${xAt(b.h)},${yAt(b.lo)}`).join("") + `L${xAt(START)},${yAt(0)}Z` : "");
  const todayPath = $derived.by(() => {
    let d = `M${xAt(START)},${yAt(0)}`, n = 0;
    for (const t of todayTimes.filter((t) => t <= nowH)) { d += `L${xAt(t)},${yAt(n)}L${xAt(t)},${yAt(++n)}`; }
    return d + `L${xAt(Math.min(nowH, END))},${yAt(n)}`;
  });
</script>

<TrendCard title="Pace to goal">
  {#snippet tools()}
    <DayStepper day={chosen} today={today.day} oldest={history[0]?.day} onpick={(d) => selection.set("pace", { day: d === today.day ? null : d, picked: false })} />
  {/snippet}
  {#if perDay.length < 3}
    <p class="empty">A few Days of history draw your usual pace.</p>
  {:else}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Today's Vouchers against your usual Day">
      <!-- Curfew's hours, in the night colour: earning still counts there. -->
      {#each Array(END - START) as _, i}{#if inCurfew((START + i) % 24)}<rect x={xAt(START + i)} y={y1} width={xAt(START + i + 1) - xAt(START + i) + 0.5} height={y0 - y1} fill="rgba(125,140,255,.09)" />{/if}{/each}
      {#each ticks as t}
        <line x1={x0} x2={x1} y1={yAt(t)} y2={yAt(t)} stroke="#2c3036" stroke-dasharray={t ? "3 4" : ""} />
        <text x={x0 - 6} y={yAt(t) + 3.5} text-anchor="end">{t}</text>
      {/each}
      <text x="10" y={(y0 + y1) / 2} text-anchor="middle" transform="rotate(-90 10 {(y0 + y1) / 2})">Vouchers</text>
      <path d={bandPath} fill="rgba(61,220,132,.16)" />
      {#each marks as m}
        <line x1={xAt(m.h)} x2={xAt(m.h)} y1={y1} y2={y0} stroke={m.rule ? "#8b9198" : "#b69cff"} stroke-width="1.2" opacity=".8"><title>{m.text}</title></line>
        <rect x={xAt(m.h)} y={y1} width="6" height="5" rx="1" fill={m.rule ? "#8b9198" : "#b69cff"}><title>{m.text}</title></rect>
      {/each}
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" />
      <text x={x0 + 4} y={yAt(goal) - 5} style="fill: var(--goal)">goal {goal}</text>
      {#if !Number.isNaN(usualGoal)}<line x1={xAt(usualGoal)} x2={xAt(usualGoal)} y1={yAt(goal) - 6} y2={yAt(goal) + 6} stroke="var(--goal)" stroke-width="2" />{/if}
      <path d={todayPath} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      <circle cx={xAt(Math.min(nowH, END))} cy={yAt(soFar)} r="4.5" fill="var(--voucher)" />
      {#each [6, 9, 12, 15, 18, 21, 24] as h}<text x={xAt(h)} y={H - 6} text-anchor="middle">{String(h % 24).padStart(2, "0")}</text>{/each}
    </svg>
    </div>
    <div class="legend">
      <span><i style="background: var(--voucher)"></i>{isToday ? "Today" : chosen}</span>
      <span><i class="box"></i>Your usual Day (middle half of the last {perDay.length})</span>
    </div>
  {/if}
  {#snippet foot()}
    {#if perDay.length >= 3 && usualNow}
      {#if isToday}At <b>{clockOfHours(Math.min(nowH, END))}</b> you have <b>{soFar}</b>, where a usual Day has {Math.round(usualNow.lo)} to {Math.round(usualNow.hi)}.
      {:else}<b>{chosen}</b> ended with <b>{soFar}</b>, where a usual Day ends with {Math.round(usualNow.lo)} to {Math.round(usualNow.hi)}.{/if}
      {#if !Number.isNaN(usualGoal)}Most Days reach the goal around <b>{clockOfHours(usualGoal)}</b>.{/if}
    {:else}Not enough history yet.{/if}
  {/snippet}
</TrendCard>

<style>
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .legend i.box { height: 10px; background: rgba(61, 220, 132, .16); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
