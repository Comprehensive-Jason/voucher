// What goes with what, Day by Day, and how sure to be of it. For a driver
// (a yes/no per Day: did Workout earn?) and an outcome (a number per Day:
// Chinese Vouchers, minutes in Distractions), compare the outcome's plain
// average on Days with the driver against Days without, on the same Day or
// the Day after. Then ask how often chance gives a gap that big: slide the
// driver's Days along the calendar (wrapping round), which keeps how its Days
// bunch and how often they come but breaks any tie to the outcome, and count
// the slides whose gap is at least as big either way. Slides of a week or
// less are skipped, since a streak would still mostly line up with itself.
// Testing many pairs at once turns some up by luck, so every tested pair's
// chance is corrected together (Benjamini-Hochberg) before it becomes a
// confidence. Pure, so it can be checked outside the app.

/** One per Day, on the `days` list the caller gives: the outcome's value, or NaN when unknown. */
export type Outcome = { id: string; values: ArrayLike<number> };
/** One per Day: 1 if the driver happened, 0 if not, -1 when unknown. */
export type Driver = { id: string; did: ArrayLike<number> };

export type Tested = {
  driver: string;
  outcome: string;
  /** 0: the same Day; 1: the Day after. */
  lag: 0 | 1;
  withAvg: number;
  withoutAvg: number;
  withN: number;
  withoutN: number;
  /** The outcome's usual level: its average over both groups. */
  usual: number;
  /** The change (with minus without) as a share of the usual level, ignoring direction. */
  share: number;
  /** Whether it passes the rules for showing (size and floor; group sizes hold for every tested pair). */
  shown: boolean;
  /** Calendar slides whose gap was at least as big, and how many slides were compared. */
  extreme: number;
  shifts: number;
  /** (1 + extreme) / (1 + shifts). */
  p: number;
  /** p corrected across every tested pair. */
  q: number;
  /** 1 Low, 2 Medium, 3 High. */
  confidence: 1 | 2 | 3;
};

export type Options = {
  /** Fewest Days in each group. */
  min?: number;
  /** Smallest change worth showing, as a share of the usual level. */
  share?: number;
  /** Smallest change worth showing, in the outcome's own units. */
  floor?: number;
  /** Slides this close to zero (in Days, either way) are skipped. */
  guard?: number;
  /** Pairs that are linked by how they are counted, not by anything you do. */
  skip?: (driver: string, outcome: string) => boolean;
};

const DAY = 86_400_000;
const dayNumber = (iso: string) => Math.round(Date.parse(`${iso}T12:00:00Z`) / DAY);

/** High under 0.05 after correction, Medium under 0.2, else Low. */
export const confidenceOf = (q: number): 1 | 2 | 3 => (q < 0.05 ? 3 : q < 0.2 ? 2 : 1);

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

/** The circular-shift test for one pair: how many slides beat the real gap, out of how many. */
export function shiftTest(y: Float64Array, c: Int8Array, real: number, min: number, guard: number): { extreme: number; shifts: number } {
  return slide(known(y), c, y.length, real, min, guard);
}
function slide(y: Known, c: Int8Array, n: number, real: number, min: number, guard: number): { extreme: number; shifts: number } {
  const target = Math.abs(real) - 1e-9;
  let extreme = 0, shifts = 0;
  for (let k = guard + 1; k <= n - guard - 1; k++) {
    const g = gapAt(y, c, n, k, min);
    if (g !== g) continue;
    shifts++;
    if (Math.abs(g) >= target) extreme++;
  }
  return { extreme, shifts };
}

/** Every driver against every outcome, the same Day and the Day after.
 *  `days` are ISO dates (gaps allowed); each series has one entry per Day in
 *  that order. Returns every tested pair (both groups had `min` Days), with
 *  its confidence corrected across all of them. */
export function correlate(days: string[], drivers: Driver[], outcomes: Outcome[], options: Options = {}): Tested[] {
  const { min = 8, share = 0.25, floor = 0.5, guard = 7, skip } = options;
  if (!days.length) return [];
  // Lay the Days on an unbroken calendar, so "the Day after" and a slide of k
  // Days mean real Days; missing Days are unknown.
  const nums = days.map(dayNumber);
  const first = Math.min(...nums);
  const n = Math.max(...nums) - first + 1;
  const at = nums.map((d) => d - first);
  const series = (src: ArrayLike<number>) => { const y = new Float64Array(n).fill(NaN); at.forEach((i, r) => (y[i] = src[r])); return y; };
  const flags = (src: ArrayLike<number>, lag: number) => {
    const c = new Int8Array(n).fill(-1);
    at.forEach((i, r) => { if (i + lag < n) c[i + lag] = src[r] === 1 ? 1 : src[r] === 0 ? 0 : -1; });
    return c;
  };
  const ys = outcomes.map((o) => { const y = series(o.values); return { id: o.id, y, k: known(y) }; });
  const out: Omit<Tested, "q" | "confidence">[] = [];
  for (const d of drivers) {
    for (const lag of [0, 1] as const) {
      const c = flags(d.did, lag);
      for (const { id, y, k } of ys) {
        if (id === d.id || skip?.(d.id, id)) continue;
        let s1 = 0, n1 = 0, s0 = 0, n0 = 0;
        for (let i = 0; i < n; i++) {
          const v = y[i];
          if (v !== v) continue;
          if (c[i] === 1) { s1 += v; n1++; } else if (c[i] === 0) { s0 += v; n0++; }
        }
        if (n1 < min || n0 < min) continue;
        const withAvg = s1 / n1, withoutAvg = s0 / n0, usual = (s1 + s0) / (n1 + n0);
        const diff = withAvg - withoutAvg;
        const size = usual ? Math.abs(diff) / usual : 0;
        const { extreme, shifts } = slide(k, c, n, diff, min, guard);
        out.push({
          driver: d.id, outcome: id, lag, withAvg, withoutAvg, withN: n1, withoutN: n0, usual, share: size,
          shown: usual > 0 && size >= share && Math.abs(diff) >= floor,
          extreme, shifts, p: (1 + extreme) / (1 + shifts),
        });
      }
    }
  }
  const qs = adjust(out.map((t) => t.p));
  return out.map((t, i) => ({ ...t, q: qs[i], confidence: confidenceOf(qs[i]) }));
}
