// The two-thirds and Full scale of "What goes with a good Day", in one of
// six designs until one is picked (then the rest go). Every design fits one
// scale to every finding shown; none gives a group a scale of its own,
// except percent findings beside unit axes, which can't share them.
//
// "units": linear Vouchers a Day across the top and minutes a Day across the
//   bottom, each fitted to every finding in its unit, on one set of
//   gridlines. Percent findings get a tick row under their heading.
// "change": linear percent change from Days without, symmetric about 0;
//   past ±CAP is pinned at the edge.
// "ratio": change as a ratio on a log scale, symmetric about ×1, so halving
//   and doubling sit equally far from no change; past ×8 or ÷8 is pinned.
// "fitted": linear percent change fitted to where the findings are, not
//   symmetric; a change far past the rest is pinned with its value printed.
// "logunits": Vouchers and minutes on log axes, fitted so their 1, 2, 5
//   gridlines coincide; a zero is floored at the first tick. Percent
//   findings get a linear tick row and gridlines of their own.
// "breaks": linear Vouchers and minutes with up to 2 empty stretches of each
//   axis cut out; each piece keeps the axis's one scale.

export type Design = "units" | "change" | "ratio" | "fitted" | "logunits" | "breaks";
export type Unit = "vouchers" | "minutes" | "percent";
export type Finding = { withAvg: number; withoutAvg: number };
export type Group<F extends Finding = Finding> = { id: string; unit: Unit; findings: F[] };
/** A tick: where it sits across the track (0 to 1) and what it says ("" draws only its gridline). */
export type Tick = { at: number; text: string };
/** A row of ticks; `cuts` are where a stretch of the axis is cut out. */
export type Axis = { name: string; ticks: Tick[]; cuts?: number[] };
export type Scale<F extends Finding = Finding> = {
  top?: Axis;
  bottom?: Axis;
  /** Tick rows under a group's heading, by group id. */
  inline: Map<string, Axis>;
  /** Gridlines drawn once behind every row, or null when each group draws its own axis's. */
  grid: number[] | null;
  /** The "no change" gridline, drawn stronger. */
  zero?: number;
  /** A group's own gridlines (cuts too), when they aren't the shared ones. */
  own: (g: Group<F>) => Axis | undefined;
  /** Where a finding's two dots sit: 0 to 1 across the track, past either end when pinned or floored. */
  at: (g: Group<F>, f: F) => [number, number];
  /** Printed after a pinned finding's value: its real change. */
  note: (g: Group<F>, f: F) => string;
};

const PAD = 0.06;
const NAMES: Record<Unit, string> = { vouchers: "Vouchers a Day", minutes: "Minutes a Day", percent: "Percent" };
/** Tick labels: JetBrains Mono at --axis-size (9px) is 5.4px a letter. */
const LETTER_PX = 5.4, LABEL_GAP = 5;

/** The smallest round step (1, 2, 2.5, or 5 times a power of ten) above `raw`. */
export function stepAbove(raw: number): number {
  const p = 10 ** Math.floor(Math.log10(raw));
  return [1, 2, 2.5, 5, 10].map((m) => m * p).find((s) => s > raw * (1 + 1e-9)) ?? 10 * p;
}
/** The roundest axis of `n` intervals that holds every value with room to spare. */
function fitAxis(values: number[], n: number): { lo: number; step: number } {
  const min = Math.min(...values), max = Math.max(...values), pad = Math.max((max - min) * PAD, 1e-6);
  // Start below any step that could fit and take the first that does (a
  // padded edge under zero doesn't count, since the axis stops at zero).
  for (let step = stepAbove((max - min + pad) / n / 2); ; step = stepAbove(step)) {
    let lo = Math.max(0, Math.floor((min - pad) / step) * step);
    const spare = Math.floor((lo + n * step - max - pad) / step + 1e-9);
    if (spare < 0) continue;
    // Spare intervals go half below, half above, never under zero.
    lo = Math.max(0, lo - Math.floor(spare / 2) * step);
    return { lo, step };
  }
}
/** A number as a tick says it, to the places `step` needs. */
const round = (v: number, step: number) => {
  const places = (String(+step.toPrecision(3)).split(".")[1] ?? "").length;
  return String(+v.toFixed(places));
};
const signed = (v: number) => (Math.abs(v) < 1e-9 ? "0" : `${v < 0 ? "−" : "+"}${+Math.abs(v).toFixed(1)}%`);
/** Evenly spaced ticks from `lo`, `n` intervals of `step`. */
const even = (lo: number, step: number, n: number, text: (v: number) => string): Tick[] =>
  Array.from({ length: n + 1 }, (_, i) => ({ at: i / n, text: text(lo + step * i) }));
/** Blanks the labels that would touch the one before (gridlines stay), keeping the last. */
function thin(ticks: Tick[], trackW: number): Tick[] {
  const span = (t: Tick) => {
    const w = t.text.length * LETTER_PX, x = t.at * trackW;
    return t.at < 0.02 ? [x, x + w] : t.at > 0.98 ? [x - w, x] : [x - w / 2, x + w / 2];
  };
  const out = ticks.map((t) => ({ ...t }));
  let right = -Infinity;
  for (const t of out) {
    if (!t.text) continue;
    const [a, b] = span(t);
    if (a < right + LABEL_GAP) t.text = "";
    else right = b;
  }
  // The last label wins over the one it touches.
  const last = ticks.findLast((t) => t.text);
  const kept = out.findLast((t) => t.text);
  if (last && kept && last.at !== kept.at) {
    const [a] = span(last);
    for (const t of out) if (t.text && span(t)[1] > a - LABEL_GAP) t.text = "";
    out.find((t) => t.at === last.at)!.text = last.text;
  }
  return out;
}
/** A finding's change from Days without, in percent (±Infinity from nothing). */
export const changeOf = (f: Finding) =>
  f.withoutAvg > 0 ? ((f.withAvg - f.withoutAvg) / f.withoutAvg) * 100 : f.withAvg === f.withoutAvg ? 0 : (f.withAvg - f.withoutAvg) * Infinity;
/** The same as a ratio, in doublings (log2), ±Infinity from or to nothing. */
export const doublingsOf = (f: Finding) =>
  f.withoutAvg > 0 && f.withAvg > 0 ? Math.log2(f.withAvg / f.withoutAvg) : f.withAvg === f.withoutAvg ? 0 : (f.withAvg - f.withoutAvg) * Infinity;
/** A ratio as a factor: "×2", "×1.5", and under 1 as a fraction, "×1/2" or "×2/3" (÷ reads as + at tick size). */
const times = (r: number) => {
  const say = (x: number) => String(+x.toFixed(x < 10 ? 2 : 0));
  if (r >= 1 - 1e-9) return `×${say(r)}`;
  const inv = 1 / r;
  // A unit fraction when 1/r is whole (1/2, 1/8), otherwise the nearest of a few (2/3, 4/5), else a decimal.
  if (Math.abs(inv - Math.round(inv)) < 1e-6) return `×1/${Math.round(inv)}`;
  for (const [a, b] of [[2, 3], [4, 5], [3, 4]]) if (Math.abs(r - a / b) < 1e-6) return `×${a}/${b}`;
  return `×${say(r)}`;
};

/** Percent findings beside unit axes: a linear row of their own, `n` intervals. */
function percentAxis<F extends Finding>(groups: Group<F>[], n: number): Map<string, { axis: Axis; lo: number; span: number }> {
  const pct = groups.filter((g) => g.unit === "percent");
  if (!pct.length) return new Map();
  const { lo, step } = fitAxis(pct.flatMap((g) => g.findings.flatMap((f) => [f.withAvg, f.withoutAvg])), n);
  const axis: Axis = { name: NAMES.percent, ticks: even(lo, step, n, (v) => round(v, step)) };
  return new Map(pct.map((g) => [g.id, { axis, lo, span: n * step }]));
}

function byUnits<F extends Finding>(groups: Group<F>[], trackW: number): Scale<F> {
  const sets = new Map<Unit, F[]>();
  for (const g of groups) sets.set(g.unit, [...(sets.get(g.unit) ?? []), ...g.findings]);
  type Fit = { lo: number; step: number };
  let best = { n: 5, axes: new Map<Unit, Fit>(), low: -1, mean: -1 };
  // The number of intervals (4 to 6) that gives the smallest change shown
  // the longest line, then the rest on average.
  for (const n of [5, 4, 6]) {
    const axes = new Map([...sets].map(([u, fs]): [Unit, Fit] => [u, fitAxis(fs.flatMap((f) => [f.withAvg, f.withoutAvg]), n)]));
    const shares = [...sets].map(([u, fs]) => Math.min(...fs.map((f) => Math.abs(f.withAvg - f.withoutAvg))) / (n * axes.get(u)!.step));
    const low = Math.min(...shares), mean = shares.reduce((x, y) => x + y, 0) / shares.length;
    if (low > best.low * 1.05 || (low > best.low * 0.95 && mean > best.mean)) best = { n, axes, low, mean };
  }
  const { n, axes } = best;
  const axisOf = (u: Unit): Axis => { const a = axes.get(u)!; return { name: NAMES[u], ticks: thin(even(a.lo, a.step, n, (v) => round(v, a.step)), trackW) }; };
  const made = new Map([...axes.keys()].map((u) => [u, axisOf(u)]));
  const topU: Unit | undefined = axes.has("vouchers") ? "vouchers" : axes.has("minutes") ? "minutes" : axes.has("percent") ? "percent" : undefined;
  const bottomU = axes.has("minutes") ? "minutes" : topU;
  const inline = new Map<string, Axis>();
  for (const g of groups) if (g.unit !== topU && g.unit !== bottomU && ![...inline.values()].includes(made.get(g.unit)!)) inline.set(g.id, made.get(g.unit)!);
  return {
    top: topU && made.get(topU), bottom: bottomU && made.get(bottomU), inline,
    grid: Array.from({ length: n + 1 }, (_, i) => i / n), own: () => undefined, note: () => "",
    at: (g, f) => { const a = axes.get(g.unit)!, span = n * a.step; return [(f.withoutAvg - a.lo) / span, (f.withAvg - a.lo) / span]; },
  };
}

/** Past this percent (or from nothing), "change" pins a finding at the edge. */
const CAP = 200;
function byChange<F extends Finding>(groups: Group<F>[]): Scale<F> {
  const all = groups.flatMap((g) => g.findings.map(changeOf));
  const most = Math.min(CAP, Math.max(1, ...all.map(Math.abs).filter((v) => v <= CAP))) * (1 + PAD);
  // 2 or 3 intervals a side, whichever wastes less of the track.
  const [k, step] = [3, 2].map((k): [number, number] => [k, stepAbove(most / k)]).sort((a, b) => a[0] * a[1] - b[0] * b[1])[0];
  const a: Axis = { name: "Change", ticks: even(-k * step, step, 2 * k, signed) };
  return {
    top: a, bottom: a, inline: new Map(), grid: a.ticks.map((t) => t.at), zero: 0.5, own: () => undefined, note: () => "",
    at: (_, f) => [0.5, 0.5 + changeOf(f) / (2 * k * step)],
  };
}

/** Ratios past ×8 (3 doublings) are pinned. */
const MAX_DOUBLINGS = 3;
/** Ratio axes by how far they reach: the ticks, as ratios. */
const RATIO_SETS: { half: number; ticks: number[] }[] = [
  { half: Math.log2(1.5), ticks: [1 / 1.5, 1 / 1.25, 1, 1.25, 1.5] },
  { half: 1, ticks: [1 / 2, 1 / 1.5, 1, 1.5, 2] },
  { half: 2, ticks: [1 / 4, 1 / 2, 1, 2, 4] },
  { half: 3, ticks: [1 / 8, 1 / 4, 1 / 2, 1, 2, 4, 8] },
];
function byRatio<F extends Finding>(groups: Group<F>[]): Scale<F> {
  const all = groups.flatMap((g) => g.findings.map(doublingsOf)).map(Math.abs);
  const most = Math.max(0, ...all.filter((v) => v <= MAX_DOUBLINGS)) * (1 + PAD);
  const set = RATIO_SETS.find((s) => s.half >= most) ?? RATIO_SETS[RATIO_SETS.length - 1];
  const where = (d: number) => 0.5 + d / (2 * set.half);
  const a: Axis = { name: "Change", ticks: set.ticks.map((r) => ({ at: where(Math.log2(r)), text: times(r) })) };
  return {
    top: a, bottom: a, inline: new Map(), grid: a.ticks.map((t) => t.at), zero: 0.5, own: () => undefined,
    at: (_, f) => [0.5, where(doublingsOf(f))],
    note: (_, f) => {
      const d = doublingsOf(f);
      if (Math.abs(d) <= set.half) return "";
      return d === Infinity ? "from 0" : d === -Infinity ? "to 0" : times(f.withAvg / f.withoutAvg);
    },
  };
}

/** "fitted" pins the largest change while it's more than this times the next, and past ±100%. */
const OUTLIER = 1.5;
function byFitted<F extends Finding>(groups: Group<F>[], trackW: number): Scale<F> {
  const all = groups.flatMap((g) => g.findings.map(changeOf));
  const sorted = all.filter(Number.isFinite).sort((a, b) => Math.abs(b) - Math.abs(a));
  while (sorted.length >= 2 && Math.abs(sorted[0]) > 100 && Math.abs(sorted[0]) > OUTLIER * Math.abs(sorted[1])) sorted.shift();
  const kept = sorted.length ? sorted : [0];
  let lo = Math.min(0, ...kept), hi = Math.max(0, ...kept);
  // Room past both ends, 0 included, so no dot sits on an edge.
  const pad = Math.max((hi - lo) * PAD, 1);
  lo -= pad;
  hi += pad;
  // The roundest step that spans it in 3 to 7 intervals with the least to spare.
  let best = { a: 0, b: 0, step: 0 };
  for (let step = stepAbove((hi - lo) / 8); ; step = stepAbove(step)) {
    const a = Math.floor(lo / step + 1e-9) * step, b = Math.ceil(hi / step - 1e-9) * step, n = Math.round((b - a) / step);
    if (n > 7) continue;
    if (!best.step || b - a < best.b - best.a - 1e-9) best = { a, b, step };
    if (n <= 3) break;
  }
  const { a, b, step } = best, n = Math.round((b - a) / step);
  const where = (v: number) => (v - a) / (b - a);
  const axis: Axis = { name: "Change", ticks: thin(even(a, step, n, signed), trackW) };
  return {
    top: axis, bottom: axis, inline: new Map(), grid: axis.ticks.map((t) => t.at), zero: where(0), own: () => undefined,
    at: (_, f) => [where(0), where(changeOf(f))],
    note: (_, f) => {
      const c = changeOf(f), x = where(c);
      if (x >= 0 && x <= 1) return "";
      return Number.isFinite(c) ? signed(Math.round(c)) : "from 0";
    },
  };
}

/** 1, 2, 5, 10, 20, … : the k-th value of the 1-2-5 sequence (k = 0 is 1). */
const seq = (k: number) => [1, 2, 5][((k % 3) + 3) % 3] * 10 ** Math.floor(k / 3);
/** The index of the largest 1-2-5 value at or under v. */
const seqUnder = (v: number) => { let k = Math.floor(Math.log10(v)) * 3 + 2; while (seq(k) > v * (1 + 1e-9)) k--; return k; };
function byLogUnits<F extends Finding>(groups: Group<F>[], trackW: number): Scale<F> {
  const sets = new Map<Unit, number[]>();
  for (const g of groups) if (g.unit !== "percent") sets.set(g.unit, [...(sets.get(g.unit) ?? []), ...g.findings.flatMap((f) => [f.withAvg, f.withoutAvg])]);
  // Each unit starts on a 1-2-5 value and every unit spans the same number
  // of 1-2-5 steps, starting at the same place in the sequence (all on a 2,
  // say), so their gridlines fall in the same places. Of the three places
  // to start, the one that spans the fewest steps.
  type Fit = { lo: number; steps: number };
  let best: { fits: Map<Unit, Fit>; steps: number } | undefined;
  for (const phase of [0, 1, 2]) {
    const fits = new Map<Unit, Fit>();
    for (const [u, vs] of sets) {
      const pos = vs.filter((v) => v > 0);
      const min = pos.length ? Math.min(...pos) : 1, max = pos.length ? Math.max(...pos) : 1;
      // Room for a dot past the outermost value: 3% of the decades shown.
      const pad = 10 ** (Math.max(Math.log10(max / min), 1) * 0.03);
      let k = seqUnder(min / pad);
      while (((k % 3) + 3) % 3 !== phase) k--;
      let top = k;
      while (seq(top) < max * pad) top++;
      fits.set(u, { lo: k, steps: top - k });
    }
    const steps = Math.max(...[...fits.values()].map((f) => f.steps));
    if (!best || steps < best.steps) best = { fits, steps };
  }
  const { fits, steps } = best ?? { fits: new Map<Unit, Fit>(), steps: 3 };
  // Positions along the track by log, not by step: 1 to 2 is shorter than 2 to 5.
  const where = (u: Unit, v: number) => {
    const f = fits.get(u)!, lo = seq(f.lo), hi = seq(f.lo + steps);
    // A zero (or anything under the first tick) is floored there, just past the edge so it's marked.
    return v < lo ? -0.001 : Math.log(v / lo) / Math.log(hi / lo);
  };
  const axisOf = (u: Unit): Axis => {
    const f = fits.get(u)!;
    const ticks = Array.from({ length: steps + 1 }, (_, i) => { const v = seq(f.lo + i); return { at: where(u, v), text: String(+v.toPrecision(3)) }; });
    // Where the 2s and 5s crowd, only the powers of ten keep their labels.
    const decades = Math.log10(seq(f.lo + steps) / seq(f.lo));
    if (trackW / decades < 70) for (const t of ticks) if (!/^(0\.0*)?10*$/.test(t.text)) t.text = "";
    return { name: NAMES[u], ticks: thin(ticks, trackW) };
  };
  const made = new Map([...fits.keys()].map((u) => [u, axisOf(u)]));
  const top = made.get("vouchers") ?? made.get("minutes");
  const bottom = made.get("minutes") ?? top;
  const pct = percentAxis(groups, 4);
  return {
    top, bottom, inline: new Map([...pct].map(([id, p]) => [id, p.axis])),
    grid: top ? top.ticks.map((t) => t.at) : null,
    own: (g) => pct.get(g.id)?.axis,
    note: () => "",
    at: (g, f) => {
      const p = pct.get(g.id);
      if (p) return [(f.withoutAvg - p.lo) / p.span, (f.withAvg - p.lo) / p.span];
      return [where(g.unit, f.withoutAvg), where(g.unit, f.withAvg)];
    },
  };
}

/** "breaks": at most this many cuts an axis, each where at least this share of it is empty, drawn this wide. */
const MAX_CUTS = 2, CUT_SHARE = 0.15, CUT_PX = 14;
function byBreaks<F extends Finding>(groups: Group<F>[], trackW: number): Scale<F> {
  const W = trackW || 240;
  type Piece = { lo: number; hi: number; x: number; w: number };
  type Broken = { pieces: Piece[]; axis: Axis };
  const sets = new Map<Unit, F[]>();
  for (const g of groups) if (g.unit !== "percent") sets.set(g.unit, [...(sets.get(g.unit) ?? []), ...g.findings]);
  const made = new Map<Unit, Broken>();
  for (const [u, fs] of sets) {
    // The stretches findings cover, merged where they overlap.
    const spans = fs.map((f) => [Math.min(f.withAvg, f.withoutAvg), Math.max(f.withAvg, f.withoutAvg)]).sort((a, b) => a[0] - b[0]);
    const runs: number[][] = [];
    for (const [a, b] of spans) { const r = runs[runs.length - 1]; if (r && a <= r[1]) r[1] = Math.max(r[1], b); else runs.push([a, b]); }
    const whole = runs[runs.length - 1][1] - runs[0][0] || 1;
    // The widest empty stretches between them, if wide enough.
    const gaps = runs.slice(1).map((r, i) => ({ i, size: r[0] - runs[i][1] })).filter((g) => g.size >= CUT_SHARE * whole);
    const cutAfter = new Set(gaps.sort((a, b) => b.size - a.size).slice(0, MAX_CUTS).map((g) => g.i));
    const groupsOf: number[][] = [];
    runs.forEach((r, i) => { if (!i || cutAfter.has(i - 1)) groupsOf.push([...r]); else groupsOf[groupsOf.length - 1][1] = r[1]; });
    // One scale for every piece: pad each by the same amount, then round the
    // ends to half a step and fit them, with the cuts, into the track.
    const room = W - CUT_PX * (groupsOf.length - 1);
    const covered = groupsOf.reduce((t, [a, b]) => t + (b - a), 0);
    const pad = covered * PAD;
    let step = 0, pieces: Piece[] = [];
    for (let pass = 0; pass < 2; pass++) {
      const span = pieces.length ? pieces.reduce((t, p) => t + p.hi - p.lo, 0) : covered + 2 * pad * groupsOf.length;
      step = stepAbove(38 / (room / span));
      const half = step / 2;
      const ends = groupsOf.map(([a, b]) => [Math.max(0, Math.floor((a - pad) / half) * half), Math.ceil((b + pad) / half) * half]);
      const per = room / ends.reduce((t, [a, b]) => t + b - a, 0);
      let x = 0;
      pieces = ends.map(([lo, hi]) => { const w = (hi - lo) * per; const p = { lo, hi, x, w }; x += w + CUT_PX; return p; });
    }
    const ticks: Tick[] = [];
    for (const p of pieces) for (let v = Math.ceil(p.lo / step - 1e-9) * step; v <= p.hi + 1e-9; v += step) ticks.push({ at: (p.x + ((v - p.lo) / (p.hi - p.lo)) * p.w) / W, text: round(v, step) });
    const cuts = pieces.slice(1).map((p) => (p.x - CUT_PX / 2) / W);
    // A label that would run into a break mark keeps only its gridline.
    for (const t of ticks) if (cuts.some((c) => Math.abs(c - t.at) * W < (t.text.length * LETTER_PX) / 2 + 7)) t.text = "";
    made.set(u, { pieces, axis: { name: NAMES[u], ticks: thin(ticks, W), cuts } });
  }
  const where = (u: Unit, v: number) => {
    const { pieces } = made.get(u)!;
    const p = pieces.find((p) => v <= p.hi + 1e-9) ?? pieces[pieces.length - 1];
    return (p.x + ((v - p.lo) / (p.hi - p.lo)) * p.w) / W;
  };
  const top = made.get("vouchers")?.axis ?? made.get("minutes")?.axis;
  const bottom = made.get("minutes")?.axis ?? top;
  const pct = percentAxis(groups, 4);
  return {
    top, bottom, inline: new Map([...pct].map(([id, p]) => [id, p.axis])), grid: null, note: () => "",
    own: (g) => pct.get(g.id)?.axis ?? made.get(g.unit)?.axis,
    at: (g, f) => {
      const p = pct.get(g.id);
      if (p) return [(f.withoutAvg - p.lo) / p.span, (f.withAvg - p.lo) / p.span];
      return [where(g.unit, f.withoutAvg), where(g.unit, f.withAvg)];
    },
  };
}

/** The scale `design` gives these groups on a track `trackW` pixels wide. */
export function scaleFor<F extends Finding>(design: Design, groups: Group<F>[], trackW: number): Scale<F> {
  const w = trackW || 240;
  switch (design) {
    case "units": return byUnits(groups, w);
    case "change": return byChange(groups);
    case "ratio": return byRatio(groups);
    case "fitted": return byFitted(groups, w);
    case "logunits": return byLogUnits(groups, w);
    case "breaks": return byBreaks(groups, w);
  }
}
