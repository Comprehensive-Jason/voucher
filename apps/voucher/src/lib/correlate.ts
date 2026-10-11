// What goes with what, and how sure to be of it. Two kinds of comparison
// share one set of rules:
//
// Day by Day. For a driver (a yes/no per Day: did Workout earn?) and an
// outcome (a number per Day: Chinese Vouchers, the longest focus stretch),
// compare the outcome's plain average on Days with the driver against Days
// without, on the same Day or the Day after. Then ask how often chance gives
// a gap that big: cut the calendar into whole Monday-to-Sunday weeks and
// shuffle which week's driver pattern goes with which week's outcomes. Each
// Monday still meets a Monday, so the weekly rhythm stays (a driver that
// comes on weekdays still meets weekday outcomes), and a week's run of Days
// moves together, but any tie between the driver and the outcome beyond
// that is broken. Count the shuffles whose gap is at least as big either way.
//
// Stretch by stretch (breaks). Did a focus stretch have a break (Unlocked or
// Distraction time) in the hour before it started, and was it longer or
// shorter than the stretches without one? Stretches on the same Day aren't
// independent (a scattered Day has short stretches and many breaks), so
// chance is judged a whole Day at a time with the same week shuffles: each
// Day's stretches are checked against the breaks of the same weekday in the
// week it was shuffled with, so a Day's stretches always move together and
// so do its breaks.
//
// The chance is (1 + shuffles at least as big) / (1 + shuffles drawn). The
// shuffles are drawn at random from a seed made from the Days, so the same
// Days always give the same answer. Every pair gets up to SHUFFLES of them,
// stopping once ENOUGH have matched the real gap (its chance is then plainly
// not small, and more shuffles would only refine a number that shows
// nothing). A pair that chance almost never matches, and that isn't High
// already, goes on to MORE_SHUFFLES, so a very small chance can be told
// apart from merely small.
//
// Testing many pairs at once turns some up by luck, so every tested pair of
// both kinds is corrected together (Benjamini-Hochberg) before it becomes a
// confidence. Pure, so it can be checked outside the app.

/** One per Day, on the `days` list the caller gives: the outcome's value, or NaN when unknown. */
export type Outcome = { id: string; values: ArrayLike<number> };
/** One per Day: 1 if the driver happened, 0 if not, -1 when unknown. */
export type Driver = { id: string; did: ArrayLike<number> };
/** One Day's focus stretches and breaks, in minutes after the Day began. */
export type StretchDay = { day: string; stretches: { start: number; minutes: number }[]; breaks: [from: number, to: number][] };
/** A kind of break (Unlocked, or Distraction), with every Day it was measured. */
export type BreakDriver = { id: string; days: StretchDay[] };
/** The outcome id the break findings carry: a stretch's length in minutes. */
export const STRETCH = "~stretch";

/** 0 Very low (never shown), 1 Low, 2 Medium, 3 High. */
export type Confidence = 0 | 1 | 2 | 3;

export type Tested = {
  driver: string;
  outcome: string;
  /** "day": Days with the driver against Days without; "stretch": stretches after a break against stretches without. */
  per: "day" | "stretch";
  /** 0: the same Day; 1: the Day after. Always 0 for stretches. */
  lag: 0 | 1;
  withAvg: number;
  withoutAvg: number;
  /** Days (or stretches) in each group. */
  withN: number;
  withoutN: number;
  /** How much the outcome usually varies from Day to Day (or stretch to
   *  stretch): the standard deviation over both groups, in its own units. */
  spread: number;
  /** The change (with minus without) in spreads, ignoring direction. */
  effect: number;
  /** Week shuffles whose gap was at least as big, and how many were compared. */
  extreme: number;
  shuffles: number;
  /** (1 + extreme) / (1 + shuffles). */
  p: number;
  /** p corrected across every tested pair. */
  q: number;
  confidence: Confidence;
  /** Whether it passes the showing rule (see `shows`). */
  shown: boolean;
};

export type Options = {
  /** Pairs that are linked by how they are counted, not by anything you do. */
  skip?: (driver: string, outcome: string, lag: 0 | 1) => boolean;
};

// The showing rule, all in one place.
/** Fewest Days (or stretches) on each side. */
export const MIN_N = 8;
/** Fewest different Days each side's stretches come from. */
export const MIN_STRETCH_DAYS = 5;
/** Smallest change shown, in the outcome's own units (Vouchers, minutes, or percentage points). */
export const FLOOR = 0.5;
/** Smallest change shown, in spreads (see Tested.spread): Low and Medium
 *  need 0.3, High 0.2. A spread suits every unit alike, Vouchers, minutes,
 *  or percent. The standard deviation rather than a robust one
 *  (MAD × 1.4826): a source that earns on fewer than half the Days has a
 *  median of 0 and a MAD of 0, which would let any change through. */
export const EFFECT = 0.3;
export const EFFECT_HIGH = 0.2;
/** A break: at least this many minutes of it in the hour before a stretch starts. */
export const BREAK_MINUTES = 10;
export const BREAK_WINDOW = 60;
/** Week shuffles for every pair, and for a pair whose chance after those is
 *  under MORE_BELOW and isn't High yet. 2,000 alone can't get a lone finding
 *  to High: with about 110 pairs, the smallest chance (1 in 2,001) corrects
 *  to just over 0.05. 20,000 brings that to about 0.006. A pair stops early
 *  once ENOUGH shuffles have matched its gap (a chance of 5% or more), which
 *  keeps the 100-odd pairs to a few milliseconds. */
export const SHUFFLES = 2000;
export const MORE_SHUFFLES = 20000;
export const MORE_BELOW = 0.01;
export const ENOUGH = 100;

/** From the corrected chance q (the share of findings at this level or
 *  above that are expected to be flukes): High under 0.05, Medium under
 *  0.10, Low under 0.20, else Very low (too likely a fluke, so never shown). */
export const confidenceOf = (q: number): Confidence => (q < 0.05 ? 3 : q < 0.1 ? 2 : q < 0.2 ? 1 : 0);

/** At least MIN_N on each side and a change of at least FLOOR; then Low and
 *  Medium need a change of EFFECT spreads, High EFFECT_HIGH, and Very low
 *  never shows. */
export function shows(t: Omit<Tested, "shown">): boolean {
  if (t.withN < MIN_N || t.withoutN < MIN_N || !(t.spread > 0)) return false;
  if (Math.abs(t.withAvg - t.withoutAvg) < FLOOR || !t.confidence) return false;
  return t.effect >= (t.confidence === 3 ? EFFECT_HIGH : EFFECT);
}

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / DAY);

/** Benjamini-Hochberg: each p's false-discovery-adjusted value, in the same order. */
export function adjust(ps: number[]): number[] {
  const m = ps.length;
  const order = ps.map((p, i) => [p, i] as const).sort((a, b) => a[0] - b[0]);
  const q = new Array<number>(m);
  let low = 1;
  for (let r = m - 1; r >= 0; r--) {
    const [p, i] = order[r];
    low = Math.min(low, (p * m) / (r + 1));
    q[i] = low;
  }
  return q;
}

/** A small seeded generator (mulberry32): the same seed, the same shuffles. */
function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A seed from the Days (FNV-1a over the dates). */
function seedOf(days: string[]): number {
  let h = 0x811c9dc5;
  for (const d of days) for (let i = 0; i < d.length; i++) h = Math.imul(h ^ d.charCodeAt(i), 0x01000193);
  return h >>> 0;
}

/** Week shuffles, drawn as needed and shared by every pair: in `upTo(c)`,
 *  shuffle `s` sends week w's outcomes to week `list[s * weeks + w]`'s driver. */
type Shuffles = { weeks: number; upTo: (count: number) => Uint16Array };
function shufflesOf(weeks: number, seed: number): Shuffles {
  const next = random(seed);
  let list = new Uint16Array(0), made = 0;
  const upTo = (count: number) => {
    if (count <= made) return list;
    const W = weeks, more = new Uint16Array(count * W);
    more.set(list);
    for (let s = made; s < count; s++) {
      const o = s * W;
      for (let w = 0; w < W; w++) more[o + w] = w;
      for (let w = W - 1; w > 0; w--) {
        const k = Math.floor(next() * (w + 1));
        const t = more[o + w]; more[o + w] = more[o + k]; more[o + k] = t;
      }
    }
    list = more;
    made = count;
    return list;
  };
  return { weeks, upTo };
}

/** A pair's sums for every (outcome week, driver week): at `(w * W + u) * 6`,
 *  week w's outcomes against week u's driver, weekday by weekday, as the
 *  with sum, count, and Days, then the without sum, count, and Days. Any
 *  shuffle's gap is then one pass over the weeks instead of over every Day,
 *  and the real gap is the shuffle that leaves every week in place. */
type Table = Float64Array;
const S1 = 0, N1 = 1, D1 = 2, S0 = 3, N0 = 4, D0 = 5;

/** Each week's sums against its own week, added up: the real gap, or NaN
 *  when a side has fewer than MIN_N or comes from fewer than `minDays` Days.
 *  Writes the totals to `into`. */
function realGap(t: Table, W: number, minDays: number, into: Float64Array): number {
  let s1 = 0, n1 = 0, d1 = 0, s0 = 0, n0 = 0, d0 = 0;
  for (let w = 0; w < W; w++) {
    const k = (w * W + w) * 6;
    s1 += t[k]; n1 += t[k + 1]; d1 += t[k + 2]; s0 += t[k + 3]; n0 += t[k + 4]; d0 += t[k + 5];
  }
  into[S1] = s1; into[N1] = n1; into[D1] = d1; into[S0] = s0; into[N0] = n0; into[D0] = d0;
  return n1 >= MIN_N && n0 >= MIN_N && d1 >= minDays && d0 >= minDays ? s1 / n1 - s0 / n0 : NaN;
}

/** A pair's shuffle count so far: shuffles `[0, next)` drawn, `done` of
 *  them with both sides full, `extreme` at least as big as the real gap. */
type Tally = { t: Table; minDays: number; target: number; next: number; done: number; extreme: number };

/** Go on counting a pair's shuffles up to `upTo`, stopping once ENOUGH have
 *  matched; shuffles that leave a side short don't count. */
function count(shuffles: Shuffles, tally: Tally, upTo: number): void {
  const { t, minDays, target } = tally, W = shuffles.weeks, perm = shuffles.upTo(upTo);
  let { extreme, done } = tally, s = tally.next;
  for (; s < upTo && extreme < ENOUGH; s++) {
    const o = s * W;
    let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
    for (let w = 0, row = 0; w < W; w++, row += W) {
      const k = (row + perm[o + w]) * 6;
      s1 += t[k]; n1 += t[k + 1]; s0 += t[k + 3]; n0 += t[k + 4];
    }
    if (n1 < MIN_N || n0 < MIN_N) continue;
    if (minDays) {
      let d1 = 0, d0 = 0;
      for (let w = 0, row = 0; w < W; w++, row += W) { const k = (row + perm[o + w]) * 6; d1 += t[k + 2]; d0 += t[k + 5]; }
      if (d1 < minDays || d0 < minDays) continue;
    }
    done++;
    const g = s1 / n1 - s0 / n0;
    if (g >= target || -g >= target) extreme++;
  }
  tally.next = s; tally.done = done; tally.extreme = extreme;
}
const chance = (tally: Tally) => (1 + tally.extreme) / (1 + tally.done);

/** Minutes of `breaks` in the window before `start`. */
function before(breaks: [number, number][], start: number): number {
  let m = 0;
  for (const [a, b] of breaks) m += Math.max(0, Math.min(b, start) - Math.max(a, start - BREAK_WINDOW));
  return m;
}

/** One Day's stretches judged against another Day's breaks: sums and counts
 *  of the stretches with a break before and without. */
function dayBreaks(own: StretchDay, other: StretchDay) {
  let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
  for (const s of own.stretches) {
    if (before(other.breaks, s.start) >= BREAK_MINUTES) { s1 += s.minutes; n1++; } else { s0 += s.minutes; n0++; }
  }
  return { s1, n1, s0, n0 };
}

/** Every driver against every outcome, the same Day and the Day after, plus
 *  each kind of break against the stretches after it. `days` are ISO dates
 *  (gaps allowed); each series has one entry per Day in that order. Returns
 *  every tested pair (both groups had MIN_N), with its confidence corrected
 *  across all of them and whether it shows. */
export function correlate(days: string[], drivers: Driver[], outcomes: Outcome[], breaks: BreakDriver[] = [], options: Options = {}): Tested[] {
  const { skip } = options;
  const all = [...days, ...breaks.flatMap((b) => b.days.map((d) => d.day))];
  if (!all.length) return [];
  // Lay the Days on an unbroken calendar, so "the Day after" means the real
  // Day after; missing Days are unknown. Then cut it into Monday-to-Sunday
  // weeks: calendar Day i sits in slot i + lead, week (i + lead) / 7.
  const first = Math.min(...all.map(dayNumber));
  const n = Math.max(...all.map(dayNumber)) - first + 1;
  const lead = (first + 3) % 7; // Day 0 (1970-01-01) was a Thursday, 3 after Monday.
  const W = Math.ceil((n + lead) / 7);
  const shuffles = shufflesOf(W, seedOf([...new Set(all)].sort()));

  const at = days.map((d) => dayNumber(d) - first);
  const series = (src: ArrayLike<number>) => { const y = new Float64Array(n).fill(NaN); at.forEach((i, r) => (y[i] = src[r])); return y; };
  const flags = (src: ArrayLike<number>, lag: number) => {
    const c = new Int8Array(n).fill(-1);
    at.forEach((i, r) => { if (i + lag < n) c[i + lag] = src[r] === 1 ? 1 : src[r] === 0 ? 0 : -1; });
    return c;
  };
  const ys = outcomes.map((o) => ({ id: o.id, y: series(o.values) }));
  const out: Omit<Tested, "q" | "confidence" | "shown">[] = [];
  /** Each pair's shuffle count, in `out`'s order, kept only where more shuffles may follow. */
  const tallies: (Tally | undefined)[] = [];
  /** One table, reused pair after pair; a pair that may need more shuffles keeps a copy. */
  const table: Table = new Float64Array(W * W * 6);
  const tally = (minDays: number, real: number): Tally => {
    const x: Tally = { t: table, minDays, target: Math.abs(real) - 1e-9, next: 0, done: 0, extreme: 0 };
    count(shuffles, x, SHUFFLES);
    if (chance(x) < MORE_BELOW) { x.t = table.slice(); tallies.push(x); } else tallies.push(undefined);
    return x;
  };
  for (const d of drivers) {
    for (const lag of [0, 1] as const) {
      const c = flags(d.did, lag);
      for (const { id, y } of ys) {
        if (id === d.id || skip?.(d.id, id, lag)) continue;
        let s1 = 0, n1 = 0, s0 = 0, n0 = 0, sq = 0;
        for (let i = 0; i < n; i++) {
          const v = y[i];
          if (v !== v) continue;
          if (c[i] === 1) { s1 += v; n1++; sq += v * v; } else if (c[i] === 0) { s0 += v; n0++; sq += v * v; }
        }
        if (n1 < MIN_N || n0 < MIN_N) continue;
        const withAvg = s1 / n1, withoutAvg = s0 / n0, mean = (s1 + s0) / (n1 + n0);
        const spread = Math.sqrt(Math.max(0, (sq - (n1 + n0) * mean * mean) / (n1 + n0 - 1)));
        const diff = withAvg - withoutAvg;
        // Calendar Day i (in week w) against the same weekday j of every week u.
        const t = table.fill(0);
        for (let i = 0; i < n; i++) {
          const v = y[i];
          if (v !== v) continue;
          const w = ((i + lead) / 7) | 0, row = w * W;
          for (let u = 0, j = i - 7 * w; u < W; u++, j += 7) {
            if (j < 0 || j >= n || c[j] < 0) continue;
            const k = (row + u) * 6 + (c[j] === 1 ? S1 : S0);
            t[k] += v; t[k + 1]++;
          }
        }
        const x = tally(0, diff);
        out.push({ driver: d.id, outcome: id, per: "day", lag, withAvg, withoutAvg, withN: n1, withoutN: n0, spread,
          effect: spread > 0 ? Math.abs(diff) / spread : 0, extreme: x.extreme, shuffles: x.done, p: chance(x) });
      }
    }
  }
  for (const b of breaks) {
    const cal: (StretchDay | undefined)[] = new Array(n);
    for (const d of b.days) cal[dayNumber(d.day) - first] = d;
    // Week w's stretches against week u's breaks, weekday by weekday, with
    // how many Days each side's stretches come from.
    const t = table.fill(0);
    for (let i = 0; i < n; i++) {
      const own = cal[i];
      if (!own) continue;
      const w = ((i + lead) / 7) | 0, row = w * W;
      for (let u = 0, j = i - 7 * w; u < W; u++, j += 7) {
        const other = j < 0 || j >= n ? undefined : cal[j];
        if (!other) continue;
        const r = dayBreaks(own, other), k = (row + u) * 6;
        t[k + S1] += r.s1; t[k + N1] += r.n1; t[k + S0] += r.s0; t[k + N0] += r.n0;
        if (r.n1) t[k + D1]++;
        if (r.n0) t[k + D0]++;
      }
    }
    const totals = new Float64Array(6);
    const gap = realGap(t, W, MIN_STRETCH_DAYS, totals);
    if (gap !== gap) continue;
    const real = { s1: totals[S1], n1: totals[N1], s0: totals[S0], n0: totals[N0], gap };
    const withAvg = real.s1 / real.n1, withoutAvg = real.s0 / real.n0, mean = (real.s1 + real.s0) / (real.n1 + real.n0);
    let sq = 0;
    for (const d of cal) if (d) for (const s of d.stretches) sq += (s.minutes - mean) ** 2;
    const spread = Math.sqrt(sq / (real.n1 + real.n0 - 1));
    const x = tally(MIN_STRETCH_DAYS, real.gap);
    out.push({ driver: b.id, outcome: STRETCH, per: "stretch", lag: 0, withAvg, withoutAvg, withN: real.n1, withoutN: real.n0, spread,
      effect: spread > 0 ? Math.abs(real.gap) / spread : 0, extreme: x.extreme, shuffles: x.done, p: chance(x) });
  }
  // More shuffles where a small chance isn't High yet, then the final correction.
  const early = adjust(out.map((t) => t.p));
  out.forEach((t, i) => {
    if (t.p >= MORE_BELOW || confidenceOf(early[i]) === 3) return;
    const x = tallies[i]!;
    count(shuffles, x, MORE_SHUFFLES);
    t.extreme = x.extreme; t.shuffles = x.done; t.p = chance(x);
  });
  const qs = adjust(out.map((t) => t.p));
  return out.map((t, i) => {
    const r = { ...t, q: qs[i], confidence: confidenceOf(qs[i]) };
    return { ...r, shown: shows(r) };
  });
}
