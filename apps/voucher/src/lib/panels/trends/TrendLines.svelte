<script lang="ts">
  // Am I earning more and tearing less than before? Seven-day averages of
  // Vouchers earned and torn, and the gap between them (what was kept), over
  // 12 weeks or half a year, with the Daily goal for reference, and Markers
  // as thin lines so a change in the lines can be matched to what changed.
  // Earned and torn carry their values on the chart: bold at the right end,
  // faint at the start, so the change reads without a sentence. Torn is in
  // salmon, Unlocks' colour everywhere.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import MarkerLines from "../../components/MarkerLines.svelte";
  import Legend from "../../components/Legend.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { monthOf, rolling } from "../../trends";
  import { zoomFade } from "../../motion";
  import type { DayTotal } from "../../types";
  import { dayOfMoment, markerKeys, notes } from "../../notes.svelte";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  let { history, goal }: { history: DayTotal[]; goal: number } = $props();
  let span = $state<"84" | "182">("84");

  // Today is still going, so the lines end yesterday. Each point averages a
  // full week where history allows, so the first one (and its label) isn't
  // a part-week average.
  const finished = $derived(history.slice(0, -1));
  const days = $derived(finished.slice(-Number(span)));
  const lead = $derived(finished.slice(-(Number(span) + 6)));
  const week = (vals: number[]) => rolling(vals, 7).slice(lead.length - days.length);
  const earned = $derived(week(lead.map((d) => d.earned)));
  const torn = $derived(week(lead.map((d) => d.redeemed)));
  const net = $derived(earned.map((e, i) => e - torn[i]));

  const W = 600, y1 = 10;
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
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
  // Room at the right for the end values, in screen pixels like the axis's.
  const x1 = $derived(W - Math.max(8, Math.round(k * (7 + 5.6 * Math.max(one(earned.at(-1) ?? 0).length, one(torn.at(-1) ?? 0).length)))));
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
  // The "7-day averages" note rides in the side title when the chart is
  // tall enough for it (9px letters, about 5.8px each); else it sits in the
  // widest gap between the month names, so it never costs the legend a line.
  const AXIS = "Vouchers a Day, 7-day avg", NOTE = "7-day avg";
  const roomy = $derived((y0 - y1) / k >= AXIS.length * 5.8 + 6);
  const noteX = $derived.by(() => {
    if (roomy) return null;
    const edges = [x0, ...months.flatMap((m) => [xAt(m.i), xAt(m.i) + 3 * 5.6 * k]), W].sort((a, b) => a - b);
    let best = { l: 0, r: 0 };
    for (let j = 0; j < edges.length; j += 2) if (edges[j + 1] - edges[j] > best.r - best.l) best = { l: edges[j], r: edges[j + 1] };
    return best.r - best.l >= (NOTE.length * 5.6 + 16) * k ? (best.l + best.r) / 2 : null;
  });

  // The value labels, as boxes in drawing units (screen px times k) so they
  // can be kept off the lines and each other.
  type Box = { l: number; r: number; t: number; b: number };
  const hits = (a: Box, b: Box) => a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b;
  const boxAt = (x: number, y: number, text: string): Box => ({ l: x, r: x + text.length * 5.6 * k, t: y - 6.7 * k, b: y + 1.8 * k });
  /** Each line's band of heights across the drawing units from l to r. */
  const spanOf = (vals: number[], l: number, r: number): Box => {
    const ys = vals.map((v, i) => [xAt(i), yAt(v)]).filter(([x]) => x >= l - 4 && x <= r + 4).map(([, y]) => y);
    return { l, r, t: Math.min(...ys) - 1.5, b: Math.max(...ys) + 1.5 };
  };
  /** End values in the right margin, level with their line's end, nudged apart. */
  const ends = $derived.by(() => {
    const x = x1 + 4 * k;
    const list = [
      { text: one(earned.at(-1) ?? 0), y: yAt(earned.at(-1) ?? 0), color: "var(--voucher)" },
      { text: one(torn.at(-1) ?? 0), y: yAt(torn.at(-1) ?? 0), color: "var(--spend)" },
    ].sort((a, b) => a.y - b.y);
    const gap = 10 * k, d = list[1].y - list[0].y;
    if (d < gap) { list[0].y -= (gap - d) / 2; list[1].y += (gap - d) / 2; }
    return list.map((e) => ({ ...e, x, y: e.y + 3.2 * k }));
  });
  /** Faint start values just inside the left edge: earned's above its line,
   *  torn's below its own (or above, if that's where there's room),
   *  each kept clear of all three lines. */
  const starts = $derived.by(() => {
    const x = x0 + 3 * k, out: { text: string; x: number; y: number; color: string }[] = [];
    const taken: Box[] = [];
    for (const [vals, color, ups] of [[earned, "var(--voucher)", [true, false]], [torn, "var(--spend)", [false, true]]] as const) {
      const text = one(vals[0] ?? 0), w = text.length * 5.6 * k;
      const lines = [earned, torn, net].map((v) => spanOf(v, x, x + w));
      const own = spanOf(vals, x, x + w);
      for (const up of ups) {
        const y = up ? own.t - 3 * k : own.b + 8.5 * k;
        const box = boxAt(x, y, text);
        if (box.t < y1 - 2 * k || box.b > y0) continue;
        if (lines.some((l) => hits(box, l)) || taken.some((t) => hits(box, t))) continue;
        out.push({ text, x, y, color }); taken.push(box); break;
      }
    }
    return out;
  });
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
    <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Seven-day averages of Vouchers earned and torn">
      <ChartAxis {ticks} {yAt} {x0} {x1} {y0} {y1} title={roomy ? AXIS : "Vouchers a Day"} />
      {#if bottom < 0}<line x1={x0} x2={x1} y1={yAt(0)} y2={yAt(0)} stroke="#3a3f45" />{/if}
      <line x1={x0} x2={x1} y1={yAt(goal)} y2={yAt(goal)} stroke="var(--goal)" stroke-dasharray="5 5" opacity=".7" />
      <text x={x1} y={yAt(goal) - 5} text-anchor="end" style="fill: var(--goal)">goal {goal}</text>
      <MarkerLines marks={marks.map((m) => ({ x: xAt(m.i), text: m.text, rule: m.rule }))} {y0} {y1} />
      <path d={line(net)} fill="none" stroke="var(--ink)" stroke-width="1.6" stroke-dasharray="2 3" opacity=".8" />
      <path d={line(torn)} fill="none" style="stroke: var(--spend)" stroke-width="2.2" stroke-linejoin="round" />
      <path d={line(earned)} fill="none" stroke="var(--voucher)" stroke-width="2.4" stroke-linejoin="round" />
      {#each starts as s}<text class="tag" x={s.x} y={s.y} style="fill: {s.color}; opacity: .65">{s.text}</text>{/each}
      {#each ends as e}<text class="tag end" x={e.x} y={e.y} style="fill: {e.color}">{e.text}</text>{/each}
      {#each months as m}<text x={xAt(m.i)} y={H - 6}>{monthOf(m.d.day)}</text>{/each}
      {#if noteX !== null}<text class="note" x={noteX} y={H - 6} text-anchor="middle">{NOTE}</text>{/if}
    </svg>
    </div>
    {/key}
    <!-- Short labels keep the legend to one line on a third-width card. -->
    <Legend note={roomy || noteX !== null ? undefined : NOTE} items={[
      { kind: "line", color: "var(--voucher)", label: "Earned" },
      { kind: "line", color: "var(--spend)", label: "Torn" },
      { kind: "dash", color: "var(--ink)", label: "Kept" },
      ...markerKeys(marks),
    ]} />
  {/if}
</TrendCard>


<style>
  /* Values on the chart: a halo in the card's colour keeps them readable
     where they cross a grid or Marker line. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.end { font-weight: 700; }
  /* The averaging note among the month names: dimmer than they are, so it reads as a caption. */
  svg.chart text.note { fill: #5d6369; }
</style>
