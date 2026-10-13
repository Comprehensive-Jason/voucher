// The two-thirds and Full scale of "What goes with a good Day": every
// finding read as a ratio, how many times bigger or smaller it is on Days
// with than on Days without, on one log scale, so halving and doubling sit
// equally far from ×1, where every hollow dot sits.
//
// Each side of ×1 reaches just past the farthest finding on it (at least
// ×1.25 or ×4/5), so the findings use the whole width; its ticks are the
// round factors inside. A side with no finding keeps a sliver of the track,
// so ×1 stays in view and the other side gets the rest. Past ×8 or ×1/8, a
// finding is pinned at the edge (the card draws a chevron) with its ratio
// printed, and its side reaches ×8.

export type Finding = { withAvg: number; withoutAvg: number };
/** A tick: where it sits across the track (0 to 1) and what it says ("" draws only its gridline). */
export type Tick = { at: number; text: string };
export type Axis = { name: string; ticks: Tick[] };
export type Scale<F extends Finding = Finding> = {
  axis: Axis;
  /** Gridlines drawn behind every row. */
  grid: number[];
  /** ×1, "no change", drawn stronger. */
  zero: number;
  /** Where a finding's two dots sit: 0 to 1 across the track, past either end when pinned. */
  at: (f: F) => [number, number];
  /** Printed after a pinned finding's value: its real ratio. */
  note: (f: F) => string;
};

/** Room past the outermost finding on a side, as a share of its reach. */
const PAD = 0.06;
/** Ratios past ×8 (3 doublings) are pinned. */
const MAX_DOUBLINGS = 3;
/** The least a side reaches, in doublings (×1.25), so it always has a tick past ×1. */
const MIN_DOUBLINGS = Math.log2(1.25);
/** A side's ticks as ratios over 1 (under 1, their reciprocals), by how far it reaches: finer near ×1. */
const tickRatios = (reach: number) => (reach < 1 ? [1.25, 1.5] : reach < 2 ? [1.5, 2, 3] : [2, 4, 8]).filter((r) => Math.log2(r) <= reach + 1e-9);
/** The share of the track a side with no finding keeps, so ×1 isn't on the edge. */
const EMPTY_SIDE = 0.07;
/** Tick labels: JetBrains Mono at --axis-size (9px) is 5.4px a letter. */
const LETTER_PX = 5.4, LABEL_GAP = 5;

/** A finding's change as a ratio, in doublings (log2), ±Infinity from or to nothing. */
const doublingsOf = (f: Finding) =>
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

/** How far a side reaches, in doublings, for findings out to `farthest` (a pinned one reaches ×8). */
const sideFor = (farthest: number) => Math.min(MAX_DOUBLINGS, Math.max(MIN_DOUBLINGS, farthest * (1 + PAD)));

/** Blanks the labels that would touch one already kept, ×1 first, then the edges, then the rest inward. */
function thin(ticks: Tick[], trackW: number): Tick[] {
  const span = (t: Tick) => {
    const w = t.text.length * LETTER_PX, x = t.at * trackW;
    return t.at < 0.02 ? [x, x + w] : t.at > 0.98 ? [x - w, x] : [x - w / 2, x + w / 2];
  };
  const rank = (t: Tick) => (t.text === "×1" ? 0 : t.at < 0.02 || t.at > 0.98 ? 1 : 2);
  const kept: number[][] = [];
  const out = ticks.map((t) => ({ ...t }));
  for (const t of [...out].sort((a, b) => rank(a) - rank(b))) {
    const [a, b] = span(t);
    if (kept.some(([c, d]) => a < d + LABEL_GAP && c < b + LABEL_GAP)) t.text = "";
    else kept.push([a, b]);
  }
  return out;
}

/** The scale for these findings on a track `trackW` pixels wide. */
export function scaleFor<F extends Finding>(findings: F[], trackW: number): Scale<F> {
  const W = trackW || 240;
  const all = findings.map(doublingsOf);
  const up = all.filter((d) => d > 0), down = all.filter((d) => d < 0).map((d) => -d);
  // Each side fitted to its own findings, or a sliver when it has none
  // (×1/1.25 to ×1.25 when nothing changed at all).
  const r = up.length ? sideFor(Math.max(...up)) : 0, l = down.length ? sideFor(Math.max(...down)) : 0;
  let where: (d: number) => number;
  if (r && l) where = (d) => (d + l) / (l + r);
  else if (r) where = (d) => EMPTY_SIDE + (1 - EMPTY_SIDE) * (d / r);
  else if (l) where = (d) => 1 - EMPTY_SIDE + (1 - EMPTY_SIDE) * (d / l);
  else where = (d) => 0.5 + d / (2 * MIN_DOUBLINGS);
  const both = !r && !l ? MIN_DOUBLINGS : 0;
  const ratios = [...tickRatios(l || both).map((t) => 1 / t).reverse(), 1, ...tickRatios(r || both)];
  const ticks = thin(ratios.map((x) => ({ at: where(Math.log2(x)), text: times(x) })), W);
  return {
    axis: { name: "Change", ticks },
    grid: ticks.map((t) => t.at),
    zero: where(0),
    at: (f) => { const d = doublingsOf(f); return [where(0), Number.isFinite(d) ? where(d) : d > 0 ? 1.01 : -0.01]; },
    note: (f) => {
      const d = doublingsOf(f), x = where(d);
      if (Number.isFinite(d) && x >= 0 && x <= 1) return "";
      return d === Infinity ? "from 0" : d === -Infinity ? "to 0" : times(f.withAvg / f.withoutAvg);
    },
  };
}
