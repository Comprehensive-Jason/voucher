// Before and after: did a change work? Around a Marker (a rule change, a
// new term, an Experiment), compare the 14 Days before it with 14 Days
// after, leaving out the first 3 after it while things settle. Then check
// luck: how often two stretches the same length, anywhere else in the
// history, differ by as much just from ordinary ups and downs. A change that
// other stretches often match isn't evidence yet.
//
// The Before and after card shows these for a Marker it steps through, and
// Insights judges Experiments and recent Markers with the same numbers. Pure,
// so it can be checked outside the app.
import { measured } from "./notes.svelte";
import { hoursAndMinutes } from "./time";
import type { DayTotal } from "./types";

/** Days compared on each side, and Days left out after the Marker. */
export const SPAN = 14;
export const SETTLE = 3;
/** The fewest after Days for a comparison, and the fewest other stretches for a luck check. */
export const MIN_AFTER = 5;
export const MIN_STRETCHES = 10;

/** What a measure needs besides the Days. `lateFrom` is minutes after the
 *  Day began (06:00) where late Distraction starts; `listed` says whether
 *  an app or site is on a blocklist. */
export type Context = { lateFrom?: number; listed?: (app: string, day: DayTotal) => boolean; dayStart?: (day: string) => number };

export type MeasureId = "earned" | "goal" | "distraction" | "unlocked" | "walked" | "longest" | "asleep" | "events"
  | "unlocks" | "late" | "went_well" | "per_unlock" | "other";

/** `better` says which way is good; "neither" (events) is neither green nor
 *  crimson. A change reads as "the same" when it's under 2 points (a share),
 *  under its own `same` in its unit, or else under 15%. Sleep takes 20
 *  minutes, since 15% of a night is over an hour. `table` puts it in the
 *  Before and after card's table. */
export type Measure = {
  id: MeasureId;
  name: string;
  of: (w: DayTotal[], ctx: Context) => number | null;
  unit: string;
  better: "up" | "down" | "neither";
  digits?: number;
  format?: (v: number) => string;
  same?: number;
  table: boolean;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
/** A Day's Distraction minutes, every app together. */
export const distractionOf = (d: DayTotal) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0);
/** Minutes of a Day's Distraction spans from `from` minutes after the Day began to its end. */
export function lateMinutes(d: DayTotal, from: number, dayStart: number): number | null {
  if (!d.distraction_spans) return null;
  let t = 0;
  for (const [a, b] of d.distraction_spans) {
    const x = (Date.parse(a) - dayStart) / 60_000, y = (Date.parse(b) - dayStart) / 60_000;
    t += Math.max(0, Math.min(y, 1440) - Math.max(x, from));
  }
  return t;
}

export const MEASURES: Measure[] = [
  { id: "earned", name: "Vouchers a Day", of: (w) => mean(w.map((d) => d.earned)), unit: "", better: "up", digits: 1, table: true },
  { id: "goal", name: "Goal Days", of: (w) => (w.length ? (w.filter((d) => d.goal_met).length / w.length) * 100 : null), unit: "%", better: "up", table: true },
  { id: "distraction", name: "Distracted per Day", of: (w) => mean(w.filter(measured).map(distractionOf)), unit: " min", better: "down", table: true },
  { id: "unlocked", name: "Unlocked per Day", of: (w) => mean(w.map((d) => d.unlocked_minutes ?? 0)), unit: " min", better: "down", table: true },
  { id: "walked", name: "Walked away", of: (w) => { const o = w.reduce((a, d) => a + (d.opens ?? 0), 0); return o ? (w.reduce((a, d) => a + (d.walked ?? 0), 0) / o) * 100 : null; }, unit: "%", better: "up", table: true },
  { id: "longest", name: "Longest focus", of: (w) => middle(w.filter((d) => d.stretches?.length).map((d) => Math.max(...d.stretches!))), unit: " min", better: "up", table: true },
  // Nights with no sleep on record, and Days with no calendar sent, are left out rather than counted as none.
  { id: "asleep", name: "Asleep a night", of: (w) => mean(w.flatMap((d) => (d.sleep ? [d.sleep.asleep] : []))), unit: " min", better: "up", format: hoursAndMinutes, same: 20, table: true },
  { id: "events", name: "Events a Day", of: (w) => mean(w.flatMap((d) => (d.calendar ? [d.calendar.events] : []))), unit: "", better: "neither", digits: 1, table: true },
  // Judged by Experiments and Insights, not in the card's table.
  { id: "unlocks", name: "Unlocks a Day", of: (w) => mean(w.map((d) => d.tears ?? 0)), unit: "", better: "down", digits: 1, table: false },
  { id: "late", name: "Late Distraction a Day", of: (w, c) => mean(w.flatMap((d) => { const m = c.dayStart && c.lateFrom != null ? lateMinutes(d, c.lateFrom, c.dayStart(d.day)) : null; return m === null ? [] : [m]; })), unit: " min", better: "down", table: false },
  { id: "went_well", name: "Days that went well", of: (w) => { const a = w.filter((d) => d.verdict); return a.length >= 3 ? (a.filter((d) => d.verdict !== "no").length / a.length) * 100 : null; }, unit: "%", better: "up", table: false },
  { id: "per_unlock", name: "Distraction per Unlock", of: (w) => { const m = w.filter((d) => measured(d) && (d.tears ?? 0) > 0); const t = m.reduce((a, d) => a + (d.tears ?? 0), 0); return t ? m.reduce((a, d) => a + distractionOf(d), 0) / t : null; }, unit: " min", better: "down", table: false },
  { id: "other", name: "Distraction on no blocklist", of: (w, c) => mean(w.filter(measured).map((d) => Object.entries(d.used ?? {}).reduce((a, [app, m]) => a + (c.listed?.(app, d) ? 0 : m), 0))), unit: " min", better: "down", table: false },
];
export const measureOf = (id: string) => MEASURES.find((m) => m.id === id);

/** The Days before a Marker on Day `at` (an index into `days`), and the Days after it once it has settled. */
export function sides(days: DayTotal[], at: number): { before: DayTotal[]; after: DayTotal[] } {
  return { before: days.slice(Math.max(0, at - SPAN), at), after: days.slice(at + SETTLE, at + SETTLE + SPAN) };
}

/** Whether a change from `a` to `b` is too small to call. */
export function same(m: Measure, a: number, b: number): boolean {
  return Math.abs(b - a) < (m.unit === "%" ? 2 : m.same ?? 0.15 * Math.max(1, Math.abs(a)));
}

/** True when the change went the good way, false the bad way, null when it's
 *  the same or neither way is better. */
export function better(m: Measure, a: number, b: number): boolean | null {
  if (same(m, a, b) || m.better === "neither") return null;
  return (b > a) === (m.better === "up");
}

/** A value as the table shows it: "12.5", "40%", "18 min". */
export function show(v: number, m: Measure): string {
  if (m.format) return m.format(v);
  return `${m.digits ? v.toFixed(m.digits).replace(/\.0$/, "") : Math.round(v)}${m.unit}`;
}

/** Luck: the share (0 to 100) of other same-length stretches anywhere in the
 *  history whose change in `m` is at least as big as this one's, and how
 *  many were compared; null with fewer than MIN_STRETCHES. */
export function luck(days: DayTotal[], at: number, m: Measure, ctx: Context = {}): { share: number; total: number } | null {
  const { before, after } = sides(days, at);
  if (after.length < MIN_AFTER) return null;
  const a = m.of(before, ctx), b = m.of(after, ctx);
  if (a === null || b === null) return null;
  const n = after.length, observed = Math.abs(b - a);
  let total = 0, asBig = 0;
  for (let p = SPAN; p + SETTLE + n <= days.length; p++) {
    if (Math.abs(p - at) < SPAN) continue;
    const x = m.of(days.slice(p - SPAN, p), ctx), y = m.of(days.slice(p + SETTLE, p + SETTLE + n), ctx);
    if (x === null || y === null) continue;
    total++;
    if (Math.abs(y - x) >= observed - 1e-9) asBig++;
  }
  return total >= MIN_STRETCHES ? { share: Math.round((asBig / total) * 100), total } : null;
}

/** How sure, from a luck share: 3 bars at 5% or under, 2 at 10%, 1 at 20%, else 0. */
export const confidenceOfShare = (share: number): 0 | 1 | 2 | 3 => (share <= 5 ? 3 : share <= 10 ? 2 : share <= 20 ? 1 : 0);

/** One measure either side of a Marker on Day `at`, with its luck check. */
export type Compared = { measure: Measure; a: number; b: number; luck: { share: number; total: number } | null };
export function compareAt(days: DayTotal[], at: number, m: Measure, ctx: Context = {}): Compared | null {
  const { before, after } = sides(days, at);
  if (after.length < MIN_AFTER) return null;
  const a = m.of(before, ctx), b = m.of(after, ctx);
  return a === null || b === null ? null : { measure: m, a, b, luck: luck(days, at, m, ctx) };
}
