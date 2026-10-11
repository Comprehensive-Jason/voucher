<script lang="ts">
  // Does doing one thing go with another going better? For each source (and
  // the two minute trackers, Distraction and Time unlocked), the Days it
  // happened against the Days it didn't, on the same Day and the Day after:
  // did another source earn more, or did Distraction or unlocking run lower?
  // Plain averages, no guessing at causes. A finding shows when both groups
  // have at least 8 Days and the change is at least a quarter of that
  // measure's usual level (its average over both groups) and at least half a
  // Voucher or minute; every finding that passes shows, worse ones too. The
  // Daily goal is left out, since finishing more always meets it sooner, and
  // the two trackers aren't compared with each other (Distraction needs an
  // Unlock). Confidence comes from lib/correlate.ts: how often sliding the
  // driver's Days along the calendar gives a gap as big, corrected for every
  // pair the card tests. Findings are grouped by what changed, groups by how
  // much changed in all (each change as a share of its usual level), largest
  // first.
  //
  // One-third slot (and the phone): group boxes in two columns that each keep
  // their own height, scrolling, with a fade while more is below. Two-thirds:
  // one row a finding on a shared set of gridlines, Vouchers labelled above,
  // minutes below, each axis fitted to its own values; a hollow dot for Days
  // without, a filled one for Days with.
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "../../notes.svelte";
  import { styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  import { flash } from "../../toast.svelte";
  import { correlate, type Tested } from "../../correlate";
  import type { DayTotal } from "../../types";

  // Placeholders: Jason is picking the final colors for the two trackers.
  const DISTRACTION_COLOR = "#c8cbce";
  const UNLOCKED_COLOR = "#ffa09c";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const MIN = 8;
  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));

  type Unit = "vouchers" | "minutes";
  /** Something that can be a driver (it happened on a Day, or didn't) and an outcome (how much, that Day). */
  type Thing = { id: string; name: string; color: string; unit: Unit; days: string; after: string; value: (d: DayTotal) => number; did: (d: DayTotal) => number };
  const distracted = (d: DayTotal) => (measured(d) ? Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) : NaN);
  const happened = (v: number) => (Number.isNaN(v) ? -1 : v > 0 ? 1 : 0);
  const sources = $derived([...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))]);
  const things = $derived<Thing[]>([
    ...sources.map((id): Thing => {
      const s = styleOf(id);
      const value = (d: DayTotal) => d.by_source?.[id] ?? 0;
      return { id, name: s.name, color: s.color, unit: "vouchers", days: `${s.short} Days`, after: `Day after ${s.short}`, value, did: (d) => happened(value(d)) };
    }),
    { id: "~used", name: "Distraction", color: DISTRACTION_COLOR, unit: "minutes", days: "Distraction Days", after: "Day after Distraction", value: distracted, did: (d) => happened(distracted(d)) },
    { id: "~unlocked", name: "Time unlocked", color: UNLOCKED_COLOR, unit: "minutes", days: "Unlock Days", after: "Day after an Unlock", value: (d) => d.unlocked_minutes ?? NaN, did: (d) => happened(d.unlocked_minutes ?? NaN) },
  ]);
  const byId = $derived(new Map(things.map((t) => [t.id, t])));
  const tracker = (id: string) => id.startsWith("~");

  const tested = $derived(correlate(
    days.map((d) => d.day),
    things.map((t) => ({ id: t.id, did: days.map(t.did) })),
    things.map((t) => ({ id: t.id, values: days.map(t.value) })),
    { min: MIN, skip: (a, b) => tracker(a) && tracker(b) },
  ));
  type Group = { outcome: Thing; findings: Tested[] };
  const groups = $derived.by((): Group[] => {
    const by = new Map<string, Tested[]>();
    for (const t of tested) if (t.shown) by.set(t.outcome, [...(by.get(t.outcome) ?? []), t]);
    const total = (list: Tested[]) => list.reduce((a, t) => a + t.share, 0);
    return [...by]
      .sort((a, b) => total(b[1]) - total(a[1]))
      .map(([id, list]) => ({ outcome: byId.get(id)!, findings: list.sort((a, b) => b.share - a.share) }));
  });
  /** Outcomes with something to compare but no finding yet. */
  const quiet = $derived(things.filter((t) => !groups.some((g) => g.outcome.id === t.id) && days.some((d) => !Number.isNaN(t.value(d)))));
  /** Each source's Days with and without, for the empty state's meters. */
  const progress = $derived(sources.map((id) => {
    const withN = days.filter((d) => (d.by_source?.[id] ?? 0) > 0).length;
    return { thing: byId.get(id)!, withN, withoutN: days.length - withN };
  }));

  const key = (f: Tested) => `${f.driver}|${f.outcome}|${f.lag}`;
  const better = (f: Tested, o: Thing) => (o.unit === "vouchers" ? f.withAvg > f.withoutAvg : f.withAvg < f.withoutAvg);
  const num = (v: number, u: Unit) => (u === "vouchers" ? v.toFixed(1) : String(Math.round(v)));
  /** The change, signed with a real minus: "+0.8", or "−18 min". */
  const change = (f: Tested, u: Unit) => {
    const d = f.withAvg - f.withoutAvg;
    return `${d < 0 ? "−" : "+"}${num(Math.abs(d), u)}${u === "minutes" ? " min" : ""}`;
  };
  const LEVEL = ["", "Low", "Medium", "High"];
  /** What the bars mean, with this finding's own numbers. */
  function why(f: Tested): string {
    const d = byId.get(f.driver)!;
    const times = f.extreme === 0 ? `in none of ${f.shifts} tries` : `in ${f.extreme} of ${f.shifts} tries`;
    const what = `${LEVEL[f.confidence]} confidence: sliding the ${d.days} along the calendar gave a gap this big ${times}`;
    const m = tested.length;
    return f.confidence === 3 ? `${what}, rare enough to hold up across the ${m} pairs this card checks.`
      : f.confidence === 2 ? `${what}. Across the ${m} pairs this card checks, a few that rare would be luck.`
      : `${what}. Across the ${m} pairs this card checks, that could well be luck.`;
  }
  const list = (names: string[]) => names.length < 3 ? names.join(" or ") : `${names.slice(0, -1).join(", ")}, or ${names.at(-1)}`;

  // Which layout: two columns of boxes once the card has the width, and the
  // two-thirds scale once it has the height too (a phone keeps the boxes, in
  // one column, at any height).
  let bodyH = $state(0), bodyW = $state(0);
  const twoCols = $derived(bodyW >= 440);
  const tall = $derived(fit && twoCols && bodyH > 420);

  // The two-thirds scale: each unit on its own round maximum over the same
  // six lines, so every value fits.
  const STEPS = 5;
  function niceMax(v: number): number {
    if (!(v > 0)) return 0;
    const raw = v / STEPS, p = 10 ** Math.floor(Math.log10(raw));
    return [1, 2, 5, 10].map((m) => m * p).find((s) => s >= raw - 1e-9)! * STEPS;
  }
  const maxOf = (u: Unit) => niceMax(Math.max(0, ...groups.filter((g) => g.outcome.unit === u).flatMap((g) => g.findings.flatMap((f) => [f.withAvg, f.withoutAvg]))));
  const vMax = $derived(maxOf("vouchers"));
  const mMax = $derived(maxOf("minutes"));
  const ticks = (max: number) => (max ? Array.from({ length: STEPS + 1 }, (_, i) => String(+((max / STEPS) * i).toFixed(2))) : []);

  // Value labels above the dots. JetBrains Mono is 0.6em a letter, so a
  // label's width is known without measuring. Labels that would touch are
  // pushed apart, each away from the other; none leaves the track.
  const LABEL_PX = 10, GAP = 4, COLS = 128 + 82 + 2 * 10;
  let rowsW = $state(0);
  const trackW = $derived(Math.max(0, rowsW - COLS));
  const wide = (s: string) => s.length * 0.6 * LABEL_PX;
  function labels(xa: number, ta: string, xb: number, tb: string): [number, number] {
    const W = trackW, wa = wide(ta), wb = wide(tb);
    const flip = xb < xa;
    const [x1, w1, x2, w2] = flip ? [xb, wb, xa, wa] : [xa, wa, xb, wb];
    let l1 = x1 - w1 / 2, l2 = x2 - w2 / 2;
    if (l1 + w1 + GAP > l2) { const mid = (x1 + x2) / 2; l1 = mid - GAP / 2 - w1; l2 = mid + GAP / 2; }
    l1 = Math.max(0, Math.min(l1, W - w1 - GAP - w2));
    l2 = Math.min(Math.max(l2, l1 + w1 + GAP), W - w2);
    return flip ? [l2, l1] : [l1, l2];
  }

  // The fade at the bottom shows only while more is below.
  let scroller = $state<HTMLElement>();
  let more = $state(false);
  $effect(() => {
    // Reading the groups re-checks when they change.
    if (!scroller || !groups.length) return;
    const el = scroller;
    const check = () => (more = el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    for (const child of el.children) ro.observe(child);
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  });
</script>

{#snippet bars(f: Tested)}
  <button class="conf" aria-label="{LEVEL[f.confidence]} confidence" onclick={(e) => flash(why(f), e.currentTarget)}>
    <i class:on={f.confidence >= 1} style="height: 5px"></i><i class:on={f.confidence >= 2} style="height: 8px"></i><i class:on={f.confidence >= 3} style="height: 11px"></i>
  </button>
{/snippet}

{#snippet pill(f: Tested, o: Thing)}
  <b class="pill" class:good={better(f, o)} class:low={f.confidence === 1}>{change(f, o.unit)}</b>
{/snippet}

{#snippet split(f: Tested, w: number)}
  {@const share = Math.round((w - 2) * (f.withoutN / (f.withN + f.withoutN)))}
  <span class="split" aria-label="{f.withoutN} Days without, {f.withN} with">
    <span>{f.withoutN}</span>
    <span class="sbar" style="width: {w}px"><i class="without" style="width: {Math.max(3, share)}px"></i><i class="with"></i></span>
    <span>{f.withN} Days</span>
  </span>
{/snippet}

{#snippet arrow(good: boolean)}
  <svg class="arrow" class:worse={!good} width="16" height="8" viewBox="0 0 16 8" aria-hidden="true"><path d="M1 4 H13" /><path d="M10 1 L14.5 4 L10 7" fill="none" /></svg>
{/snippet}

{#snippet who(f: Tested)}
  {@const d = byId.get(f.driver)!}
  <span class="who"><i style="background: {d.color}"></i><span>{f.lag ? d.after : d.days}</span></span>
{/snippet}

<!-- The key's two-colored marks: crimson for worse, green for better, a thin slash where they meet. -->
{#snippet both(head: boolean)}
  <svg class="both" width="22" height="10" viewBox="0 0 22 10" aria-hidden="true">
    <path class="w" d="M1 5 H10" /><path class="g" d="M12 5 H{head ? 19 : 21}" />
    {#if head}<path class="g head" d="M16.5 2 L20.5 5 L16.5 8" />{/if}
    <path class="slash" d="M10.2 9 L12.2 1" />
  </svg>
{/snippet}

{#snippet glyph()}
  <span class="conf glyph" aria-hidden="true"><i class="on" style="height: 5px"></i><i class="on" style="height: 8px"></i><i style="height: 11px"></i></span>
{/snippet}

<TrendCard title="What goes with a good Day">
  <div class="body" class:fit bind:clientHeight={bodyH} bind:clientWidth={bodyW}>
    {#if !groups.length}
      {@const short = progress.filter((p) => Math.min(p.withN, p.withoutN) < MIN)}
      {#if short.length || !progress.length}
        <p class="empty">Needs more Days. Each activity needs {MIN} Days with it and {MIN} without before this can compare them.</p>
        {#if short.length}
          <div class="meters" class:fit>
            {#each short as p (p.thing.id)}
              {@const without = p.withoutN < p.withN}
              {@const n = Math.min(p.withN, p.withoutN)}
              <div class="meter">
                <span class="who"><i style="background: {p.thing.color}"></i><span>{p.thing.name}</span></span>
                <span class="bar"><i style="width: {(n / MIN) * 100}%; background: {p.thing.color}"></i></span>
                <span class="count">{n} of {MIN} Days {without ? "without" : "with"}</span>
              </div>
            {/each}
          </div>
        {/if}
      {:else}
        <p class="empty">Nothing stands out yet: no activity goes with a change of a quarter or more in another.</p>
      {/if}
    {:else if !tall}
      <div class="scroller" class:fit class:more bind:this={scroller}>
        <div class="boxes" class:two={twoCols}>
          {#each groups as g (g.outcome.id)}
            <section class="box">
              <h3><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.unit === "vouchers" ? "Vouchers" : "minutes"} a Day</span></h3>
              {#each g.findings as f (key(f))}
                {@const good = better(f, g.outcome)}
                <div class="finding">
                  <div class="line1">{@render who(f)}<span class="end">{@render pill(f, g.outcome)}{@render bars(f)}</span></div>
                  <div class="line2"><span class="vals"><span class="was">{num(f.withoutAvg, g.outcome.unit)}</span>{@render arrow(good)}<span>{num(f.withAvg, g.outcome.unit)}</span></span>{@render split(f, 60)}</div>
                </div>
              {/each}
            </section>
          {/each}
        </div>
      </div>
    {:else}
      <div class="axis top">
        <span class="name">{vMax ? "Vouchers a Day" : ""}</span>
        <span class="ticks">{#each ticks(vMax) as t, i (i)}<span style="left: {i * 20}%" class:first={i === 0} class:last={i === STEPS}>{t}</span>{/each}</span>
      </div>
      <div class="mid">
        <div class="grid" aria-hidden="true">{#each { length: STEPS + 1 } as _, i (i)}<i style="left: {i * 20}%"></i>{/each}</div>
        <div class="rows" class:more bind:this={scroller} bind:clientWidth={rowsW}>
          {#each groups as g (g.outcome.id)}
            <h3 class="ghead"><span><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.unit === "vouchers" ? "Vouchers" : "minutes"}</span></span></h3>
            {#each g.findings as f (key(f))}
              {@const u = g.outcome.unit}
              {@const max = u === "vouchers" ? vMax : mMax}
              {@const a = (f.withoutAvg / max) * trackW}
              {@const b = (f.withAvg / max) * trackW}
              {@const ta = num(f.withoutAvg, u)}
              {@const tb = `${num(f.withAvg, u)}${u === "minutes" ? " min" : ""}`}
              {@const at = labels(a, ta, b, tb)}
              {@const good = better(f, g.outcome)}
              {@const color = byId.get(f.driver)!.color}
              <div class="row">
                <div class="left">{@render who(f)}{@render split(f, 50)}</div>
                <div class="track">
                  <span class="label was" style="left: {at[0]}px">{ta}</span>
                  <span class="label" style="left: {at[1]}px">{tb}</span>
                  <span class="line" class:worse={!good} style="left: {Math.min(a, b)}px; width: {Math.abs(b - a)}px"></span>
                  <span class="dot hollow" style="left: {a}px; border-color: {color}"></span>
                  <span class="dot" style="left: {b}px; background: {color}"></span>
                </div>
                <span class="end">{@render pill(f, g.outcome)}{@render bars(f)}</span>
              </div>
            {/each}
          {/each}
        </div>
      </div>
      <div class="axis bottom">
        <span class="name">{mMax ? "Minutes a Day" : ""}</span>
        <span class="ticks">{#each ticks(mMax) as t, i (i)}<span style="left: {i * 20}%" class:first={i === 0} class:last={i === STEPS}>{t}</span>{/each}</span>
      </div>
      <div class="key">
        <span><i class="ring"></i>Days without</span>
        <span><i class="disc"></i>Days with</span>
        <span>worse {@render both(false)} better</span>
        <span>{@render glyph()}confidence</span>
      </div>
      {#if quiet.length}
        {@const vouchersOnly = quiet.every((t) => t.unit === "vouchers")}
        <p class="quiet">Nothing stands out yet for {#each quiet as t, i (t.id)}{i ? (i === quiet.length - 1 ? (quiet.length > 2 ? ", or " : " or ") : ", ") : ""}<b><i style="background: {t.color}"></i>{t.name}</b>{/each}{vouchersOnly ? " Vouchers" : ""}</p>
      {/if}
    {/if}
  </div>
  {#snippet foot()}
    {#if tall}From {days.length} Days. Correlations, not causes.
    {:else}<span class="keyline"><span>Without {@render both(true)} with</span><span>worse {@render both(false)} better</span><span>{@render glyph()}confidence</span><span class="nb">Correlations, not causes.</span></span>{/if}
  {/snippet}
</TrendCard>

<style>
  .body { display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .body.fit { flex: 1; min-height: 0; }

  /* A driver: its dot and "Anki Days" or "Day after Workout". */
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }
  .who i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* The change: green on a green tint when better, ink on crimson when worse;
     a Low-confidence one is only outlined, so the weakest isn't the loudest. */
  .pill { font: 700 11px/1 var(--mono); padding: 2px 5px; border: 1px solid transparent; border-radius: 6px; white-space: nowrap; color: var(--ink); background: var(--worse); }
  .pill.good { color: var(--voucher); background: color-mix(in oklab, var(--voucher) 13%, transparent); }
  .pill.low { background: none; border-color: var(--worse); }
  .pill.good.low { border-color: var(--voucher); }

  /* Confidence: three bars like a signal icon; a tap says what they mean. */
  .conf { display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; padding: 0; border: 0; background: none; cursor: pointer; }
  button.conf { position: relative; }
  /* A finger-sized target around the small glyph. */
  button.conf::after { content: ""; position: absolute; inset: -10px -8px; }
  .conf i { display: block; width: 3px; border-radius: 1px; background: var(--line); }
  .conf i.on { background: var(--muted); }
  .end { display: inline-flex; align-items: center; justify-self: end; gap: 6px; }

  /* Days without (hollow) and with (filled), as one bar split by count. */
  .split { display: inline-flex; align-items: center; gap: 4px; font: 500 9px var(--mono); color: var(--muted); white-space: nowrap; }
  .sbar { display: flex; gap: 2px; height: 5px; }
  .sbar i { display: block; height: 100%; border-radius: 1.5px; }
  .sbar .without { flex: none; border: 1px solid var(--axis-ink); }
  .sbar .with { flex: 1; min-width: 3px; background: var(--muted); }

  .arrow { flex: none; }
  .arrow path { stroke: var(--voucher); stroke-width: 1.6; stroke-linecap: round; stroke-linejoin: round; }
  /* Crimson is dim on the card (2.7:1), so its strokes are thicker. */
  .arrow.worse path { stroke: var(--worse); stroke-width: 2.4; }

  /* One-third: boxes in two columns that each keep their own height. */
  .scroller.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .scroller.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 30px), transparent); }
  .boxes { display: flex; flex-direction: column; gap: 8px; }
  .boxes.two { display: block; columns: 2; column-gap: 8px; }
  .boxes.two .box { break-inside: avoid; margin-bottom: 8px; }
  .box { display: flex; flex-direction: column; gap: 7px; padding: 7px 10px 8px; border-radius: 10px; background: var(--raised); }
  h3 { margin: 0; display: flex; align-items: baseline; gap: 6px; min-width: 0; font-size: 13px; font-weight: 700; color: var(--ink); }
  h3 i { flex: none; align-self: center; width: 10.5px; height: 10.5px; border-radius: 50%; }
  h3 b { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .unit { flex: none; font: 500 9px var(--mono); color: var(--muted); white-space: nowrap; }
  .finding { display: flex; flex-direction: column; gap: 3px; }
  .line1, .line2 { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-width: 0; }
  .vals { display: flex; align-items: center; gap: 5px; font: 600 11px var(--mono); color: var(--ink); white-space: nowrap; }
  .was { color: var(--muted); }

  /* Two-thirds: labels, the scale, then the pill and bars. */
  .axis, .row { display: grid; grid-template-columns: 128px minmax(0, 1fr) 82px; column-gap: 10px; }
  .axis { flex: none; align-items: center; height: 14px; }
  .axis.bottom { border-top: 1px solid var(--divider); padding-top: 4px; height: 19px; }
  .axis .name { font: 600 9px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); white-space: nowrap; }
  .ticks { position: relative; height: 12px; }
  .ticks span { position: absolute; top: 0; transform: translateX(-50%); font: 500 var(--axis-size)/12px var(--mono); color: var(--axis-ink); white-space: nowrap; }
  .ticks .first { transform: none; }
  .ticks .last { transform: translateX(-100%); }
  .mid { flex: 1; min-height: 0; position: relative; }
  /* The six gridlines, drawn once behind every row and pinned while they scroll. */
  .grid { position: absolute; inset: 0 92px 0 138px; pointer-events: none; }
  .grid i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .grid i:last-child { transform: translateX(-1px); }
  .rows { position: absolute; inset: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  /* Only the rows fade; the gridlines behind stay solid. */
  .rows.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent); }
  .ghead { flex: none; padding: 8px 0 2px; border-top: 1px solid var(--divider); font-size: 14px; }
  .ghead:first-child { border-top-color: transparent; padding-top: 4px; }
  /* A card-colored backing, so gridlines don't run through the letters. */
  .ghead > span { display: inline-flex; align-items: baseline; gap: 7px; min-width: 0; max-width: 100%; padding-right: 6px; background: var(--surface); }
  .ghead .unit { font-size: 10px; }
  /* Rows share out spare height when they fit; past that they scroll. */
  .row { flex: 1 0 auto; min-height: 44px; align-items: stretch; }
  .left { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
  .left .who { font-size: 13px; color: var(--ink); }
  .track { position: relative; }
  .track > span { position: absolute; }
  .dot { top: calc(50% + 6px); width: 11px; height: 11px; border-radius: 50%; transform: translate(-50%, -50%); }
  .dot.hollow { width: 10px; height: 10px; border: 1.8px solid; background: var(--surface); }
  .line { top: calc(50% + 5px); height: 2px; background: var(--voucher); }
  .line.worse { top: calc(50% + 4.5px); height: 3px; background: var(--worse); }
  .label { bottom: calc(50% - 6px + 8px); font: 600 10px/12px var(--mono); color: var(--ink); white-space: nowrap; }
  .label.was { color: var(--muted); }
  .row .end { align-self: center; }

  .key { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .key > span { display: inline-flex; align-items: center; gap: 6px; }
  .key .ring { width: 9px; height: 9px; border-radius: 50%; border: 1.6px solid var(--muted); }
  .key .disc { width: 10px; height: 10px; border-radius: 50%; background: var(--muted); }
  .both { flex: none; overflow: visible; }
  .both path { fill: none; stroke-width: 3; stroke-linecap: round; stroke-linejoin: round; }
  .both .w { stroke: var(--worse); }
  .both .g { stroke: var(--voucher); stroke-width: 2; }
  .both .head { stroke-width: 1.6; }
  .both .slash { stroke: var(--ink); stroke-width: 1.2; }

  .quiet { flex: none; margin: 0; padding: 7px 12px; border: 1.5px dashed var(--line); border-radius: 10px; font-size: 12.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .quiet b { color: var(--ink); }
  .quiet b i { display: inline-block; width: 7px; height: 7px; margin: 0 5px 1px 2px; border-radius: 50%; vertical-align: middle; }

  /* The one-third foot doubles as the key. */
  .keyline { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; font-size: 12px; }
  .keyline > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .keyline .nb { margin-left: auto; }

  /* Needs more Days: how far each source is from 8 Days each way. */
  .meters { display: flex; flex-direction: column; gap: 8px; }
  .meters.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .meter { display: grid; grid-template-columns: minmax(0, 120px) minmax(40px, 1fr) auto; align-items: center; gap: 10px; }
  .meter .who { color: var(--ink); font-size: 13px; }
  .count { font: 500 11px var(--mono); color: var(--muted); white-space: nowrap; }
</style>
