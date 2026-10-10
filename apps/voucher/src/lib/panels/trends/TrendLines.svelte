<script lang="ts">
  // Am I earning more and tearing less than before? Seven-day averages of
  // Vouchers earned and torn, and the gap between them (what was kept), over
  // 12 weeks or half a year, with the Daily goal for reference.
  import TrendCard from "../../components/TrendCard.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { monthOf, rolling } from "../../trends";
  import type { DayTotal } from "../../types";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  let { history, goal }: { history: DayTotal[]; goal: number } = $props();
  let span = $state<"84" | "182">("84");

  // Today is still going, so the lines end yesterday.
  const days = $derived(history.slice(0, -1).slice(-Number(span)));
  const earned = $derived(rolling(days.map((d) => d.earned), 7));
  const torn = $derived(rolling(days.map((d) => d.redeemed), 7));
  const net = $derived(earned.map((e, i) => e - torn[i]));

  const W = 600, x0 = 34, x1 = 592, y1 = 10;
  const H = $derived(fit ? drawHeight(pw, ph, 210) : 210);
  const y0 = $derived(H - 30);
  const top = $derived(Math.max(goal, ...earned, ...torn) * 1.1 || 1);
  const bottom = $derived(Math.min(0, ...net));
  const xAt = (i: number) => x0 + (days.length > 1 ? (i / (days.length - 1)) * (x1 - x0) : 0);
  const yAt = (v: number) => y0 - ((v - bottom) / (top - bottom)) * (y0 - y1);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join("");
  const ticks = $derived([0, Math.round(top / 2), Math.round(top)].filter((v, i, a) => a.indexOf(v) === i));
  /** A label where each month begins. */
  const months = $derived(days.map((d, i) => ({ i, d })).filter(({ d, i }) => d.day.slice(8) === "01" || i === 0));
  const first = (vals: number[]) => vals[Math.min(6, vals.length - 1)] ?? 0;
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
</script>

<TrendCard title="Trend lines">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "84", label: "12 weeks" }, { id: "182", label: "6 months" }]} value={span} onchange={(v) => (span = v as "84" | "182")} />
  {/snippet}
  {#if days.length < 8}
    <p class="empty">A week of history draws the first point.</p>
  {:else}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
    <svg class="chart" viewBox="0 0 {W} {H}" role="img" aria-label="Seven-day averages of Vouchers earned and torn">
      {#each ticks as t}
        <line x1={x0} x2={x1} y1={yAt(t)} y2={yAt(t)} stroke="#2c3036" stroke-dasharray="3 4" />
        <text x={x0 - 6} y={yAt(t) + 3} text-anchor="end">{t}</text>
      {/each}
      {#if bottom < 0}<line x1={x0} x2={x1} y1={yAt(0)} y2={yAt(0)} stroke="#3a3f45" />{/if}
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" opacity=".7" />
      <text x={x1} y={yAt(goal) - 5} text-anchor="end" style="fill: var(--goal)">goal {goal}</text>
      <path d={line(net)} fill="none" stroke="#f2f2f0" stroke-width="1.6" stroke-dasharray="2 3" opacity=".8" />
      <path d={line(torn)} fill="none" stroke="#ff8a7a" stroke-width="2.2" stroke-linejoin="round" />
      <path d={line(earned)} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      {#each months as m}<text x={xAt(m.i)} y={H - 6}>{monthOf(m.d.day)}</text>{/each}
    </svg>
    </div>
    <div class="legend">
      <span><i style="background: var(--voucher)"></i>Earned</span>
      <span><i style="background: #ff8a7a"></i>Torn</span>
      <span><i class="dash"></i>Kept (earned less torn)</span>
      <span class="small">7-day averages</span>
    </div>
  {/if}
  {#snippet foot()}
    {#if days.length >= 8}
      Earning went from <b>{one(first(earned))}</b> to <b>{one(earned.at(-1) ?? 0)}</b> a day; tearing from <b>{one(first(torn))}</b> to <b>{one(torn.at(-1) ?? 0)}</b>.
    {:else}Not enough history yet.{/if}
  {/snippet}
</TrendCard>

<style>
  .legend { display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .legend span { display: inline-flex; align-items: center; gap: 6px; }
  .legend i { width: 14px; height: 3px; border-radius: 2px; display: inline-block; }
  .legend i.dash { background: repeating-linear-gradient(90deg, #f2f2f0 0 3px, transparent 3px 5px); }
  .legend .small { margin-left: auto; font-size: 11px; color: #6f757b; }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
