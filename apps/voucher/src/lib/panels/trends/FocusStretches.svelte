<script lang="ts">
  // Am I focusing in longer stretches? A stretch is unbroken time in a
  // source (switching between its apps or sites, or stepping away for under
  // 2 minutes, doesn't break it). A column per Day (Week: the last 7 Days),
  // per week (Month: the last 5 weeks), or per month (Year: the last 12),
  // from a quarter to three quarters of that period's stretches, with a line
  // through each period's middle one. The line's latest value sits at its
  // right end, and its first, faint, over the first column.
  // Neutral greys and ink: a stretch can be in any source, so no source's
  // colour (and no reserved one) fits.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import Legend from "../../components/Legend.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { median, mondayOf, monthOf, quantile } from "../../trends";
  import { shortDate } from "../../time";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  import { zoomFade } from "../../motion";
  import type { DayTotal, Marker } from "../../types";
  import { clock, dayOfMoment, markerKeys, notes } from "../../notes.svelte";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);
  type Range = "week" | "month" | "year";
  let range = $state<Range>("month");
  /** Whether the last switch went to a longer range, for the zoom's direction. */
  let widened = $state(true);
  const RANGES: Range[] = ["week", "month", "year"];
  function setRange(next: Range) { widened = RANGES.indexOf(next) > RANGES.indexOf(range); range = next; }

  const today = $derived(history.at(-1)?.day ?? "");
  const days = $derived(history.filter((d) => d.stretches && d.stretches.length));
  /** Week: each of the last 7 Days; Month: each of the last 5 weeks; Year: each of the last 12 months. */
  const keyOf = (day: string) => (range === "week" ? day : range === "month" ? mondayOf(day) : day.slice(0, 7));
  const COUNT: Record<Range, number> = { week: 7, month: 5, year: 12 };
  const weeks = $derived.by(() => {
    const map = new Map<string, number[]>();
    for (const d of days) map.set(keyOf(d.day), [...(map.get(keyOf(d.day)) ?? []), ...d.stretches!]);
    return [...map.entries()].slice(-COUNT[range]).map(([key, list]) => ({ key, lo: quantile(list, 0.25), mid: median(list), hi: quantile(list, 0.75) }));
  });
  $effect(() => { notes.load(); });
  /** Each column's Markers (by the Day each belongs to), oldest first. */
  const marksOf = $derived.by(() => {
    const shown = new Set(weeks.map((w) => w.key)), out = new Map<string, Marker[]>();
    for (const m of notes.markers) {
      const day = dayOfMoment(m.at), key = keyOf(day);
      if (shown.has(key)) out.set(key, [...(out.get(key) ?? []), m]);
    }
    return out;
  });
  const marksShown = $derived([...marksOf.values()].flat());
  /** A column's flag tooltip: each Marker's date, time, and text. */
  const flagTitle = (list: Marker[]) => list.map((m) => `${shortDate(dayOfMoment(m.at), today)} ${clock(m.at)} ${m.text}`).join("\n");
  /** The label under a column: the weekday's date, the week's Monday, or the month. */
  const labelOf = (key: string) => (range === "year" ? monthOf(key + "-01") : shortDate(key, today));

  const W = 600, y1 = 8;
  /** A Marker flag's pole, in screen pixels (the bar graph's flag). */
  const FLAG = 14;
  const H = $derived(fit ? drawHeight(pw, ph, 180) : 180);
  const y0 = $derived(H - 22);
  /** Drawing units per screen pixel: chart text is 11px on screen, 11 * k here. */
  const k = $derived(W / (pw || W));
  const top = $derived(Math.max(15, ...weeks.map((w) => w.hi)) * 1.1);
  const ticks = $derived([0, Math.round(top / 2), Math.round(top)]);
  // Room at the left for the axis's name and its widest number, held in
  // screen pixels so a narrow card doesn't crowd them together.
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * String(ticks[2]).length)));
  const yAt = (v: number) => y0 - (v / top) * (y0 - y1);
  const typical = $derived(weeks.length ? Math.round(weeks.at(-1)!.mid) : 0);
  const endText = $derived(`${typical} min`);
  // The right edge leaves room for the end label past the last
  // column (bold 9px figures, about 5.6px each), solved from the slot width.
  const x1 = $derived.by(() => {
    const n = Math.max(1, weeks.length), room = W - 2 - k * (3 + 5.6 * endText.length);
    return Math.min(592, x0 + (room - x0) / (1 - 0.2 / n));
  });
  const slot = $derived((x1 - x0) / Math.max(1, weeks.length));
  const firstTypical = $derived(weeks.length ? Math.round(weeks[0].mid) : 0);
  /** The first week's value over its column, or under it when the column reaches the top. */
  const startY = $derived.by(() => {
    if (weeks.length < 4) return null;
    const above = yAt(weeks[0].hi) - 4 * k;
    // Under the first column's flag, if it has one, rather than through its pole.
    const roof = marksOf.has(weeks[0].key) ? y1 + FLAG * k + 2 * k : y1 - 2 * k;
    return above - 6.7 * k >= roof ? above : Math.min(yAt(weeks[0].lo) + 11 * k, y0 - 2 * k);
  });
</script>

<TrendCard title="Focus stretches">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }]} value={range} onchange={(v) => setRange(v as Range)} />
  {/snippet}
  {#if !days.length}
    <p class="empty">Stretches show here once a device reports time in your sources.</p>
  {:else}
    {#key range}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph} in:zoomFade={{ out: widened }}>
      <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Typical stretch in a source, by {range === 'week' ? 'Day' : range === 'month' ? 'week' : 'month'}">
        <ChartAxis {ticks} {yAt} {x0} {x1} {y0} {y1} title="Minutes" />
        {#each weeks as w, j (w.key)}
          <rect x={x0 + slot * j + slot * 0.2} y={yAt(w.hi)} width={slot * 0.6} height={Math.max(2, yAt(w.lo) - yAt(w.hi))} rx="3" fill="var(--muted)" opacity=".3" />
        {/each}
        <path d={weeks.map((w, j) => `${j ? "L" : "M"}${x0 + slot * j + slot / 2},${yAt(w.mid)}`).join("")} fill="none" stroke="var(--ink)" stroke-width="2" />
        {#if startY !== null}<text class="tag" x={x0 + slot / 2} y={startY} text-anchor="middle" style="fill: var(--ink); opacity: .6">{firstTypical}</text>{/if}
        <text class="tag end" x={x0 + slot * (weeks.length - 0.2) + 3 * k} y={yAt(weeks.at(-1)!.mid) + 3.2 * k} style="fill: var(--ink)">{endText}</text>
        <!-- A notched flag at the top of each column holding a Marker, as on the bar graph's bars; grey if all are rule changes. -->
        {#each weeks as w, j (w.key)}
          {@const list = marksOf.get(w.key)}
          {#if list}
            {@const cx = x0 + slot * j + slot / 2}
            {@const color = list.every((m) => m.rule) ? "var(--muted)" : "var(--marker)"}
            <g class="flag"><title>{flagTitle(list)}</title>
              <rect x={cx - 0.8 * k} y={y1} width={1.6 * k} height={FLAG * k} rx={0.8 * k} fill={color} />
              <path d="M{cx},{y1} h{7 * k} l{-2 * k},{3 * k} {2 * k},{3 * k} h{-7 * k} z" fill={color} />
              <!-- A wider invisible target, so the tooltip doesn't need a pixel-exact hover. -->
              <rect x={cx - 3 * k} y={y1 - 2 * k} width={12 * k} height={(FLAG + 4) * k} fill="transparent" />
            </g>
          {/if}
        {/each}
        {#each weeks as w, j (w.key)}
          <text x={x0 + slot * j + slot / 2} y={H - 4} text-anchor="middle">{labelOf(w.key)}</text>
        {/each}
      </svg>
    </div>
    {/key}
    <Legend items={[
      { kind: "box", color: "color-mix(in srgb, var(--muted) 30%, transparent)", label: `Middle half of a ${range === "week" ? "Day" : range === "month" ? "week" : "month"}'s stretches` },
      { kind: "line", color: "var(--ink)", label: "Typical stretch" },
      ...markerKeys(marksShown),
    ]} />
  {/if}
  {#snippet foot()}A stretch: unbroken time in a source; breaks under 2 min don't end it.{/snippet}
</TrendCard>


<style>
  /* Values on the chart: a halo in the card's colour keeps them readable
     where they cross a grid line or a column. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.end { font-weight: 700; }
</style>
