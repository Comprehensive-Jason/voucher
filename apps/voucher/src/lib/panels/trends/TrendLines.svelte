<script lang="ts">
  // Am I earning more and tearing less than before? Seven-day averages of
  // Vouchers earned and torn, and the gap between them (what was kept), over
  // 12 weeks or half a year, with the Daily goal for reference, and Markers
  // as thin lines so a change in the lines can be matched to what changed.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import MarkerLines from "../../components/MarkerLines.svelte";
  import Legend from "../../components/Legend.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { monthOf, rolling } from "../../trends";
  import { zoomFade } from "../../motion";
  import type { DayTotal } from "../../types";
  import { dayOfMoment, notes } from "../../notes.svelte";
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

  const W = 600, x1 = 592, y1 = 10;
  const H = $derived(fit ? drawHeight(pw, ph, 210) : 210);
  const y0 = $derived(H - 30);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  const top = $derived(Math.max(goal, ...earned, ...torn) * 1.1 || 1);
  const bottom = $derived(Math.min(0, ...net));
  const ticks = $derived([0, Math.round(top / 2), Math.round(top)].filter((v, i, a) => a.indexOf(v) === i));
  // Room at the left for the axis's name and its widest number, held in
  // screen pixels so a narrow card doesn't crowd them together.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * Math.max(...ticks.map((t) => String(t).length)))));
  const xAt = (i: number) => x0 + (days.length > 1 ? (i / (days.length - 1)) * (x1 - x0) : 0);
  const yAt = (v: number) => y0 - ((v - bottom) / (top - bottom)) * (y0 - y1);
  const line = (vals: number[]) => vals.map((v, i) => `${i ? "L" : "M"}${xAt(i).toFixed(1)},${yAt(v).toFixed(1)}`).join("");
  /** A label where each month begins (and at the start), dropping the start's
   *  when it would run into the first month's: three letters and a space. */
  const months = $derived.by(() => {
    const starts = days.map((d, i) => ({ i, d })).filter(({ d, i }) => d.day.slice(8) === "01" || i === 0);
    const kept: typeof starts = [];
    for (const m of starts.reverse()) if (!kept.length || xAt(m.i) + k * 26.4 <= xAt(kept[0].i)) kept.unshift(m);
    return kept;
  });
  $effect(() => { notes.load(); });
  /** Markers inside the range, at their Day's place on the line. */
  const marks = $derived.by(() => {
    const at = new Map(days.map((d, i) => [d.day, i]));
    return notes.markers.flatMap((m) => { const i = at.get(dayOfMoment(m.at)); return i === undefined ? [] : [{ ...m, i }]; });
  });
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
    <!-- A new range zooms in like the bar graph's Day, Week, and Month: half a year from larger, 12 weeks from smaller. -->
    {#key span}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph} in:zoomFade={{ out: span === "182" }}>
    <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Seven-day averages of Vouchers earned and unlocked">
      <ChartAxis {ticks} {yAt} {x0} {x1} {y0} {y1} title="Vouchers a Day" />
      {#if bottom < 0}<line x1={x0} x2={x1} y1={yAt(0)} y2={yAt(0)} stroke="#3a3f45" />{/if}
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" opacity=".7" />
      <text x={x1} y={yAt(goal) - 5} text-anchor="end" style="fill: var(--goal)">goal {goal}</text>
      <MarkerLines marks={marks.map((m) => ({ x: xAt(m.i), text: m.text, rule: m.rule }))} {y0} {y1} />
      <path d={line(net)} fill="none" stroke="#f2f2f0" stroke-width="1.6" stroke-dasharray="2 3" opacity=".8" />
      <path d={line(torn)} fill="none" style="stroke: var(--spend)" stroke-width="2.2" stroke-linejoin="round" />
      <path d={line(earned)} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      {#each months as m}<text x={xAt(m.i)} y={H - 6}>{monthOf(m.d.day)}</text>{/each}
    </svg>
    </div>
    {/key}
    <Legend note="7-day averages" items={[
      { kind: "line", color: "var(--voucher)", label: "Earned" },
      { kind: "line", color: "var(--spend)", label: "Unlocked" },
      { kind: "dash", color: "#f2f2f0", label: "Kept (earned less unlocked)" },
      ...(marks.length ? [{ kind: "flag" as const, color: "#b69cff", label: "Marker" }] : []),
    ]} />
  {/if}
  {#snippet foot()}
    {#if days.length >= 8}
      Earning went from <b>{one(first(earned))}</b> to <b>{one(earned.at(-1) ?? 0)}</b> a Day; unlocking from <b>{one(first(torn))}</b> to <b>{one(torn.at(-1) ?? 0)}</b>.
    {:else}Not enough history yet.{/if}
  {/snippet}
</TrendCard>

