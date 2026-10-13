<script lang="ts">
  // Does doing one thing go with another going better? For each source, the
  // Days it earned against the Days it didn't, on the same Day and the Day
  // after, and a good night, a busy calendar, and late Distraction besides:
  // the drivers, outcomes, and their rules are in $core/goodDays.ts. Which
  // findings show, and how sure each is, comes from $core/correlate.ts (its
  // showing rule and confidence tiers), every pair corrected together.
  // Findings are grouped by what changed, groups by how much changed in all
  // (each change in its outcome's usual Day-to-Day spread), largest first.
  //
  // One-third slot (and the phone): group boxes in two columns that each keep
  // their own height, scrolling, with a fade while more is below. Two-thirds
  // and Full: one row a finding on one scale of ratios, fitted to the
  // findings ($core/panels/trends/goodDayAxes.ts); a hollow dot for Days
  // without, always at ×1, and a filled one for Days with.
  import TrendCard from "$core/components/TrendCard.svelte";
  import { fitsSlot } from "$core/fit.svelte";
  import { MIN_N, type Tested } from "$core/correlate";
  import { correlateOff } from "$core/correlateOff";
  import { curfew } from "$core/curfew.svelte";
  import { better, change, comparedDays, driverWords, findingKey as key, goodDaySetup, num, readOf, type Measure } from "$core/goodDays";
  import type { DayTotal } from "$core/types";
  import { scaleFor, type Axis } from "$core/panels/trends/goodDayAxes";

  let { history, timeZone = "UTC" }: { history: DayTotal[]; timeZone?: string } = $props();
  const fit = fitsSlot();
  // Finished Days the log still holds. A new history usually changes only
  // today, which this card leaves out, so when the finished Days read the
  // same as last time the same list is kept and nothing below is worked out
  // or sent to the worker again.
  let lastRead: string[] = [], lastDays: DayTotal[] = [];
  const days = $derived.by(() => {
    const next = comparedDays(history);
    const read = next.map(readOf);
    if (read.length === lastRead.length && read.every((r, i) => r === lastRead[i])) return lastDays;
    lastRead = read; lastDays = next;
    return next;
  });

  // The drivers, outcomes, and request ($core/goodDays.ts), with the Day
  // starting at Curfew's end on the Ledger's clock.
  const setup = $derived(goodDaySetup(days, timeZone, Math.round(curfew.end * 60)));
  const measures = $derived(setup.measures);
  const measureOf = $derived(setup.measureOf);
  const doerOf = $derived(setup.doerOf);

  // Worked out in the worker; until it answers, the card keeps its last
  // findings, or on the first load shows that it's comparing.
  let found = $state.raw<Tested[] | null>(null);
  $effect(() => {
    const r = setup.request;
    let wanted = true;
    correlateOff(r).then((t) => { if (wanted) found = t; });
    return () => { wanted = false; };
  });
  const tested = $derived(found ?? []);
  type Group = { outcome: Measure; findings: Tested[] };
  const groups = $derived.by((): Group[] => {
    const by = new Map<string, Tested[]>();
    for (const t of tested) if (t.shown) by.set(t.outcome, [...(by.get(t.outcome) ?? []), t]);
    const total = (list: Tested[]) => list.reduce((a, t) => a + t.effect, 0);
    return [...by]
      .sort((a, b) => total(b[1]) - total(a[1]))
      .map(([id, list]) => ({ outcome: measureOf.get(id)!, findings: list.sort((a, b) => b.effect - a.effect) }));
  });
  /** Outcomes with something to compare but no finding yet. */
  const quiet = $derived(measures.filter((m) => !groups.some((g) => g.outcome.id === m.id) && days.some((d) => !Number.isNaN(m.value(d)))));
  /** Each Day driver's Days with and without (those with data), for the empty state's meters. */
  const progress = $derived(setup.dayDrivers.flatMap((dr) => {
    const withN = dr.did.filter((x) => x === 1).length, withoutN = dr.did.filter((x) => x === 0).length;
    return withN + withoutN ? [{ name: dr.name, color: doerOf.get(dr.id)!.color, id: dr.id, withN, withoutN }] : [];
  }));
  /** Those still short of MIN_N Days on a side. */
  const short = $derived(progress.filter((p) => Math.min(p.withN, p.withoutN) < MIN_N));

  const LEVEL = ["Very low", "Low", "Medium", "High"];
  const noun = (f: Tested) => (f.per === "stretch" ? "stretches" : "Days");

  // Which layout: two columns of boxes once the card has the width, and the
  // two-thirds scale once it has the height too (a phone keeps the boxes, in
  // one column, at any height).
  let bodyH = $state(0), bodyW = $state(0);
  const twoCols = $derived(bodyW >= 440);
  const tall = $derived(fit && twoCols && bodyH > 420);
  /** Room left over (a Full card): the findings, then what's still short of Days. */
  const roomy = $derived(tall && bodyH > 760);

  // The two-thirds and Full scale: ratios, fitted to every finding shown.
  /** The track's width, which the scale fits its tick labels to. */
  let trackW = $state(0);
  const scale = $derived(scaleFor(groups.flatMap((g) => g.findings), trackW));

  // Value labels above the dots. JetBrains Mono is 0.6em a letter, so a
  // label's width is known without measuring. Labels that would touch are
  // pushed apart, each away from the other; none leaves the track.
  const LABEL_PX = 10, GAP = 4;
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
  /** Pixels across the track, pinned inside it. */
  const px = (frac: number) => Math.max(0, Math.min(1, frac)) * trackW;

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

<!-- Confidence, like a signal icon: one bar Low, two Medium, three High. -->
{#snippet bars(f: Tested)}
  <span class="conf" role="img" aria-label="{LEVEL[f.confidence]} confidence">
    <i class:on={f.confidence >= 1} style="height: 5px"></i><i class:on={f.confidence >= 2} style="height: 8px"></i><i class:on={f.confidence >= 3} style="height: 11px"></i>
  </span>
{/snippet}

{#snippet pill(f: Tested, o: Measure)}
  <b class="pill" class:good={better(f, o)}>{change(f, o.unit)}</b>
{/snippet}

{#snippet split(f: Tested, w: number)}
  {@const share = Math.round((w - 2) * (f.withoutN / (f.withN + f.withoutN)))}
  <span class="split" aria-label="{f.withoutN} {noun(f)} without, {f.withN} with">
    <span>{f.withoutN}</span>
    <span class="sbar" style="width: {w}px"><i class="without" style="width: {Math.max(3, share)}px"></i><i class="with"></i></span>
    <span>{f.withN} {noun(f)}</span>
  </span>
{/snippet}

{#snippet arrow(good: boolean)}
  <svg class="arrow" class:worse={!good} width="16" height="8" viewBox="0 0 16 8" aria-hidden="true"><path d="M1 4 H13" /><path d="M10 1 L14.5 4 L10 7" fill="none" /></svg>
{/snippet}

{#snippet who(f: Tested)}
  {@const d = doerOf.get(f.driver)!}
  <span class="who"><i style="background: {d.color}"></i><span>{driverWords(f, d)}</span></span>
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
  <span class="conf" aria-hidden="true"><i class="on" style="height: 5px"></i><i class="on" style="height: 8px"></i><i style="height: 11px"></i></span>
{/snippet}

<!-- The axis's row of ticks: its name in the label column, a factor on each gridline. -->
{#snippet axis(a: Axis)}
  <div class="axis">
    <span class="name">{a.name}</span>
    <span class="ticks">{#each a.ticks as t, i (i)}{#if t.text}<span style="left: {t.at * 100}%" class:first={t.at < 0.02} class:last={t.at > 0.98}>{t.text}</span>{/if}{/each}</span>
  </div>
{/snippet}

<!-- How far each activity still short of Days is from MIN_N each way. -->
{#snippet meters()}
  <div class="meters" class:fit>
    {#each short as p (p.id)}
      {@const without = p.withoutN < p.withN}
      {@const n = Math.min(p.withN, p.withoutN)}
      <div class="meter">
        <span class="who"><i style="background: {p.color}"></i><span>{p.name}</span></span>
        <span class="bar"><i style="width: {(n / MIN_N) * 100}%; background: {p.color}"></i></span>
        <span class="count">{n} of {MIN_N} Days {without ? "without" : "with"}</span>
      </div>
    {/each}
  </div>
{/snippet}

<TrendCard title="What goes with a good Day">
  <div class="body" class:fit bind:clientHeight={bodyH} bind:clientWidth={bodyW}>
    {#if !found}
      <p class="empty">Comparing your Days…</p>
    {:else if !groups.length}
      {#if short.length || !progress.length}
        <p class="empty">Needs more Days. Each activity needs {MIN_N} Days with it and {MIN_N} without before this can compare them.</p>
        {#if short.length}
          {@render meters()}
        {/if}
      {:else}
        <p class="empty">Nothing stands out yet: no activity goes with a change in anything else that is both big enough and steady enough to show.</p>
      {/if}
    {:else if !tall}
      <div class="scroller" class:fit class:more bind:this={scroller}>
        <div class="boxes" class:two={twoCols}>
          {#each groups as g (g.outcome.id)}
            <section class="box">
              <h3><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.unit === "vouchers" ? "Vouchers a Day" : g.outcome.note}</span></h3>
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
        <p class="aside">Correlations, not causes.</p>
      </div>
    {:else}
      <div class="edge">{@render axis(scale.axis)}</div>
      <div class="mid">
        <div class="grid" aria-hidden="true" bind:clientWidth={trackW}>{#each scale.grid as at, i (i)}<i class:zero={Math.abs(at - scale.zero) < 1e-6} class:end={at > 0.99} style="left: {at * 100}%"></i>{/each}</div>
        <div class="rows" class:more bind:this={scroller}>
          {#each groups as g (g.outcome.id)}
            <h3 class="ghead"><span><i style="background: {g.outcome.color}"></i><b>{g.outcome.name}</b><span class="unit">{g.outcome.note}</span></span></h3>
            {#each g.findings as f (key(f))}
              {@const u = g.outcome.unit}
              {@const [fa, fb] = scale.at(f)}
              {@const note = scale.note(f)}
              {@const a = px(fa)}
              {@const b = px(fb)}
              {@const ta = num(f.withoutAvg, u)}
              {@const tb = `${num(f.withAvg, u)}${u === "minutes" ? " min" : ""}${note ? ` ${note}` : ""}`}
              {@const at = labels(a, ta, b, tb)}
              {@const good = better(f, g.outcome)}
              {@const color = doerOf.get(f.driver)!.color}
              <div class="row">
                <div class="left">{@render who(f)}{@render split(f, 50)}</div>
                <div class="track">
                  <span class="label was" style="left: {at[0]}px">{ta}</span>
                  <span class="label" style="left: {at[1]}px">{tb}</span>
                  <span class="line" class:worse={!good} style="left: {Math.min(a, b)}px; width: {Math.abs(b - a)}px"></span>
                  <span class="dot hollow" style="left: {a}px; border-color: {color}"></span>
                  <span class="dot" style="left: {b}px; background: {color}"></span>
                  {#if fb > 1 || fb < 0}<span class="pinned" class:low={fb < 0} style="left: {b}px; color: {color}" aria-hidden="true">{fb > 1 ? "›" : "‹"}</span>{/if}
                  {#if fa > 1 || fa < 0}<span class="pinned" class:low={fa < 0} style="left: {a}px; color: {color}" aria-hidden="true">{fa > 1 ? "›" : "‹"}</span>{/if}
                </div>
                <span class="end">{@render pill(f, g.outcome)}{@render bars(f)}</span>
              </div>
            {/each}
          {/each}
        </div>
      </div>
      <div class="edge">{@render axis(scale.axis)}</div>
      <div class="key">
        <span><i class="ring"></i>Days without</span>
        <span><i class="disc"></i>Days with</span>
        <span>worse {@render both(false)} better</span>
        <span>{@render glyph()}confidence</span>
      </div>
      {#if quiet.length}
        {@const vouchersOnly = quiet.every((m) => m.unit === "vouchers")}
        <p class="quiet" class:wrap={roomy}>Nothing stands out yet for {#each quiet as m, i (m.id)}{i ? (i === quiet.length - 1 ? (quiet.length > 2 ? ", or " : " or ") : ", ") : ""}<b><i style="background: {m.color}"></i>{m.name}</b>{/each}{vouchersOnly ? " Vouchers" : ""}</p>
      {/if}
      {#if roomy && short.length}
        <p class="gather">Still gathering Days</p>
        {@render meters()}
      {/if}
    {/if}
  </div>
  {#snippet foot()}
    {#if tall}From {days.length} Days. Correlations, not causes.
    {:else}<span class="keyline"><span>Without {@render both(true)} with</span><span>worse {@render both(false)} better</span><span>{@render glyph()}confidence</span><span class="nb">Correlations, not causes.</span></span>{/if}
  {/snippet}
</TrendCard>

<style>
  /* The two-thirds columns: driver labels, the scale, then the pill and bars. */
  .body { --label-col: 158px; --end-col: 82px; --col-gap: 10px; display: flex; flex-direction: column; gap: 8px; min-width: 0; }
  .body.fit { flex: 1; min-height: 0; }

  /* A driver: its dot and "Anki Days" or "Day after Workout". */
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; font-size: 12px; color: var(--muted); }
  .who i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

  /* The change, one look at every confidence (the bars say how sure): its
     direction's color on a tint of it, green when better and crimson when
     worse. Crimson text is --worse-text, which reads at 4.9:1 on its wash
     and 5.0:1 on the card. */
  .pill { font: 700 11px/1 var(--mono); padding: 3px 5px; border-radius: 6px; white-space: nowrap; color: var(--worse-text); background: var(--worse-wash); }
  .pill.good { color: var(--voucher); background: var(--voucher-wash); }

  /* Confidence: three bars like a signal icon. */
  .conf { flex: none; display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; }
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
  .axis, .row { display: grid; grid-template-columns: var(--label-col) minmax(0, 1fr) var(--end-col); column-gap: var(--col-gap); }
  .axis { align-items: center; height: 14px; }
  .axis .name { font: 600 9px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .ticks { position: relative; height: 12px; }
  .ticks span { position: absolute; top: 0; transform: translateX(-50%); font: 500 var(--axis-size)/12px var(--mono); color: var(--axis-ink); white-space: nowrap; }
  .ticks .first { transform: none; }
  .ticks .last { transform: translateX(-100%); }
  /* As tall as its rows, down to what the card has left, then they scroll:
     a Full card with few findings keeps them, and the bottom axis, together
     at the top. */
  .mid { flex: 0 1 auto; min-height: 0; position: relative; display: flex; flex-direction: column; border-bottom: 1px solid var(--divider); }
  /* The gridlines, drawn once behind every row and pinned while they scroll. */
  .grid { position: absolute; inset: 0 calc(var(--end-col) + var(--col-gap)) 0 calc(var(--label-col) + var(--col-gap)); pointer-events: none; }
  .grid i { position: absolute; top: 0; bottom: 0; width: 1px; background: var(--line); }
  .grid i.end { transform: translateX(-1px); }
  /* ×1, no change, where every hollow dot sits. */
  .grid i.zero { background: var(--axis-ink); }
  .rows { position: relative; flex: 0 1 auto; min-height: 0; display: flex; flex-direction: column; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  /* Only the rows fade; the gridlines behind stay solid. */
  .rows.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 36px), transparent); }
  .ghead { flex: none; padding: 8px 0 2px; border-top: 1px solid var(--divider); font-size: 14px; }
  .ghead:first-child { border-top-color: transparent; padding-top: 4px; }
  /* A card-colored backing, so gridlines don't run through the letters. */
  .ghead > span { display: inline-flex; align-items: baseline; gap: 7px; min-width: 0; max-width: 100%; padding-right: 6px; background: var(--surface); }
  .ghead .unit { font-size: 10px; }
  .row { flex: none; min-height: 44px; align-items: stretch; }
  .left { display: flex; flex-direction: column; justify-content: center; gap: 3px; min-width: 0; }
  .left .who { font-size: 13px; color: var(--ink); }
  .track { position: relative; }
  .track > span { position: absolute; }
  .dot { top: calc(50% + 6px); width: 11px; height: 11px; border-radius: 50%; transform: translate(-50%, -50%); }
  .dot.hollow { width: 10px; height: 10px; border: 1.8px solid; background: var(--surface); }
  .line { top: calc(50% + 5px); height: 2px; background: var(--voucher); }
  .line.worse { top: calc(50% + 4.5px); height: 3px; background: var(--worse); }
  /* A change past the axis, pinned at its edge. */
  .pinned { top: calc(50% + 6px); transform: translate(5px, -55%); font: 700 13px/1 var(--mono); }
  .pinned.low { transform: translate(-13px, -55%); }
  .label { bottom: calc(50% - 6px + 8px); font: 600 10px/12px var(--mono); color: var(--ink); white-space: nowrap; }
  .label.was { color: var(--muted); }
  .row .end { align-self: center; }
  /* The axis across the top and bottom, outside the scroller. */
  .edge { flex: none; }

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
  .quiet.wrap { white-space: normal; }
  .quiet b { color: var(--ink); }
  .quiet b i { display: inline-block; width: 7px; height: 7px; margin: 0 5px 1px 2px; border-radius: 50%; vertical-align: middle; }

  /* The one-third foot doubles as the key. */
  .keyline { display: flex; align-items: center; gap: 4px 10px; flex-wrap: wrap; font-size: 12px; }
  .keyline > span { display: inline-flex; align-items: center; gap: 5px; white-space: nowrap; }
  .keyline .nb { margin-left: auto; }
  /* On a narrow card (the phone) the key fills the foot's one line, so the
     caveat closes the list instead. */
  .aside { display: none; margin: 0; font-size: 12px; color: var(--muted); }
  @container card (max-width: 470px) {
    .keyline .nb { display: none; }
    .aside { display: block; }
  }

  /* Needs more Days: how far each source is from 8 Days each way. */
  .gather { flex: none; margin: 4px 0 0; font: 600 9px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--muted); }
  .meters { display: flex; flex-direction: column; gap: 8px; }
  .meters.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .meter { display: grid; grid-template-columns: minmax(0, 120px) minmax(40px, 1fr) auto; align-items: center; gap: 10px; }
  .meter .who { color: var(--ink); font-size: 13px; }
  .count { font: 500 11px var(--mono); color: var(--muted); white-space: nowrap; }
</style>
