<script lang="ts">
  // Did planned time go where it was planned? Time blocks from a task manager
  // (a task with a start time and a duration), each split by what the
  // devices saw: Distraction in each blocklist's color, in a source (green),
  // elsewhere (other apps, or away from devices: the empty square, neutral),
  // and no data (the hour charts' hatching). As on Distraction time, the
  // minutes an Unlock was open are a salmon outline, with the Distraction
  // used in it filled inside; an Unlock left unused costs nothing, and its
  // minutes show as whatever the devices saw. Distraction outside any Unlock
  // (a device that wasn't enforcing) is filled with no outline. Only
  // Distraction counts as lost, and nothing says source time belonged to its
  // task. The headline, on the bar across the top, is the share of planned
  // time lost in what's in view, leaving out no data; lower is better.
  //
  // Day: the picked Day's blocks at their times on the 06:00 to 06:00 Day,
  // Curfew shaded, each a column split by its minutes (bottom to top: what
  // the Unlocks held, then Distraction outside them, sources, elsewhere, and
  // no data), with a check over each done block. Week and Month: a column
  // per Day, as tall as the share lost, split by blocklist with the
  // Distraction inside Unlocks at the bottom, the Unlocks' share outlined,
  // Markers as thin lines, the picked Day lit. Day, Week, and Month switch
  // with the other cards.
  //
  // The Ledger gives each block's minutes exactly: Distraction, sources,
  // other, and unknown, and of them what lay inside an Unlock. Devices don't
  // say which app each Distraction minute was in, so it's shared among
  // blocklists by the Day's Distraction minutes. On a Day some device sent
  // Distraction minutes without their times (older Enforcers), or none sent
  // any (Windows), Distraction isn't known: its elsewhere shows as no data.
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
  import { fullSplit } from "../../api";
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
  /** One part of a bar: `open` if it lay inside an Unlock, `lost` if Distraction. */
  type Part = { key: string; name: string; fill: string; m: number; lost: boolean; open: boolean };
  type Total = { len: number; none: number; lost: number; unlocked: number; unlockedNone: number; parts: Part[] };
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
  /** Bottom to top (left to right on the headline): inside Unlocks, Distraction by blocklist, then sources,
   *  elsewhere, and no data; then outside them, Distraction by blocklist, sources, elsewhere, and no data. */
  const RANK = ["u:list", "u:sources", "u:other", "u:none", "list", "sources", "other", "none"];
  const rankOf = (p: Part) => RANK.indexOf(p.key.startsWith("u:list") ? "u:list" : p.key.startsWith("list") ? "list" : p.key);
  /** Whether a Day's Distraction is known: false when some device sent its minutes without their times, or none sent any. */
  const spansKnown = (d: DayTotal) => d.distraction_spans != null;
  /** A block's parts, in RANK order. */
  function partsOf(b: PlannedBlock, d: DayTotal): Part[] {
    const s = fullSplit(b, d.unlocks ?? []);
    const known = spansKnown(d);
    const lists = minutesByList(d.used, d.used_lists, blocklists);
    const byList = (m: number, open: boolean): Part[] => lists.length
      ? share(m, lists.map((l) => l.minutes)).map((n, i) => ({ key: `${open ? "u:" : ""}list:${lists[i].id}`, name: lists[i].name, fill: lists[i].color, m: n, lost: true, open }))
      : [{ key: `${open ? "u:" : ""}list:~other`, name: "Distraction", fill: "var(--other)", m, lost: true, open }];
    // Elsewhere on a Day whose Distraction isn't known could have been Distraction: no data.
    const rest = (sources: number, other: number, none: number, open: boolean): Part[] => [
      { key: open ? "u:sources" : "sources", name: "in sources", fill: "var(--voucher)", m: sources, lost: false, open },
      { key: open ? "u:other" : "other", name: "elsewhere", fill: "var(--heat-0)", m: known ? other : 0, lost: false, open },
      { key: open ? "u:none" : "none", name: "no data", fill: hatch, m: none + (known ? 0 : other), lost: false, open },
    ];
    return [
      ...byList(s.distraction_unlocked, true),
      ...rest(s.unlocked_sources, s.unlocked_other, s.unlocked_unknown, true),
      ...byList(s.distraction - s.distraction_unlocked, false),
      ...rest(s.sources - s.unlocked_sources, s.other - s.unlocked_other, s.unknown - s.unlocked_unknown, false),
    ].filter((p) => p.m > 0);
  }
  function totalOf(blocks: { b: PlannedBlock; d: DayTotal }[]): Total {
    const parts = new Map<string, Part>();
    let len = 0;
    for (const { b, d } of blocks) {
      len += b.minutes;
      for (const p of partsOf(b, d)) { const q = parts.get(p.key); if (q) q.m += p.m; else parts.set(p.key, { ...p }); }
    }
    const list = [...parts.values()].sort((a, b) => rankOf(a) - rankOf(b));
    const sum = (f: (p: Part) => boolean) => list.filter(f).reduce((a, p) => a + p.m, 0);
    return { len, parts: list, none: sum((p) => p.key.endsWith("none")), lost: sum((p) => p.lost),
      unlocked: sum((p) => p.open), unlockedNone: sum((p) => p.key === "u:none") };
  }
  const shareOf = (t: Total) => (t.len - t.none > 0 ? t.lost / (t.len - t.none) : null);
  /** The share of planned time with data that an Unlock was open for. */
  const openShareOf = (t: Total) => (t.len - t.none > 0 ? (t.unlocked - t.unlockedNone) / (t.len - t.none) : 0);
  const pct = (x: number | null) => (x === null ? "–" : `${Math.round(x * 100)}%`);
  const blocksOn = (day: string) => { const d = byDay.get(day); return d ? (d.planned ?? []).map((b) => ({ b, d })) : []; };
  const total = $derived(totalOf(period.flatMap(blocksOn)));
  const lostShare = $derived(shareOf(total));
  /** "12 min Distraction (8 in Unlocks), 30 min in sources, ...; Unlocks open 15 min." */
  function partsText(parts: Part[]): string {
    const sum = (f: (p: Part) => boolean) => parts.filter(f).reduce((a, p) => a + p.m, 0);
    const lost = sum((p) => p.lost), lostOpen = sum((p) => p.lost && p.open), open = sum((p) => p.open);
    const named = [
      lost ? `${lost} min Distraction${lostOpen ? ` (${lostOpen} in Unlocks)` : ""}` : "",
      ...(["sources", "other", "none"] as const).map((k) => { const m = sum((p) => p.key === k || p.key === `u:${k}`); return m ? `${m} min ${parts.find((p) => p.key.endsWith(k))!.name}` : ""; }),
    ].filter(Boolean).join(", ");
    return open ? `${named}; Unlocks open ${open} min` : named;
  }
  /** The part of `parts` stacked before the first one outside Unlocks: how far the outline reaches. */
  const openOf = (parts: Part[]) => parts.findIndex((p) => !p.open) === -1 ? parts.length : parts.findIndex((p) => !p.open);

  // ---- Drawing ----
  const W = 600;
  const H = $derived(fit ? drawHeight(pw, ph, 190) : 190);
  const k = $derived(W / (pw || W));
  /** The headline bar across the top, and the share at its right; it sits a little down, for its outline. */
  const BAR = $derived(10 * k);
  const HY = $derived(3 * k);
  const headW = $derived(78 * k);
  const top = $derived(HY + BAR + 10 * k);

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
  const maxShare = $derived(Math.max(0.2, Math.ceil(Math.max(0, ...columns.flatMap((c) => [c.share ?? 0, openShareOf(c.t)])) * 10) / 10));
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

  /** The colors of the blocklists drawn, for the legend's Distraction key. */
  const listColors = $derived([...new Set(total.parts.filter((p) => p.lost).map((p) => p.fill))]);
  const legend = $derived<LegendItem[]>(span === "day" ? [
    { kind: "frame", color: "var(--spend)", label: "Unlocked" },
    { kind: "box", color: "var(--voucher)", label: "In sources" },
    { kind: "box", color: "var(--heat-0)", label: "Elsewhere" },
    { kind: "hatch", label: "No data" },
  ] : [{ kind: "frame", color: "var(--spend)", label: "Unlocked" }, ...markerKeys(marks)]);
</script>

{#snippet bar(x: number, y: number, w: number, h: number, parts: Part[], vertical: boolean, id: string, title: string, open: number = 0, pad: number = 2 * k)}
  {@const sum = parts.reduce((a, p) => a + p.m, 0)}
  {@const room = (vertical ? h : w) - (parts.length - 1) * k}
  {@const at = (i: number) => parts.slice(0, i).reduce((a, q) => a + (room * q.m) / sum + k, 0)}
  <clipPath id="{uid}-{id}"><rect {x} {y} width={Math.max(0, w)} height={Math.max(0, h)} rx={Math.min(3 * k, w / 2, h / 2)} /></clipPath>
  <g clip-path="url(#{uid}-{id})"><title>{title}</title>
    {#each parts as p, i (p.key)}
      {@const before = at(i)}
      {@const L = Math.max(0, (room * p.m) / sum)}
      {#if vertical}<rect {x} y={y + h - before - L} width={w} height={L} style="fill: {p.fill}" />
      {:else}<rect x={x + before} {y} width={L} height={h} style="fill: {p.fill}" />{/if}
    {/each}
  </g>
  <!-- What the Unlocks held: the parts before `open`, outlined as Distraction time outlines them. -->
  {#if open > 0 && sum}
    {@render outline(vertical, vertical ? x : y, vertical ? w : h, vertical ? y + h : x, at(open) - k, pad)}
  {/if}
{/snippet}

<!-- The salmon outline of the minutes Unlocks were open: open at the baseline (`base`, the bottom of a
     column or the left of the headline), `pad` wider each side, with a heavier far edge, as on Distraction time. -->
{#snippet outline(vertical: boolean, across: number, thick: number, base: number, reach: number, pad: number = 2 * k)}
  {#if reach > 0}
    {@const a = across - pad}
    {@const z = across + thick + pad}
    {@const r = Math.min(4 * k, reach / 2, (z - a) / 2)}
    {#if vertical}
      {@const t = base - reach}
      <path class="allow" d="M{a} {base}V{t + r}Q{a} {t} {a + r} {t}H{z - r}Q{z} {t} {z} {t + r}V{base}" stroke-width={1.5 * k} />
      <line class="allow" x1={a + r} x2={z - r} y1={t + 0.5 * k} y2={t + 0.5 * k} stroke-width={2.5 * k} />
    {:else}
      {@const t = base + reach}
      <path class="allow" d="M{base} {a}H{t - r}Q{t} {a} {t} {a + r}V{z - r}Q{t} {z} {t - r} {z}H{base}" stroke-width={1.5 * k} />
      <line class="allow" y1={a + r} y2={z - r} x1={t - 0.5 * k} x2={t - 0.5 * k} stroke-width={2.5 * k} />
    {/if}
  {/if}
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
        <defs><pattern id="{uid}-hatch" width={7 * k} height={7 * k} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={3 * k} height={7 * k} fill="var(--hatch)" /></pattern></defs>
        <!-- The headline: everything planned in view, split the same way, and the share lost. -->
        {#if total.len}
          {@render bar(2.5 * k, HY, W - headW - 2.5 * k, BAR, total.parts, false, "all", `${partsText(total.parts)}; ${pct(lostShare)} of planned time with data lost`, openOf(total.parts))}
        {:else}
          <rect x={2.5 * k} y={HY} width={W - headW - 2.5 * k} height={BAR} rx={3 * k} style="fill: var(--heat-0)" />
        {/if}
        <text class="share" x={W} y={HY + BAR - 0.5 * k} text-anchor="end"><tspan class="big">{total.len ? pct(lostShare) : "none"}</tspan>{total.len ? " lost" : ""}</text>
        {#if span === "day"}
          {@const bTop = top + 10 * k}
          {@const bBottom = H - 15 * k}
          <rect x={dayX(night.from)} y={top} width={dayX(night.to) - dayX(night.from)} height={bBottom - top} style="fill: var(--night-band)" />
          {#each Array.from({ length: 8 }, (_, i) => i * 180) as m (m)}<line x1={dayX(m)} x2={dayX(m)} y1={bTop} y2={bBottom} stroke="var(--divider)" stroke-width={k} />{/each}
          {#each dayBlocks as blk, i (i)}
            {@const a = dayX(blk.a)}
            {@const w = Math.max(2 * k, dayX(blk.z) - a - k)}
            {@const lost = shareOf(totalOf([{ b: blk.b, d: byDay.get(chosen)! }]))}
            {@render bar(a, bTop, w, bBottom - bTop, blk.parts, true, `b${i}`, `${clock(blk.b.start, timeZone)}, ${blk.b.minutes} min${blk.b.done_at ? ", done" : ""}: ${partsText(blk.parts)}; ${pct(lost)} lost`, openOf(blk.parts), 0.75 * k)}
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
            {#if c.day === chosen}<rect x={x0 + slot * i} y={cy1} width={slot} height={cy0 - cy1} rx={3 * k} fill="var(--select)" />{/if}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g class="col pressdim" onclick={() => !c.future && pick(c.day)}>
              <rect x={x0 + slot * i} y={cy1} width={slot} height={cy0 - cy1} fill="transparent"><title>{shortDate(c.day, today)}: {c.t.len ? `${pct(c.share)} of ${c.t.len - c.t.none} planned min lost` : "no time blocks"}</title></rect>
              {#if c.share && lostParts.length}
                {@render bar(xc(i) - bw / 2, yAt(c.share), bw, cy0 - yAt(c.share), lostParts, true, `c${i}`, `${shortDate(c.day, today)}: ${pct(c.share)} of ${c.t.len - c.t.none} planned min lost (${partsText(c.t.parts)})`)}
              {/if}
              <!-- The Unlocks' share, outlined from the baseline: Distraction past its top was used outside them. -->
              {@render outline(true, xc(i) - bw / 2, bw, cy0, cy0 - yAt(openShareOf(c.t)))}
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
  .allow { fill: none; stroke: var(--spend); pointer-events: none; }
  /* Two classes deep, to outrank TrendCard's axis-ink for chart text. */
  svg.chart text.share { fill: var(--muted); }
  svg.chart .big { fill: var(--ink); font-weight: 700; font-size: calc(13px * var(--k, 1)); }
  svg.chart text.night { fill: var(--night); }
  svg.chart text.chosen { fill: var(--ink); font-weight: 700; }
</style>
