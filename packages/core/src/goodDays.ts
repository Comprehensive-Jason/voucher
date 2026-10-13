// What goes with a good Day, as correlate.ts tests it: for each source, the
// Days it earned against the Days it didn't, on the same Day and the Day
// after: did another source earn more, did fewer blocked opens end in an
// Unlock, was the Day's longest focus stretch longer, or the night after
// longer? A good night, a busy calendar, and late Distraction are drivers
// too (rules below), and a focus stretch with an Unlock or Distraction in the
// hour before it is set against stretches without. Plain averages, no
// guessing at causes. Unlocks and Distraction are never Day drivers of
// Voucher outcomes, and Unlocked minutes never an outcome: earning is what
// pays for Unlocks, so those pairs would partly be the Bank's own
// bookkeeping. For the same reason Distraction minutes are an outcome only of
// what lies outside that economy (a good night and a busy calendar), never
// of a source; late Distraction goes only with the night after. A Day
// without the data (no night recorded, no calendar chosen, no device
// reporting Distraction, no Distraction spans) is missing, never zero.
//
// This builds the drivers, outcomes, and the request for the worker
// (correlateOff.ts), with the names and colors to say each finding by.
// Counterfoil's Good Days card lists every finding; Voucher's Insights
// card shows them among its others.
import { skippedPairs, STRETCH, type BreakDriver, type Request, type StretchDay, type Tested } from "./correlate";
import { measured } from "./notes.svelte";
import { styleOf } from "./sources";
import { clock } from "./time";
import type { DayTotal } from "./types";

// The rules for the drivers that aren't sources, each against the person's
// own Days in the range shown, never a fixed norm.
/** A good night: asleep at least as long as half the nights recorded (the
 *  median), so the two sides fill up equally fast and "good" is measured
 *  against your own nights, not a textbook eight hours. */
export const GOOD_NIGHT_SHARE = 1 / 2;
/** A busy Day: calendar busy minutes among the top third of the Days with
 *  calendar data, out of the ordinary while still common enough to reach
 *  MIN_N within a few weeks. A Day with no busy minutes is never busy. */
export const BUSY_SHARE = 1 / 3;
/** Late Distraction: at least LATE_MINUTES of Distraction from LATE_FROM
 *  (22:00 on the clock) until the Day ends. */
export const LATE_FROM = 22 * 60;
export const LATE_MINUTES = 15;

export type Unit = "vouchers" | "minutes" | "percent";
/** Something that changes from Day to Day: its name, color, unit, which way is better, and its value on a Day (NaN when unknown). */
export type Measure = { id: string; name: string; color: string; unit: Unit; up: boolean; note: string; value: (d: DayTotal) => number };
/** Something that happens or doesn't, as a finding names it: on its Day, the Day after, and (against sleep) the night after. */
export type Doer = { id: string; name: string; color: string; days: string; after: string; night: string };
/** A Day driver: 1 on Days it happened, 0 on Days it didn't, -1 when unknown. */
export type DayDriver = { id: string; name: string; did: number[] };

export const SLEEP = "~asleep", DISTRACTED = "~distracted", GOOD_NIGHT = "~goodnight", BUSY = "~busy", LATE = "~late";

/** Finished Days the log still holds hours for: what the comparison reads. */
export const comparedDays = (history: DayTotal[]) => history.slice(0, -1).filter((d) => d.hours && d.hours.length);
/** The fields of a Day the comparison reads, as text, to tell when a new history changes nothing. */
export const readOf = (d: DayTotal) => JSON.stringify([d.day, d.by_source, d.opens, d.walked, d.stretches, d.used, d.reported, d.sleep?.asleep, d.calendar?.busy_minutes, d.distraction_spans, d.timed_stretches, d.unlocks]);

/** The Day's longest focus stretch, as Before and after's "Longest focus" takes it. */
const longest = (d: DayTotal) => (d.stretches?.length ? Math.max(...d.stretches) : NaN);
/** The Day's Distraction minutes, every app and device together, or NaN when no device reported. */
const distracted = (d: DayTotal) => (measured(d) ? Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) : NaN);
/** Sources that are time in an app: a session there is itself a focus stretch. Tasks, Workout, and Steps aren't. */
const makesStretches = (id: string) => !["tasks", "workout", "steps"].includes(id);
/** The value that `share` of `values` are at or above. */
const topShare = (values: number[], share: number) => [...values].sort((a, b) => a - b)[values.length - Math.ceil(values.length * share)];

/** Pairs left untested. A night belongs to the Day it leads into, so it
 *  is an outcome only of the Day before (lag 1, "Night after") and a
 *  driver only of its own Day (lag 0): each night meets each Day once. */
export function skip(driver: string, outcome: string, lag: 0 | 1): boolean {
  // Distraction minutes are what Unlocks are spent on and what earning
  // pays for, so only drivers outside that economy go with them.
  if (outcome === DISTRACTED) return !(driver === BUSY || (driver === GOOD_NIGHT && lag === 0));
  // An Anki session both makes an Anki Day and is a focus stretch, so the same Day's pair says nothing.
  if (lag === 0 && outcome === "~longest" && makesStretches(driver)) return true;
  if (outcome === SLEEP && lag === 0) return true;
  if (driver === GOOD_NIGHT) return lag === 1 || outcome === SLEEP;
  // Late Distraction only with the night after.
  if (driver === LATE) return !(lag === 1 && outcome === SLEEP);
  return false;
}

export type GoodDaySetup = {
  measures: Measure[];
  /** Stretch by stretch, after a break or not; see correlate.ts. */
  lengths: Measure;
  doers: Doer[];
  dayDrivers: DayDriver[];
  breaks: BreakDriver[];
  request: Request;
  measureOf: Map<string, Measure>;
  doerOf: Map<string, Doer>;
  /** The least sleep a good night has, in minutes (Infinity before any night). */
  goodNight: number;
};

/** Everything the comparison needs for these Days, on the Ledger's clock,
 *  with the Day starting `dayStart` minutes after midnight (Curfew's end). */
export function goodDaySetup(days: DayTotal[], timeZone: string, dayStart: number): GoodDaySetup {
  const sources = [...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))];
  const measures: Measure[] = [
    ...sources.map((id): Measure => {
      const s = styleOf(id);
      return { id, name: s.name, color: s.color, unit: "vouchers", up: true, note: "Vouchers", value: (d) => d.by_source?.[id] ?? 0 };
    }),
    // Blocked opens that ended in an Unlock, rather than the ones walked away
    // from: the smaller share, so its ratio moves more for the same change.
    { id: "~gavein", name: "Gave in", color: "var(--muted)", unit: "percent", up: false, note: "% of blocked opens", value: (d) => (d.opens ? ((d.opens - Math.min(d.walked ?? 0, d.opens)) / d.opens) * 100 : NaN) },
    { id: "~longest", name: "Longest focus stretch", color: "var(--ink)", unit: "minutes", up: true, note: "minutes", value: longest },
    { id: DISTRACTED, name: "Distraction", color: "var(--muted)", unit: "minutes", up: false, note: "minutes", value: distracted },
    // The night that led into the Day.
    { id: SLEEP, name: "Time asleep", color: "var(--sleep)", unit: "minutes", up: true, note: "minutes", value: (d) => d.sleep?.asleep ?? NaN },
  ];
  const lengths: Measure = { id: STRETCH, name: "Focus stretch length", color: "var(--ink)", unit: "minutes", up: true, note: "minutes", value: () => NaN };
  const doers: Doer[] = [
    ...sources.map((id): Doer => { const s = styleOf(id); return { id, name: s.name, color: s.color, days: `${s.short} Days`, after: `Day after ${s.short}`, night: `Night after ${s.short}` }; }),
    { id: "~unlock", name: "Unlock", color: "var(--spend)", days: "After an Unlock", after: "After an Unlock", night: "" },
    { id: "~distraction", name: "Distraction", color: "var(--muted)", days: "After Distraction", after: "After Distraction", night: "" },
    { id: GOOD_NIGHT, name: "Good nights", color: "var(--night)", days: "After a good night", after: "", night: "" },
    { id: BUSY, name: "Busy Days", color: "var(--ink)", days: "Busy Days", after: "Day after a busy Day", night: "Night after a busy Day" },
    { id: LATE, name: "Late Distraction", color: "var(--muted)", days: "", after: "", night: "Late Distraction" },
  ];

  // Moments as minutes after the Day began (Curfew's end), on the Ledger's clock.
  const sinceStart = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h * 60 + m - dayStart + 1440) % 1440; };
  const span = ([a, b]: [string, string]): [number, number] => { const from = sinceStart(a); return [from, from + (Date.parse(b) - Date.parse(a)) / 60_000]; };
  /** Minutes of Distraction from LATE_FROM to the Day's end, or NaN without spans. */
  const lateMinutes = (d: DayTotal) => {
    if (!d.distraction_spans) return NaN;
    const from = (LATE_FROM - dayStart + 1440) % 1440;
    return d.distraction_spans.map(span).reduce((t, [a, b]) => t + Math.max(0, Math.min(b, 1440) - Math.max(a, from)), 0);
  };
  const nights = days.flatMap((d) => (d.sleep ? [d.sleep.asleep] : []));
  const goodNight = nights.length ? topShare(nights, GOOD_NIGHT_SHARE) : Infinity;
  const loads = days.flatMap((d) => (d.calendar ? [d.calendar.busy_minutes] : []));
  const busy = loads.length ? topShare(loads, BUSY_SHARE) : Infinity;
  const dayDrivers: DayDriver[] = [
    ...sources.map((id) => ({ id, name: styleOf(id).name, did: days.map((d) => ((d.by_source?.[id] ?? 0) > 0 ? 1 : 0)) })),
    { id: GOOD_NIGHT, name: "Good nights", did: days.map((d) => (d.sleep ? (d.sleep.asleep >= goodNight ? 1 : 0) : -1)) },
    { id: BUSY, name: "Busy Days", did: days.map((d) => (d.calendar ? (d.calendar.busy_minutes > 0 && d.calendar.busy_minutes >= busy ? 1 : 0) : -1)) },
    { id: LATE, name: "Late Distraction", did: days.map((d) => { const m = lateMinutes(d); return m === m ? (m >= LATE_MINUTES ? 1 : 0) : -1; }) },
  ];
  // Each Day's timed stretches against its Unlocks, and against its Distraction where every device sent spans.
  const unlock: StretchDay[] = [], distraction: StretchDay[] = [];
  for (const d of days) {
    const stretches = (d.timed_stretches ?? []).map((s) => ({ start: sinceStart(s.start), minutes: s.minutes }));
    if (!stretches.length) continue;
    if (d.unlocks) unlock.push({ day: d.day, stretches, breaks: d.unlocks.map(span) });
    if (d.distraction_spans) distraction.push({ day: d.day, stretches, breaks: d.distraction_spans.map(span) });
  }
  const breaks: BreakDriver[] = [{ id: "~unlock", days: unlock }, { id: "~distraction", days: distraction }];

  const drivers = dayDrivers.map(({ id, did }) => ({ id, did }));
  const outcomes = measures.map((m) => ({ id: m.id, values: days.map(m.value) }));
  const request: Request = { days: days.map((d) => d.day), drivers, outcomes, breaks, skipped: skippedPairs(drivers, outcomes, skip) };
  return {
    measures, lengths, doers, dayDrivers, breaks, request, goodNight,
    measureOf: new Map([...measures, lengths].map((m) => [m.id, m])),
    doerOf: new Map(doers.map((d) => [d.id, d])),
  };
}

/** A finding as `pairKey` names it. */
export const findingKey = (f: Tested) => `${f.driver}|${f.outcome}|${f.lag}`;
/** Whether Days with the driver went the good way. */
export const better = (f: Tested, o: Measure) => (o.up ? f.withAvg > f.withoutAvg : f.withAvg < f.withoutAvg);
/** A value in its unit: "2.5", "18", "9%". */
export const num = (v: number, u: Unit) => (u === "vouchers" ? v.toFixed(1) : `${Math.round(v)}${u === "percent" ? "%" : ""}`);
/** The change, signed with a real minus: "+0.8", "−18 min", or "+9%". */
export const change = (f: Tested, u: Unit) => {
  const d = f.withAvg - f.withoutAvg;
  return `${d < 0 ? "−" : "+"}${num(Math.abs(d), u)}${u === "minutes" ? " min" : ""}`;
};
/** How a finding names its driver: "Anki Days", "Day after Workout", "Night after Anki". */
export const driverWords = (f: Tested, d: Doer) => (!f.lag ? d.days : f.outcome === SLEEP ? d.night : d.after);
