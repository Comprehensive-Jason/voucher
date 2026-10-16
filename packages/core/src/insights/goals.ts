// Goal findings: how each goal (the Daily goal among them, $core/goals.ts)
// has been going, and which goals go together.
//
//   Hit-rate shifts. A goal's hit rate over the last 4 weeks against the 8
//   weeks before: "Sleep goal, last 4 weeks". For a Day goal, the last 28
//   finished Days against the 56 before; for a week goal, the last 4
//   finished weeks against the 8 before.
//
//   Conflicts and helpers. Whether the Days (or weeks) that meet goal A
//   tend to miss goal B ("Tasks goal Days: Sleep goal", a conflict), or to
//   meet it too (a helper). B's hit rate on A's met Days against A's missed
//   ones, each pair once, on the same Day: a week goal counts for each Day of
//   its week. Goals whose measures are parts of one another (Vouchers and a
//   source's Vouchers, a source's Vouchers and its Days, focus minutes and
//   the longest stretch or a focus source's Vouchers) go together by how
//   they're counted, so they aren't compared.
//
// How sure: the same week shuffles as What goes with a good Day
// (correlate.ts), with a goal met (100) or missed (0) as the outcome and
// "in the last 4 weeks", or "goal A met", as the driver. Shuffling whole
// Monday-to-Sunday weeks keeps a week goal's Days together. Every goal test
// is corrected together (Benjamini-Hochberg) and gets the same tiers and
// showing rule, so the bars mean what they mean on every other finding.
// Week goals need at least 4 weeks on each side as well.
import type { Run } from "../about";
import { correlate, type Tested } from "../correlate";
import { evaluate, measureInfo, type Goal, type GoalRecord, type MeasureInfo, type Named, type PeriodOf } from "../goals";
import { mondayOf } from "../trends";
import { styleOf } from "../sources";
import { clamp, signed, type Context } from "./context";
import { goalPair, goalPairNote, goalShift, goalShiftNote } from "./text";
import type { Finding } from "./types";

/** Finished Days in "the last 4 weeks" and in the weeks before them. */
const RECENT_DAYS = 28, BEFORE_DAYS = 56;
const RECENT_WEEKS = 4, BEFORE_WEEKS = 8;
/** The fewest known Days before the last 4 weeks for a Day goal's shift, and weeks each side for anything weekly. */
const MIN_BEFORE_DAYS = 14, MIN_WEEKS = 4;
/** The least change in a hit rate that counts, in percentage points. */
const FLOOR = 10;

const RECENT_DAY = "~recent:day", RECENT_WEEK = "~recent:week";

/** Whether two measures move together just by how they're counted. */
function linked(a: string, b: string, sources: Context["sources"]): boolean {
  const part = (whole: string, x: string) => {
    const [kind, id] = x.split(/:(.*)/s);
    if (whole === "vouchers") return kind === "source" || kind === "source_days";
    if (whole === "focus") return x === "longest" || (kind.startsWith("source") && sources?.[id]?.kind === "focus");
    if (whole.startsWith("source:")) return x === `source_days:${whole.slice(7)}`;
    return false;
  };
  return a === b || part(a, b) || part(b, a);
}
const metId = (id: string) => `met:${id}`;

/** How a goal is named in a sentence: "Sleep goal", "Tasks goal" with the
 *  source in its color, "Daily goal". A week goal sharing its name with
 *  another goal is "Weekly …". */
export function goalRuns(g: Goal, info: MeasureInfo, all: { g: Goal; info: MeasureInfo }[]): Run[] {
  if (g.daily) return [{ text: "Daily goal" }];
  const twin = all.some((o) => o.g.id !== g.id && !o.g.daily && o.info.goal === info.goal);
  const pre = twin && g.period === "week" ? "Weekly " : "";
  if (info.color && info.id.startsWith("source")) {
    const [name, ...rest] = info.goal.split(/( Days)$/);
    return [...(pre ? [{ text: pre }] : []), { text: name, color: info.color }, { text: `${rest.join("")} goal` }];
  }
  // "Weekly focus goal", but "Weekly Distraction goal": the Ledger's own words keep their capitals.
  const word = pre && !/^(Voucher|Unlock|Distraction)/.test(info.goal) ? info.goal.toLowerCase() : info.goal;
  return [{ text: `${pre}${word} goal` }];
}

/** Each goal with its measure and record, where its measure is known. */
export function goalRecords(ctx: Context): { g: Goal; info: MeasureInfo; rec: GoalRecord }[] {
  const named = (id: string): Named => { const s = styleOf(id); return { name: s.name, color: s.color }; };
  const history = ctx.current ? [...ctx.days, ctx.current] : ctx.days;
  return (ctx.goals ?? []).flatMap((g) => {
    const info = measureInfo(g.measure, ctx.sources ?? {}, named);
    return info ? [{ g, info, rec: evaluate(g, history, info, { timeZone: ctx.timeZone, logFirstDay: ctx.logFirstDay }) }] : [];
  });
}

/** Hit rates week by week, oldest first, for a picture: a Day goal's share
 *  of known Days met in each week, a week goal's 1 or 0; null when unknown. */
export function weeklyRates(periods: PeriodOf[], period: Goal["period"], weeks: number): (number | null)[] {
  const finished = periods.filter((p) => !p.current);
  if (period === "week") return finished.slice(-weeks).map((p) => (p.cell === "met" ? 1 : p.cell === "missed" ? 0 : null));
  const by = new Map<string, { met: number; of: number }>();
  for (const p of finished) {
    const k = mondayOf(p.key), w = by.get(k) ?? { met: 0, of: 0 };
    if (p.cell === "met" || p.cell === "missed") { w.of++; if (p.cell === "met") w.met++; }
    by.set(k, w);
  }
  return [...by.values()].slice(-weeks).map((w) => (w.of ? w.met / w.of : null));
}

export function goalFindings(ctx: Context): Finding[] {
  const all = goalRecords(ctx);
  if (!all.length) return [];
  const days = ctx.days.map((d) => d.day);
  const n = days.length;
  if (!n) return [];
  // Each goal's cell on each finished Day: a week goal's is its week's.
  const cellOn = all.map(({ g, rec }) => {
    if (g.period === "day") {
      const by = new Map(rec.periods.map((p) => [p.key, p]));
      return days.map((d) => by.get(d)?.cell ?? "none");
    }
    const by = new Map(rec.periods.filter((p) => !p.current).map((p) => [p.key, p.cell]));
    return days.map((d) => by.get(mondayOf(d)) ?? "none");
  });
  const outcomes = all.map(({ g }, i) => ({ id: g.id, values: cellOn[i].map((c) => (c === "met" ? 100 : c === "missed" ? 0 : NaN)) }));
  const drivers = all.map(({ g }, i) => ({ id: metId(g.id), did: cellOn[i].map((c) => (c === "met" ? 1 : c === "missed" ? 0 : -1)) }));
  // The last 4 weeks against the 8 before, as Days and as whole weeks.
  const finishedWeeks = [...new Set(days.map(mondayOf))].filter((w) => w !== mondayOf(ctx.today));
  const recentWeeks = new Set(finishedWeeks.slice(-RECENT_WEEKS)), beforeWeeks = new Set(finishedWeeks.slice(-RECENT_WEEKS - BEFORE_WEEKS, -RECENT_WEEKS));
  drivers.push(
    { id: RECENT_DAY, did: days.map((_, i) => (i >= n - RECENT_DAYS ? 1 : i >= n - RECENT_DAYS - BEFORE_DAYS ? 0 : -1)) },
    { id: RECENT_WEEK, did: days.map((d) => (recentWeeks.has(mondayOf(d)) ? 1 : beforeWeeks.has(mondayOf(d)) ? 0 : -1)) },
  );
  const order = new Map(all.map(({ g }, i) => [g.id, i]));
  const periodOf = new Map(all.map(({ g }) => [g.id, g.period]));
  const measureOf = new Map(all.map(({ g }) => [g.id, g.measure]));
  const tested = correlate(days, drivers, outcomes, [], {
    skip: (d, o, lag) => {
      if (lag) return true;
      if (d === RECENT_DAY) return periodOf.get(o) !== "day";
      if (d === RECENT_WEEK) return periodOf.get(o) !== "week";
      // Each pair once (the goal listed first drives), and never two counted from each other.
      const a = d.slice(4);
      return order.get(a)! >= order.get(o)! || linked(measureOf.get(a)!, measureOf.get(o)!, ctx.sources);
    },
  });
  // Weeks each side, for anything weekly: a week goal's Days are one week's worth of evidence.
  const weeksEach = (driver: ArrayLike<number>, values: number[]) => {
    const w1 = new Set<string>(), w0 = new Set<string>();
    days.forEach((d, i) => { if (Number.isNaN(values[i])) return; if (driver[i] === 1) w1.add(mondayOf(d)); else if (driver[i] === 0) w0.add(mondayOf(d)); });
    return Math.min(w1.size, w0.size);
  };
  const byId = new Map(all.map((x) => [x.g.id, x]));
  const out: Finding[] = [];
  for (const t of tested) {
    if (!t.shown || Math.abs(t.withAvg - t.withoutAvg) < FLOOR) continue;
    const b = byId.get(t.outcome)!, bi = order.get(t.outcome)!;
    if (t.driver === RECENT_DAY || t.driver === RECENT_WEEK) {
      const known = (v: number, i: number) => !Number.isNaN(outcomes[bi].values[i]) && drivers.find((d) => d.id === t.driver)!.did[i] === v;
      if (b.g.period === "day" && days.filter((_, i) => known(0, i)).length < MIN_BEFORE_DAYS) continue;
      if (b.g.period === "week" && weeksEach(drivers.find((d) => d.id === t.driver)!.did, outcomes[bi].values) < MIN_WEEKS) continue;
      out.push(shiftFinding(t, b, all));
      continue;
    }
    const a = byId.get(t.driver.slice(4))!;
    if ((a.g.period === "week" || b.g.period === "week") && weeksEach(drivers[order.get(a.g.id)!].did, outcomes[bi].values) < MIN_WEEKS) continue;
    out.push(pairFinding(t, a, b, all));
  }
  return out;
}

type One = { g: Goal; info: MeasureInfo; rec: GoalRecord };
const pct = (v: number) => `${Math.round(v)}%`;
const runsText = (r: Run[]) => r.map((x) => x.text).join("");

function shiftFinding(t: Tested, b: One, all: One[]): Finding {
  const up = t.withAvg > t.withoutAvg, change = t.withAvg - t.withoutAvg;
  const unit = b.g.period === "day" ? "Days" : "weeks";
  const rates = weeklyRates(b.rec.periods, b.g.period, RECENT_WEEKS + BEFORE_WEEKS);
  return {
    id: `goal:shift:${b.g.id}`,
    kind: "goal",
    domain: "goal",
    subject: b.info.color ? { id: b.g.measure.split(":")[1], color: b.info.color } : undefined,
    sentence: goalShift(goalRuns(b.g, b.info, all)),
    size: clamp(t.effect * 2, 0, 3),
    confidence: t.confidence as 1 | 2 | 3,
    pill: { text: `${signed(change)}%`, tone: up ? "good" : "worse" },
    visual: { kind: "rates", rates, recent: Math.min(RECENT_WEEKS, rates.length), good: up },
    proof: {
      facts: [
        [`Last 4 weeks, ${unit} met`, `${pct(t.withAvg)} of ${b.g.period === "day" ? t.withN : Math.round(t.withN / 7)}`],
        [`The 8 weeks before, ${unit} met`, `${pct(t.withoutAvg)} of ${b.g.period === "day" ? t.withoutN : Math.round(t.withoutN / 7)}`],
      ],
      note: goalShiftNote,
      big: { kind: "rates", rates, recent: Math.min(RECENT_WEEKS, rates.length), good: up, axis: ["12 weeks ago", "4 weeks ago", "last week"] },
    },
    value: change,
    floor: FLOOR,
    goals: [b.g.id],
    productive: b.info.productive,
  };
}

function pairFinding(t: Tested, a: One, b: One, all: One[]): Finding {
  const helps = t.withAvg > t.withoutAvg, change = t.withAvg - t.withoutAvg;
  const color = "var(--goal)";
  return {
    id: `goal:pair:${a.g.id}|${b.g.id}`,
    kind: "goal-pair",
    domain: "goal",
    sentence: goalPair(goalRuns(a.g, a.info, all), a.g.period, goalRuns(b.g, b.info, all)),
    size: clamp(t.effect * 2, 0, 3),
    confidence: t.confidence as 1 | 2 | 3,
    pill: { text: `${signed(change)}%`, tone: helps ? "good" : "worse" },
    visual: { kind: "dumbbell", without: t.withoutAvg, with: t.withAvg, color, good: helps },
    proof: {
      facts: [
        [`Days the ${runsText(goalRuns(a.g, a.info, all))} was missed`, `${t.withoutN}, the ${runsText(goalRuns(b.g, b.info, all))} met on ${pct(t.withoutAvg)}`],
        [`Days it was met`, `${t.withN}, the ${runsText(goalRuns(b.g, b.info, all))} met on ${pct(t.withAvg)}`],
      ],
      note: goalPairNote(helps),
      tested: { ...t, unit: "percent", up: true, color, outcome: `${b.info.goal} goal` },
    },
    value: change,
    floor: FLOOR,
    goals: [a.g.id, b.g.id],
    productive: a.info.productive || b.info.productive,
  };
}
