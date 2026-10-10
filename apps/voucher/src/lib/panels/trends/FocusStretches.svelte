<script lang="ts">
  // Am I focusing in longer stretches? An unbroken stretch is time in a
  // focus app (switching between apps of one source, or stepping away for
  // under 2 minutes, doesn't break it).
  //   Typical: a column per week, from a quarter to three quarters of that
  //   week's stretches, with a line through each week's middle one.
  //   Longest (the power curve): for each length, how many stretches at
  //   least that long the last 30 Days held, with the 30 before as an
  //   outline; the further right the bars hold up, the longer you sustain
  //   focus.
  // Neutral greys and ink: focus apps span every source, so no source's
  // colour (and no reserved one) fits.
  // Typical labels its line: the latest week's value at the right end, and
  // the first week's, faint, over its column. The line under the chart only
  // says what counts as a stretch.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import Legend from "../../components/Legend.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { median, mondayOf, monthOf, quantile } from "../../trends";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  import { zoomFade } from "../../motion";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);
  type View = "typical" | "longest";
  let view = $state<View>("typical");

  const days = $derived(history.filter((d) => d.stretches && d.stretches.length));
  const weeks = $derived.by(() => {
    const map = new Map<string, number[]>();
    for (const d of days) map.set(mondayOf(d.day), [...(map.get(mondayOf(d.day)) ?? []), ...d.stretches!]);
    return [...map.entries()].slice(-12).map(([monday, list]) => ({ monday, lo: quantile(list, 0.25), mid: median(list), hi: quantile(list, 0.75) }));
  });
  const LENGTHS = [5, 15, 30, 60, 120];
  const recent = $derived(history.slice(-30).flatMap((d) => d.stretches ?? []));
  const before = $derived(history.slice(-60, -30).flatMap((d) => d.stretches ?? []));
  const atLeast = (list: number[]) => LENGTHS.map((m) => list.filter((s) => s >= m).length);

  const W = 600, y1 = 8;
  const H = $derived(fit ? drawHeight(pw, ph, 180) : 180);
  const y0 = $derived(H - 22);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  const top = $derived(Math.max(15, ...weeks.map((w) => w.hi)) * 1.1);
  const ticks = $derived([0, Math.round(top / 2), Math.round(top)]);
  // Typical: room at the left for the axis's name and its widest number,
  // held in screen pixels so a narrow card doesn't crowd them together.
  // Longest has no number axis and keeps a plain margin.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * String(ticks[2]).length)));
  const lx0 = 40;
  const yAt = (v: number) => y0 - (v / top) * (y0 - y1);
  const typical = $derived(weeks.length ? Math.round(weeks.at(-1)!.mid) : 0);
  const endText = $derived(`${typical} min`);
  // Typical's right edge leaves room for the end label past the last
  // column (bold 9px figures, about 5.6px each), solved from the slot width.
  const x1 = $derived.by(() => {
    const n = Math.max(1, weeks.length), room = W - 2 - k * (3 + 5.6 * endText.length);
    return Math.min(592, x0 + (room - x0) / (1 - 0.2 / n));
  });
  const slot = $derived((x1 - x0) / Math.max(1, weeks.length));
  const counts = $derived({ now: atLeast(recent), then: atLeast(before) });
  const most = $derived(Math.max(1, ...counts.now, ...counts.then));
  const bandW = (592 - lx0) / LENGTHS.length;
  const firstTypical = $derived(weeks.length ? Math.round(weeks[0].mid) : 0);
  /** The first week's value over its column, or under it when the column reaches the top. */
  const startY = $derived.by(() => {
    if (weeks.length < 4) return null;
    const above = yAt(weeks[0].hi) - 4 * k;
    return above - 6.7 * k >= y1 - 2 * k ? above : Math.min(yAt(weeks[0].lo) + 11 * k, y0 - 2 * k);
  });
</script>

<TrendCard title="Focus stretches">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "typical", label: "Typical" }, { id: "longest", label: "Longest" }]} value={view} onchange={(v) => (view = v as View)} />
  {/snippet}
  {#if !days.length}
    <p class="empty">Stretches in focus apps show here once the phone reports them.</p>
  {:else}
    {#key view}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph} in:zoomFade={{ out: view === "longest" }}>
      <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label={view === "typical" ? "Typical focus stretch by week" : "Stretches at least each length, last 30 Days"}>
        {#if view === "typical"}
          <ChartAxis {ticks} {yAt} {x0} {x1} {y0} {y1} title="Minutes" />
          {#each weeks as w, j (w.monday)}
            <rect x={x0 + slot * j + slot * 0.2} y={yAt(w.hi)} width={slot * 0.6} height={Math.max(2, yAt(w.lo) - yAt(w.hi))} rx="3" fill="var(--muted)" opacity=".3" />
          {/each}
          <path d={weeks.map((w, j) => `${j ? "L" : "M"}${x0 + slot * j + slot / 2},${yAt(w.mid)}`).join("")} fill="none" stroke="var(--ink)" stroke-width="2" />
          {#if startY !== null}<text class="tag" x={x0 + slot / 2} y={startY} text-anchor="middle" style="fill: var(--ink); opacity: .6">{firstTypical}</text>{/if}
          <text class="tag end" x={x0 + slot * (weeks.length - 0.2) + 3 * k} y={yAt(weeks.at(-1)!.mid) + 3.2 * k} style="fill: var(--ink)">{endText}</text>
          {#each weeks as w, j (w.monday)}{#if w.monday.slice(8) <= "07"}<text x={x0 + slot * j + slot / 2} y={H - 4} text-anchor="middle">{monthOf(w.monday)}</text>{/if}{/each}
        {:else}
          {#each LENGTHS as m, i}
            {@const x = lx0 + bandW * i + bandW * 0.18}
            {@const bw = bandW * 0.64}
            <rect x={x} y={y0 - (counts.then[i] / most) * (y0 - y1 - 14)} width={bw} height={(counts.then[i] / most) * (y0 - y1 - 14)} rx="3" fill="none" stroke="#6c7177" stroke-dasharray="3 3" />
            <rect x={x + bw * 0.15} y={y0 - (counts.now[i] / most) * (y0 - y1 - 14)} width={bw * 0.7} height={(counts.now[i] / most) * (y0 - y1 - 14)} rx="3" fill="var(--muted)" />
            <text x={x + bw / 2} y={y0 - (counts.now[i] / most) * (y0 - y1 - 14) - 4} text-anchor="middle" style="fill: var(--ink)">{counts.now[i]}</text>
            <text x={x + bw / 2} y={H - 4} text-anchor="middle">{m >= 60 ? `${m / 60} h+` : `${m} min+`}</text>
          {/each}
          <line x1={lx0} x2={592} y1={y0} y2={y0} stroke="#3a3f45" />
        {/if}
      </svg>
    </div>
    {/key}
    <Legend items={view === "typical" ? [
      { kind: "box", color: "color-mix(in srgb, var(--muted) 30%, transparent)", label: "One week: the middle half of its stretches" },
      { kind: "line", color: "var(--ink)", label: "Each week's typical stretch" },
    ] : [
      { kind: "box", color: "var(--muted)", label: "Last 30 Days" },
      { kind: "outline", color: "#6c7177", label: "The 30 before" },
    ]} />
  {/if}
  {#snippet foot()}A stretch: unbroken time in focus apps; breaks under 2 min don't end it.{/snippet}
</TrendCard>


<style>
  /* Values on the chart: a halo in the card's colour keeps them readable
     where they cross a grid line or a column. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.end { font-weight: 700; }
</style>
