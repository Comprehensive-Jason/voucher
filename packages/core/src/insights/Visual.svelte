<script lang="ts">
  // A finding's picture (insights/types.ts' Visual), small in a row and
  // bigger, with labels, in its proof sheet. Drawn in SVG at its own size.
  //   dumbbell  Days without (hollow, always in the middle) and with
  //             (filled), as a ratio out to ×1.6 each way, as on the Good
  //             Day card's scale.
  //   spark     the last Days, this week's in the change's color (green
  //             better, crimson worse) over a gray past, the usual dashed.
  //   arrow     before and after a Marker, left to right.
  //   hours     minutes by hour of the Day from 06:00, the named hours in
  //             crimson, Curfew's hours shaded.
  //   record    the new best's bar in gold, a tick at the old best.
  //   squares   the last Days, gold met and empty missed, a crimson bar
  //             under a lapse; with Curfew answers, a crimson frame for a
  //             goal Day that went badly and green for a missed one that
  //             went well.
  //   rates     a goal's hit rate week by week as bars on a track, the
  //             last weeks in the change's color, a dash where unknown.
  //   days      an Experiment's measured Days, done, today, and to come.
  import type { Visual } from "./types";
  let { v, w, h, big = false, axis }: { v: Visual | { kind: "days"; day: number; of: number }; w: number; h: number; big?: boolean; axis?: [string, string, string] } = $props();

  const LABEL = 12;
  const fmt = (x: number) => (Math.abs(x) >= 10 ? String(Math.round(x)) : x.toFixed(1).replace(/\.0$/, ""));

  // spark
  const spark = $derived.by(() => {
    if (v.kind !== "spark") return null;
    const vals = v.values;
    const nums = vals.filter((x): x is number => x !== null);
    const lo = Math.min(v.usual, ...nums), hi = Math.max(v.usual, ...nums);
    const top = 3, bot = h - (big ? LABEL : 3);
    const n = vals.length, x = (i: number) => 2 + (i * (w - 4)) / Math.max(1, n - 1);
    const y = (val: number) => bot - ((val - lo) / Math.max(1e-9, hi - lo)) * (bot - top);
    const path = (from: number, to: number) => {
      let d = "", pen = false;
      for (let i = from; i <= to; i++) { const val = vals[i]; if (val === null) { pen = false; continue; } d += `${pen ? "L" : "M"}${x(i).toFixed(1)},${y(val).toFixed(1)}`; pen = true; }
      return d;
    };
    const split = n - v.week;
    const last = [...vals.keys()].reverse().find((i) => vals[i] !== null);
    return { x, y, top, bot, past: path(0, split), week: path(split, n - 1), split: x(split - 0.5), usualY: y(v.usual), last: last === undefined ? null : { x: x(last), y: y(vals[last]!) } };
  });

  // dumbbell
  const bell = $derived.by(() => {
    if (v.kind !== "dumbbell") return null;
    const r = v.without > 0 && v.with > 0 ? Math.log2(v.with / v.without) / Math.log2(1.6) : v.with > v.without ? 1 : -1;
    const half = w / 2 - 6, dy = h - 7;
    return { xa: w / 2, xb: w / 2 + Math.max(-1, Math.min(1, r)) * half, dy };
  });

  // arrow
  const arrow = $derived.by(() => {
    if (v.kind !== "arrow") return null;
    const pad = big ? 50 : 24, x1 = pad, x2 = w - pad, top = 5, bot = h - 5;
    const hi = Math.max(v.before, v.after, 1e-9) * 1.15;
    const y = (val: number) => bot - (val / hi) * (bot - top);
    return { x1, x2, y1: y(v.before), y2: y(v.after) };
  });

  // hours
  const hours = $derived.by(() => {
    if (v.kind !== "hours") return null;
    const bot = h - (big ? LABEL : 0), bw = (w - 23) / 24, X = (i: number) => i * (bw + 1);
    const most = Math.max(1e-9, ...v.minutes);
    return { bot, bw, X, most };
  });

  // record
  const rec = $derived.by(() => {
    if (v.kind !== "record") return null;
    const lo = Math.max(0, v.old - (v.best - v.old) * 3), x = (val: number) => 1 + ((val - lo) / Math.max(1e-9, v.best - lo)) * (w - 2);
    return { x, y: h - 8 };
  });

  // rates
  const rt = $derived.by(() => {
    if (v.kind !== "rates") return null;
    const n = Math.max(1, v.rates.length), g = n > 8 ? 2 : 3, bw = (w - (n - 1) * g) / n;
    const top = 1, bot = h - (big ? LABEL + 2 : 1);
    return { n, g, bw, top, bot, x: (i: number) => i * (bw + g) };
  });

  // squares
  const sq = $derived.by(() => {
    if (v.kind !== "squares") return null;
    const n = v.cells.length, g = 2, size = Math.min(h - 7, (w - (n - 1) * g) / n), y0 = (h - size - 5) / 2;
    return { n, g, size, y0 };
  });
</script>

<svg class="vis" class:big width={w} height={h} viewBox="0 0 {w} {h}" aria-hidden="true">
  {#if v.kind === "spark" && spark}
    <rect x={spark.split} y={spark.top - 3} width={w - spark.split} height={spark.bot - spark.top + 6} rx="3" fill="var(--select)" />
    <path d="M2,{spark.usualY.toFixed(1)}H{w - 2}" stroke="var(--muted)" stroke-width="1" stroke-dasharray="2 2" />
    <path d={spark.past} stroke="var(--faint)" stroke-width="1.5" fill="none" stroke-linejoin="round" stroke-linecap="round" />
    <path d={spark.week} class="line" class:worse={!v.good} fill="none" stroke-linejoin="round" stroke-linecap="round" />
    {#if spark.last}<circle cx={spark.last.x} cy={spark.last.y} r="2.6" fill={v.good ? "var(--voucher)" : "var(--worse-text)"} />{/if}
    {#if big && axis}
      <text x="2" y={h - 1} text-anchor="start">{axis[0]}</text><text x={spark.split} y={h - 1} text-anchor="middle">{axis[1]}</text><text x={w - 2} y={h - 1} text-anchor="end">{axis[2]}</text>
      <text x="4" y={spark.usualY - 4} text-anchor="start" style="fill: var(--muted)">usual {fmt(v.usual)}</text>
    {/if}
  {:else if v.kind === "dumbbell" && bell}
    <path d="M{bell.xa},{bell.dy - 6}V{bell.dy + 6}" stroke="var(--axis-ink)" stroke-width="1" />
    <path d="M{bell.xa},{bell.dy}H{bell.xb}" class="line" class:worse={!v.good} />
    <circle cx={bell.xa} cy={bell.dy} r="3.6" fill="var(--surface)" stroke={v.color} stroke-width="1.7" />
    <circle cx={bell.xb} cy={bell.dy} r="4.3" fill={v.color} />
    <text x="0" y="8" text-anchor="start" style="fill: {bell.xa <= bell.xb ? "var(--faint)" : "var(--ink)"}">{fmt(bell.xa <= bell.xb ? v.without : v.with)}</text>
    <text x={w} y="8" text-anchor="end" style="fill: {bell.xa <= bell.xb ? "var(--ink)" : "var(--faint)"}">{fmt(bell.xa <= bell.xb ? v.with : v.without)}</text>
  {:else if v.kind === "arrow" && arrow}
    <path d="M{w / 2},1V{h - 1}" stroke="var(--marker)" stroke-width="1" stroke-dasharray="2 2" />
    <path d="M{arrow.x1},{arrow.y1}L{arrow.x2},{arrow.y2}" class="line" class:worse={v.good === false} class:neutral={v.good === null} />
    <circle cx={arrow.x1} cy={arrow.y1} r="3.6" fill="var(--surface)" stroke="var(--muted)" stroke-width="1.7" />
    <circle cx={arrow.x2} cy={arrow.y2} r="4.3" fill="var(--ink)" />
    <text x={arrow.x1 - 7} y={arrow.y1 + 3} text-anchor="end">{v.labels[0]}</text>
    <text x={arrow.x2 + 7} y={arrow.y2 + 3} text-anchor="start" style="fill: var(--ink)">{v.labels[1]}</text>
    {#if big}<text x={arrow.x1} y={h - 1} text-anchor="middle">before</text><text x={arrow.x2} y={h - 1} text-anchor="middle">after</text>{/if}
  {:else if v.kind === "hours" && hours}
    {#if v.night >= 0 && v.night < 24}<rect x={hours.X(v.night)} y="0" width={w - hours.X(v.night)} height={hours.bot} fill="var(--night-band)" />{/if}
    {#each v.minutes as m, i (i)}
      {@const bh = Math.max(1, (m / hours.most) * (hours.bot - 2))}
      <rect x={hours.X(i)} y={hours.bot - bh} width={hours.bw} height={bh} rx="0.8" fill={i >= v.from && i < v.to ? "var(--worse)" : "var(--line-strong)"} />
    {/each}
    {#if big && axis}
      <text x="0" y={h - 1} text-anchor="start">{axis[0]}</text>
      {#if v.from >= 0}<text x={hours.X(v.from)} y={h - 1} text-anchor="middle">{axis[1]}</text>{/if}
      <text x={w} y={h - 1} text-anchor="end">{axis[2]}</text>
    {/if}
  {:else if v.kind === "record" && rec}
    <rect x="0" y={rec.y} width={w} height="6" rx="3" fill="var(--well)" />
    <rect x="0" y={rec.y} width={rec.x(v.best)} height="6" rx="3" fill="var(--goal)" />
    <rect x={rec.x(v.old) - 1} y={rec.y - 3} width="2" height="12" rx="1" fill="var(--ink)" />
    <text x={rec.x(v.old) - 3} y="8" text-anchor="end">{v.labels[0]}</text>
  {:else if v.kind === "squares" && sq}
    {#each v.cells as c, i (i)}
      <rect x={i * (sq.size + sq.g) + 0.5} y={sq.y0 + 0.5} width={sq.size - 1} height={sq.size - 1} rx="2"
        fill={c === "met" || c === "bad" ? "var(--goal)" : "var(--well)"}
        stroke={c === "bad" ? "var(--worse-text)" : c === "good" ? "var(--voucher)" : "none"} stroke-width="1.5" />
    {/each}
    {#if v.run}<rect x={(sq.n - v.run) * (sq.size + sq.g)} y={sq.y0 + sq.size + 2} width={v.run * sq.size + (v.run - 1) * sq.g} height="3" rx="1.5" fill="var(--worse)" />{/if}
  {:else if v.kind === "rates" && rt}
    {#each v.rates as r, i (i)}
      {@const recent = i >= rt.n - v.recent}
      <rect x={rt.x(i)} y={rt.top} width={rt.bw} height={rt.bot - rt.top} rx="1.5" fill="var(--well)" />
      {#if r === null}
        <rect x={rt.x(i)} y={rt.bot - 1.5} width={rt.bw} height="1.5" fill="var(--line-strong)" />
      {:else if r > 0}
        {@const bh = Math.max(1.5, r * (rt.bot - rt.top))}
        <rect x={rt.x(i)} y={rt.bot - bh} width={rt.bw} height={bh} rx="1.5" class="rate" class:recent class:worse={recent && !v.good} />
      {/if}
    {/each}
    {#if big && axis}
      <text x="0" y={h - 1} text-anchor="start">{axis[0]}</text>
      <text x={rt.x(rt.n - v.recent)} y={h - 1} text-anchor="start">{axis[1]}</text>
      <text x={w} y={h - 1} text-anchor="end">{axis[2]}</text>
    {/if}
  {:else if v.kind === "days"}
    {#each Array(v.of) as _, i (i)}
      {@const cw = (w - (v.of - 1) * 2) / v.of}
      <rect x={i * (cw + 2)} y={h / 2 - 4} width={cw} height="8" rx="1.5" class="day" class:on={i < v.day - 1} class:now={i === v.day - 1} />
    {/each}
  {/if}
</svg>

<style>
  .vis { display: block; flex: none; overflow: visible; }
  .vis text { font: 500 9px var(--mono); fill: var(--faint); }
  .vis.big text { font-size: var(--axis-size); }
  .line { stroke: var(--voucher); stroke-width: 2; }
  /* Crimson is dim on the card (2.7:1), so its strokes are thicker. */
  .line.worse { stroke: var(--worse); stroke-width: 2.6; }
  .line.neutral { stroke: var(--ink); stroke-width: 1.6; }
  .rate { fill: var(--faint); }
  .rate.recent { fill: var(--voucher); }
  .rate.recent.worse { fill: var(--worse); }
  .day { fill: var(--line-strong); }
  .day.on { fill: var(--muted); }
  .day.now { fill: var(--marker); }
</style>
