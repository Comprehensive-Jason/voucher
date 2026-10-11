<script lang="ts">
  // Did planned time go where it was planned? Time blocks from a task manager
  // (a task with a start time and a duration), each split by what the
  // devices saw: in a source (green), elsewhere (other apps, or away from
  // devices: the empty square, neutral), no data (the hour charts' hatching),
  // Distraction in each blocklist's colour, and Unlocked in salmon. Only
  // Distraction and Unlocked count against a block, and nothing says source
  // time belonged to its task. The headline, on the bar across the top, is
  // the share of planned time lost to them in what's in view, leaving out no
  // data; lower is better.
  //
  // Day: the picked Day's blocks at their times on the 06:00 to 06:00 Day,
  // Curfew shaded, each a column split by its minutes (bottom to top in the
  // order above), with a check over each done block. Week and Month: a
  // column per Day, as tall as the share lost, split by blocklist with
  // Unlocked on top, Markers as thin lines, the picked Day lit. Day, Week,
  // and Month switch with the other cards.
  //
  // The Ledger splits each block four ways (sources, Distraction or Unlocked,
  // other, unknown). Unlocked is the part inside the Day's Unlocks; the rest
  // of its Distraction is shared among blocklists by the Day's Distraction
  // minutes, since a device doesn't say which app each minute was in.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import MarkerLines from "../../components/MarkerLines.svelte";
  import Legend, { type LegendItem } from "../../components/Legend.svelte";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  import { zoomFade } from "../../motion";
  import { curfew } from "../../curfew.svelte";
  import { selection, type Span } from "../../selection.svelte";
  import { minutesByList } from "../../blocklists";
  import { mondayOf } from "../../trends";
  import { clock, shiftDay, shortDate } from "../../time";
  import { dayOfMoment, markerKeys, notes } from "../../notes.svelte";
  import type { Blocklist, DayTotal, PlannedBlock } from "../../types";

  let { history, timeZone, blocklists = {} }: { history: DayTotal[]; timeZone: string; blocklists?: Record<string, Blocklist> } = $props();
  const fit = fitsSlot();
  const uid = $props.id();
  let pw = $state(0), ph = $state(0);

  // Day, Week, or Month, shared with the other cards.
  let span = $state<Span>(selection.span);
  let widened = $state(true);
  const LEVELS: Span[] = ["day", "week", "month"];
  function setSpan(next: Span) { widened = LEVELS.indexOf(next) > LEVELS.indexOf(span); span = next; }
  $effect(() => {
    selection.seq;
    untrack(() => { if (selection.from !== "planned" && selection.span !== span) setSpan(selection.span); });
  });

  const today = $derived(history.at(-1)?.day ?? "");
  const chosen = $derived(selection.day ?? today);
  const byDay = $derived(new Map(history.map((d) => [d.day, d])));
  const any = $derived(history.some((d) => d.planned?.length));
  const oldest = $derived(history.find((d) => d.planned?.length)?.day ?? history[0]?.day);
  /** The Days in view: the picked Day, its week (Monday first), or its calendar month. */
  const period = $derived.by(() => {
    if (!chosen) return [];
    if (span === "day") return [chosen];
    const start = span === "week" ? mondayOf(chosen) : `${chosen.slice(0, 7)}-01`;
    const out: string[] = [];
    for (let d = start; (span === "week" ? out.length < 7 : d.slice(0, 7) === chosen.slice(0, 7)); d = shiftDay(d, 1)) out.push(d);
    return out;
  });

  // ---- A block's minutes ----
  type Part = { key: string; name: string; fill: string; m: number; lost: boolean };
  type Total = { len: number; none: number; lost: number; parts: Part[] };
  const overlap = (a0: number, a1: number, spans: [string, string][]) =>
    spans.reduce((t, [s, e]) => t + Math.max(0, Math.min(a1, Date.parse(e)) - Math.max(a0, Date.parse(s))), 0) / 60_000;
  /** Whole minutes shared out in proportion to `weights`, adding up to `total`. */
  function share(total: number, weights: number[]): number[] {
    const sum = weights.reduce((a, b) => a + b, 0);
    if (!sum) return weights.map(() => 0);
    const exact = weights.map((w) => (total * w) / sum), out = exact.map(Math.floor);
    let left = total - out.reduce((a, b) => a + b, 0);
    for (const i of exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0]).map(([, i]) => i)) { if (left-- <= 0) break; out[i]++; }
    return out;
  }
  const hatch = $derived(`url(#${uid}-hatch)`);
  /** A block's parts, bottom to top: sources, elsewhere, no data, each blocklist, Unlocked. */
  function partsOf(b: PlannedBlock, d: DayTotal): Part[] {
    const from = Date.parse(b.start), to = from + b.minutes * 60_000;
    const unlocked = Math.min(b.split.distraction, Math.round(overlap(from, to, d.unlocks ?? [])));
    const rest = b.split.distraction - unlocked;
    const lists = minutesByList(d.used, d.used_lists, blocklists);
    const listParts = lists.length ? share(rest, lists.map((l) => l.minutes)).map((m, i) => ({ key: lists[i].id, name: lists[i].name, fill: lists[i].color, m, lost: true }))
      : [{ key: "~other", name: "Distraction", fill: "#9aa0a6", m: rest, lost: true }];
    return [
      { key: "sources", name: "in sources", fill: "var(--voucher)", m: b.split.sources, lost: false },
      { key: "other", name: "elsewhere", fill: "var(--heat-0)", m: b.split.other, lost: false },
      { key: "none", name: "no data", fill: hatch, m: b.split.unknown, lost: false },
      ...listParts,
      { key: "unlocked", name: "Unlocked", fill: "var(--spend)", m: unlocked, lost: true },
    ].filter((p) => p.m > 0);
  }
  function totalOf(blocks: { b: PlannedBlock; d: DayTotal }[]): Total {
    const parts = new Map<string, Part>();
    let len = 0, none = 0;
    for (const { b, d } of blocks) {
      len += b.minutes; none += b.split.unknown;
      for (const p of partsOf(b, d)) { const q = parts.get(p.key); if (q) q.m += p.m; else parts.set(p.key, { ...p }); }
    }
    const list = [...parts.values()];
    // The same order as a block's: kept parts first, the lost ones last, Unlocked on top.
    const rank = (p: Part) => ["sources", "other", "none"].indexOf(p.key) + 1 || (p.key === "unlocked" ? 9 : 5);
    list.sort((a, b) => rank(a) - rank(b));
    return { len, none, lost: list.filter((p) => p.lost).reduce((a, p) => a + p.m, 0), parts: list };
  }
  const shareOf = (t: Total) => (t.len - t.none > 0 ? t.lost / (t.len - t.none) : null);
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  const blocksOn = (day: string) => { const d = byDay.get(day); return d ? (d.planned ?? []).map((b) => ({ b, d })) : []; };
  const total = $derived(totalOf(period.flatMap(blocksOn)));
  const lostShare = $derived(shareOf(total));
  const partsText = (parts: Part[]) => parts.map((p) => `${p.m} min ${p.name}`).join(", ");

  // ---- Drawing ----
  const W = 600;
  const H = $derived(fit ? drawHeight(pw, ph, 190) : 190);
  const k = $derived(W / (pw || W));
  /** The headline bar across the top, and the share at its right. */
  const BAR = $derived(10 * k);
  const headW = $derived(78 * k);
  const top = $derived(BAR + 10 * k);

  // Day: the 06:00 to 06:00 Day.
  const minuteOf = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h * 60 + m - 360 + 1440) % 1440; };
  const dayX = (m: number) => 2 + (m / 1440) * (W - 4);
  const night = $derived({ from: (curfew.start * 60 - 360 + 1440) % 1440, to: (curfew.end * 60 - 360 + 1440) % 1440 || 1440 });
  const dayBlocks = $derived(span === "day" ? blocksOn(chosen).map(({ b, d }) => {
    const a = minuteOf(b.start);
    return { b, parts: partsOf(b, d), a, z: Math.min(1440, a + b.minutes) };
  }) : []);

  // Week and Month: a column per Day, as tall as its share lost.
  const columns = $derived(span === "day" ? [] : period.map((day) => {
    const t = totalOf(blocksOn(day));
    return { day, t, share: shareOf(t), future: day > today };
  }));
  const maxShare = $derived(Math.max(0.2, Math.ceil(Math.max(0, ...columns.map((c) => c.share ?? 0)) * 10) / 10));
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * 3)));
  const x1 = W - 4;
  const cy1 = $derived(top + 14 * k);
  const cy0 = $derived(H - 15 * k);
  const yAt = (v: number) => cy0 - (v / maxShare) * (cy0 - cy1);
  const ticks = $derived([0, maxShare / 2, maxShare]);
  const slot = $derived((x1 - x0) / Math.max(1, columns.length));
  const bw = $derived(Math.max(4 * k, slot * 0.62));
  const xc = (i: number) => x0 + slot * (i + 0.5);
  $effect(() => { notes.load(); });
  const marks = $derived.by(() => {
    if (span === "day") return [];
    const at = new Map(columns.map((c, i) => [c.day, i]));
    return notes.markers.flatMap((m) => { const i = at.get(dayOfMoment(m.at)); return i === undefined ? [] : [{ x: xc(i), text: `${shortDate(dayOfMoment(m.at), today)}: ${m.text}`, rule: m.rule }]; });
  });
  const WEEKDAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const pick = (day: string) => selection.set("planned", { day: day === today ? null : day, picked: true });

  /** The colours of the blocklists drawn, for the legend's Distraction key. */
  const listColors = $derived([...new Set(total.parts.filter((p) => p.lost && p.key !== "unlocked").map((p) => p.fill))]);
  const legend = $derived<LegendItem[]>(span === "day" ? [
    { kind: "box", color: "var(--spend)", label: "Unlocked" },
    { kind: "box", color: "var(--voucher)", label: "In sources" },
    { kind: "box", color: "var(--heat-0)", label: "Elsewhere" },
    { kind: "hatch", label: "No data" },
    { kind: "check", color: "var(--ink)", label: "Done" },
  ] : [{ kind: "box", color: "var(--spend)", label: "Unlocked" }, ...markerKeys(marks)]);
</script>

{#snippet bar(x: number, y: number, w: number, h: number, parts: Part[], vertical: boolean, id: string, title: string)}
  {@const sum = parts.reduce((a, p) => a + p.m, 0)}
  {@const room = (vertical ? h : w) - (parts.length - 1) * k}
  <clipPath id="{uid}-{id}"><rect {x} {y} width={Math.max(0, w)} height={Math.max(0, h)} rx={Math.min(3 * k, w / 2, h / 2)} /></clipPath>
  <g clip-path="url(#{uid}-{id})"><title>{title}</title>
    {#each parts as p, i (p.key)}
      {@const before = parts.slice(0, i).reduce((a, q) => a + (room * q.m) / sum + k, 0)}
      {@const L = Math.max(0, (room * p.m) / sum)}
      {#if vertical}<rect {x} y={y + h - before - L} width={w} height={L} style="fill: {p.fill}" />
      {:else}<rect x={x + before} {y} width={L} height={h} style="fill: {p.fill}" />{/if}
    {/each}
  </g>
{/snippet}

<TrendCard title="Planned vs actual" date={any ? { day: chosen, today, oldest, unit: span, onpick: (d) => selection.set("planned", { day: d === today ? null : d, picked: false }) } : undefined}>
  {#snippet tools()}
    {#if any}<ZoomSwitch options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} value={span} onchange={(v) => { setSpan(v as Span); selection.set("planned", { span: v as Span, picked: false }); }} />{/if}
  {/snippet}
  {#if !any}
    <p class="empty">Time blocks show here once a task manager has tasks with a start time and a duration, such as Todoist's.</p>
  {:else}
    {#key `${span}${period[0]}`}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph} in:zoomFade={{ out: widened }}>
      <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Planned time and where it went">
        <defs><pattern id="{uid}-hatch" width={7 * k} height={7 * k} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={3 * k} height={7 * k} fill="rgba(255, 255, 255, .09)" /></pattern></defs>
        <!-- The headline: everything planned in view, split the same way, and the share lost. -->
        {#if total.len}
          {@render bar(0, 0, W - headW, BAR, total.parts, false, "all", `${partsText(total.parts)}; ${pct(lostShare)} of planned time with data lost`)}
        {:else}
          <rect x="0" y="0" width={W - headW} height={BAR} rx={3 * k} style="fill: var(--heat-0)" />
        {/if}
        <text class="share" x={W} y={BAR - 0.5 * k} text-anchor="end"><tspan class="big">{total.len ? pct(lostShare) : "none"}</tspan>{total.len ? " lost" : ""}</text>
        {#if span === "day"}
          {@const bTop = top + 10 * k}
          {@const bBottom = H - 15 * k}
          <rect x={dayX(night.from)} y={top} width={dayX(night.to) - dayX(night.from)} height={bBottom - top} style="fill: var(--night-band)" />
          {#each Array.from({ length: 8 }, (_, i) => i * 180) as m (m)}<line x1={dayX(m)} x2={dayX(m)} y1={bTop} y2={bBottom} stroke="var(--divider)" stroke-width={k} />{/each}
          {#each dayBlocks as blk, i (i)}
            {@const a = dayX(blk.a)}
            {@const w = Math.max(2 * k, dayX(blk.z) - a - k)}
            {@const lost = shareOf(totalOf([{ b: blk.b, d: byDay.get(chosen)! }]))}
            {@render bar(a, bTop, w, bBottom - bTop, blk.parts, true, `b${i}`, `${clock(blk.b.start, timeZone)}, ${blk.b.minutes} min${blk.b.done_at ? ", done" : ""}: ${partsText(blk.parts)}; ${pct(lost)} lost`)}
            {#if blk.b.done_at}<path d="M{a + w / 2 - 3.5 * k} {bTop - 5 * k}l{2.3 * k} {2.3 * k} {4.4 * k} {-4.8 * k}" fill="none" stroke="var(--ink)" stroke-width={1.6 * k} stroke-linecap="round" stroke-linejoin="round" />{/if}
          {/each}
          <line x1="0" x2={W} y1={bBottom + 0.5 * k} y2={bBottom + 0.5 * k} stroke="var(--line)" stroke-width={k} />
          {#if !dayBlocks.length}<text x={W / 2} y={(bTop + bBottom) / 2} text-anchor="middle">No time blocks this Day</text>{/if}
          {#each Array.from({ length: 9 }, (_, i) => i * 180) as m (m)}
            {@const h = (6 + m / 60) % 24}
            <text x={dayX(m)} y={H - 3 * k} text-anchor={m === 0 ? "start" : m === 1440 ? "end" : "middle"} class:night={m >= night.from && m < night.to}>{String(h).padStart(2, "0")}</text>
          {/each}
        {:else}
          <ChartAxis {ticks} {yAt} {x0} {x1} y0={cy0} y1={cy1} title="Lost" format={(v) => `${Math.round(v * 100)}%`} />
          <MarkerLines {marks} y0={cy0} y1={top + 2 * k} />
          {#each columns as c, i (c.day)}
            {@const lostParts = c.t.parts.filter((p) => p.lost)}
            {#if c.day === chosen}<rect x={x0 + slot * i} y={cy1} width={slot} height={cy0 - cy1} rx={3 * k} fill="#ffffff" opacity=".045" />{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g class="col pressdim" onclick={() => !c.future && pick(c.day)}>
              <rect x={x0 + slot * i} y={cy1} width={slot} height={cy0 - cy1} fill="transparent"><title>{shortDate(c.day, today)}: {c.t.len ? `${pct(c.share)} of ${c.t.len - c.t.none} planned min lost` : "no time blocks"}</title></rect>
              {#if c.share && lostParts.length}
                {@render bar(xc(i) - bw / 2, yAt(c.share), bw, cy0 - yAt(c.share), lostParts, true, `c${i}`, `${shortDate(c.day, today)}: ${pct(c.share)} of ${c.t.len - c.t.none} planned min lost (${partsText(lostParts)})`)}
              {/if}
            </g>
            {#if span === "week"}<text x={xc(i)} y={H - 3 * k} text-anchor="middle" class:chosen={c.day === chosen}>{WEEKDAYS[i]}</text>
            {:else if c.day === chosen || (i % 7 === 0 && Math.abs(columns.findIndex((x) => x.day === chosen) - i) > 3)}<text x={xc(i)} y={H - 3 * k} text-anchor="middle" class:chosen={c.day === chosen}>{shortDate(c.day, today)}</text>{/if}
          {/each}
        {/if}
      </svg>
    </div>
    {/key}
    <Legend items={legend} scale={listColors.length ? { from: "", colors: listColors, to: "Distraction" } : undefined} />
  {/if}
</TrendCard>

<style>
  .col { cursor: pointer; transition: var(--press); }
  /* Two classes deep, to outrank TrendCard's axis-ink for chart text. */
  svg.chart text.share { fill: var(--muted); }
  svg.chart .big { fill: var(--ink); font-weight: 700; font-size: calc(13px * var(--k, 1)); }
  svg.chart text.night { fill: var(--night); }
  svg.chart text.chosen { fill: var(--ink); font-weight: 700; }
</style>
