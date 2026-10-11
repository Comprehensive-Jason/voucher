// What goes with what, and how sure to be of it. Two kinds of comparison
// share one set of rules:
//
// Day by Day. For a driver (a yes/no per Day: did Workout earn?) and an
// outcome (a number per Day: Chinese Vouchers, the longest focus stretch),
// compare the outcome's plain average on Days with the driver against Days
// without, on the same Day or the Day after. Then ask how often chance gives
// a gap that big: slide the driver's Days along the calendar (wrapping
// round), which keeps how its Days bunch and how often they come but breaks
// any tie to the outcome, and count the slides whose gap is at least as big
// either way. Slides of a week or less are skipped, since a streak would
// still mostly line up with itself.
//
// Stretch by stretch (breaks). Did a focus stretch have a break (Unlocked or
// Distraction time) in the hour before it started, and was it longer or
// shorter than the stretches without one? Stretches on the same Day aren't
// independent (a scattered Day has short stretches and many breaks), so
// chance is judged a whole Day at a time: each Day's stretches are checked
// against another Day's breaks, slid along the calendar the same way, so a
// Day's stretches always move together and so do its breaks.
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
  /** The outcome's usual level: its average over both groups. */
  usual: number;
  /** The change (with minus without) as a share of the usual level, ignoring direction. */
  share: number;
  /** Calendar slides whose gap was at least as big, and how many slides were compared. */
  extreme: number;
  shifts: number;
  /** (1 + extreme) / (1 + shifts). */
  p: number;
  /** p corrected across every tested pair. */
  q: number;
  confidence: Confidence;
  /** Whether it passes the showing rule (see `shows`). */
  shown: boolean;
};

export type Options = {
  /** Slides this close to zero (in Days, either way) are skipped. */
  guard?: number;
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
/** Smallest change shown, as a share of the usual level: Low and Medium need a quarter, High a tenth. */
export const SHARE = 0.25;
export const SHARE_HIGH = 0.1;
/** A break: at least this many minutes of it in the hour before a stretch starts. */
export const BREAK_MINUTES = 10;
export const BREAK_WINDOW = 60;

/** From the corrected chance q: High under 0.05, Medium under 0.2, Low under
 *  0.5, else Very low (more likely a fluke than real, so never shown). */
export const confidenceOf = (q: number): Confidence => (q < 0.05 ? 3 : q < 0.2 ? 2 : q < 0.5 ? 1 : 0);

/** At least MIN_N on each side and a change of at least FLOOR; then Low and
 *  Medium need a change of a quarter of the usual level, High a tenth, and
 *  Very low never shows. */
export function shows(t: Omit<Tested, "shown">): boolean {
  if (t.withN < MIN_N || t.withoutN < MIN_N || !(t.usual > 0)) return false;
  if (Math.abs(t.withAvg - t.withoutAvg) < FLOOR || !t.confidence) return false;
  return t.share >= (t.confidence === 3 ? SHARE_HIGH : SHARE);
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

/** An outcome's known Days only (calendar index and value), so the slides skip the unknowns. */
type Known = { at: Int32Array; v: Float64Array };
function known(y: Float64Array): Known {
  const at: number[] = [], v: number[] = [];
  y.forEach((x, i) => { if (x === x) { at.push(i); v.push(x); } });
  return { at: Int32Array.from(at), v: Float64Array.from(v) };
}

/** The with-minus-without gap with `c` slid `k` Days along a calendar of `n` (wrapping), or NaN when either group has fewer than `min`. */
function gapAt({ at, v }: Known, c: Int8Array, n: number, k: number, min: number): number {
  let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
  for (let r = 0; r < at.length; r++) {
    let j = at[r] - k;
    if (j < 0) j += n;
    const f = c[j];
    if (f === 1) { s1 += v[r]; n1++; } else if (f === 0) { s0 += v[r]; n0++; }
  }
  return n1 >= min && n0 >= min ? s1 / n1 - s0 / n0 : NaN;
}

/** Count the slides (past the guard either way) whose gap is at least as big as `real`. */
function slide(n: number, real: number, guard: number, gap: (k: number) => number): { extreme: number; shifts: number } {
  const target = Math.abs(real) - 1e-9;
  let extreme = 0, shifts = 0;
  for (let k = guard + 1; k <= n - guard - 1; k++) {
    const g = gap(k);
    if (g !== g) continue;
    shifts++;
    if (Math.abs(g) >= target) extreme++;
  }
  return { extreme, shifts };
}

/** The circular-shift test for one Day-level pair: how many slides beat the real gap, out of how many. */
export function shiftTest(y: Float64Array, c: Int8Array, real: number, min: number, guard: number): { extreme: number; shifts: number } {
  const k = known(y);
  return slide(y.length, real, guard, (s) => gapAt(k, c, y.length, s, min));
}

/** Minutes of `breaks` in the window before `start`. */
function before(breaks: [number, number][], start: number): number {
  let m = 0;
  for (const [a, b] of breaks) m += Math.max(0, Math.min(b, start) - Math.max(a, start - BREAK_WINDOW));
  return m;
}

/** Stretches after a break against stretches without, judging calendar Day
 *  `i`'s stretches against Day `j(i)`'s breaks; NaN-gapped when either side
 *  is short of MIN_N stretches or MIN_STRETCH_DAYS Days. */
function breakGap(cal: (StretchDay | undefined)[], j: (i: number) => number) {
  let s1 = 0, n1 = 0, d1 = 0, s0 = 0, n0 = 0, d0 = 0;
  for (let i = 0; i < cal.length; i++) {
    const own = cal[i], other = cal[j(i)];
    if (!own || !other) continue;
    let with_ = 0, without = 0;
    for (const s of own.stretches) {
      if (before(other.breaks, s.start) >= BREAK_MINUTES) { s1 += s.minutes; with_++; } else { s0 += s.minutes; without++; }
    }
    n1 += with_; n0 += without;
    if (with_) d1++;
    if (without) d0++;
  }
  const enough = n1 >= MIN_N && n0 >= MIN_N && d1 >= MIN_STRETCH_DAYS && d0 >= MIN_STRETCH_DAYS;
  return { gap: enough ? s1 / n1 - s0 / n0 : NaN, s1, n1, s0, n0, enough };
}

/** Every driver against every outcome, the same Day and the Day after, plus
 *  each kind of break against the stretches after it. `days` are ISO dates
 *  (gaps allowed); each series has one entry per Day in that order. Returns
 *  every tested pair (both groups had MIN_N), with its confidence corrected
 *  across all of them and whether it shows. */
export function correlate(days: string[], drivers: Driver[], outcomes: Outcome[], breaks: BreakDriver[] = [], options: Options = {}): Tested[] {
  const { guard = 7, skip } = options;
  const all = [...days, ...breaks.flatMap((b) => b.days.map((d) => d.day))];
  if (!all.length) return [];
  // Lay the Days on an unbroken calendar, so "the Day after" and a slide of k
  // Days mean real Days; missing Days are unknown.
  const first = Math.min(...all.map(dayNumber));
  const n = Math.max(...all.map(dayNumber)) - first + 1;
  const at = days.map((d) => dayNumber(d) - first);
  const series = (src: ArrayLike<number>) => { const y = new Float64Array(n).fill(NaN); at.forEach((i, r) => (y[i] = src[r])); return y; };
  const flags = (src: ArrayLike<number>, lag: number) => {
    const c = new Int8Array(n).fill(-1);
    at.forEach((i, r) => { if (i + lag < n) c[i + lag] = src[r] === 1 ? 1 : src[r] === 0 ? 0 : -1; });
    return c;
  };
  const ys = outcomes.map((o) => { const y = series(o.values); return { id: o.id, y, k: known(y) }; });
  const out: Omit<Tested, "q" | "confidence" | "shown">[] = [];
  for (const d of drivers) {
    for (const lag of [0, 1] as const) {
      const c = flags(d.did, lag);
      for (const { id, y, k } of ys) {
        if (id === d.id || skip?.(d.id, id, lag)) continue;
        let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
        for (let i = 0; i < n; i++) {
          const v = y[i];
          if (v !== v) continue;
          if (c[i] === 1) { s1 += v; n1++; } else if (c[i] === 0) { s0 += v; n0++; }
        }
        if (n1 < MIN_N || n0 < MIN_N) continue;
        const withAvg = s1 / n1, withoutAvg = s0 / n0, usual = (s1 + s0) / (n1 + n0);
        const diff = withAvg - withoutAvg;
        const { extreme, shifts } = slide(n, diff, guard, (s) => gapAt(k, c, n, s, MIN_N));
        out.push({ driver: d.id, outcome: id, per: "day", lag, withAvg, withoutAvg, withN: n1, withoutN: n0, usual,
          share: usual ? Math.abs(diff) / usual : 0, extreme, shifts, p: (1 + extreme) / (1 + shifts) });
      }
    }
  }
  for (const b of breaks) {
    const cal: (StretchDay | undefined)[] = new Array(n);
    for (const d of b.days) cal[dayNumber(d.day) - first] = d;
    const real = breakGap(cal, (i) => i);
    if (!real.enough) continue;
    const withAvg = real.s1 / real.n1, withoutAvg = real.s0 / real.n0, usual = (real.s1 + real.s0) / (real.n1 + real.n0);
    const { extreme, shifts } = slide(n, real.gap, guard, (k) => breakGap(cal, (i) => (i - k + n) % n).gap);
    out.push({ driver: b.id, outcome: STRETCH, per: "stretch", lag: 0, withAvg, withoutAvg, withN: real.n1, withoutN: real.n0, usual,
      share: usual ? Math.abs(real.gap) / usual : 0, extreme, shifts, p: (1 + extreme) / (1 + shifts) });
  }
  const qs = adjust(out.map((t) => t.p));
  return out.map((t, i) => {
    const r = { ...t, q: qs[i], confidence: confidenceOf(qs[i]) };
    return { ...r, shown: shows(r) };
  });
}
