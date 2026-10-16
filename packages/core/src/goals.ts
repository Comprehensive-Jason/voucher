// Goals: a target for a measure the Ledger keeps, each counted over a Day
// or a Monday-to-Sunday week (crates/voucher-ledger/src/goals.rs keeps
// them; GET /goals lists them). The Daily goal is the first: Vouchers, at
// least, a Day, its target the `daily_goal` setting. Every other goal only
// motivates.
//
// This works out, from GET /history, which Days and weeks met each goal:
// the strip the Goals card draws, the current streak, and the hit rate over
// the last 4 and 12 weeks. Insights' goal findings (insights/goals.ts) read
// the same. Pure, so the MCP server runs it in Node too.
//
// Every measure is one GET /history carries for each Day; a goal can't
// count anything else:
//   vouchers            Vouchers earned (`earned`)
//   source:<id>         one source's Vouchers (`by_source`); for Tasks, a
//                       finished task is a Voucher at a rate of 1
//   source_days:<id>    Days the source earned at all, weekly only
//   focus               focus minutes, every focus stretch added up (`stretches`)
//   longest             the longest focus stretch, in minutes
//   distraction         Distraction minutes (`used`), on Days a device reported
//   unlocks             Unlocks (`tears`)
//   asleep              minutes asleep the night before (`sleep.asleep`)
//   bedtime, wake       the night before's clock times, minutes after midnight
// The log-based ones (sources, focus, Unlocks) are unknown before the oldest
// Day the Ledger keeps its log for, rather than zero.
import { distractionOf } from "./beforeAfter";
import { measured } from "./notes.svelte";
import { hoursAndMinutes, minutesIntoDay } from "./time";
import { mondayOf } from "./trends";
import type { DayTotal, Source, SourceKind } from "./types";

export type Direction = "at_least" | "at_most";
export type Period = "day" | "week";

/** A goal as GET /goals lists it. */
export interface Goal {
  id: string;
  measure: string;
  direction: Direction;
  /** In the measure's units; a clock time is minutes after midnight. */
  target: number;
  period: Period;
  /** The Daily goal, whose target changes only through POST /change. */
  daily: boolean;
  /** The Daily goal's next target, waiting for the next Day. */
  pending?: { target: number; at: string } | null;
  created_at?: string;
}

/** What POST /goal takes: a new goal, or with `id` an edit. */
export type NewGoal = { id?: string; measure: string; direction: Direction; target: number; period: Period };

/** The Daily goal's id. */
export const DAILY = "daily";

export type Unit = "vouchers" | "minutes" | "unlocks" | "days" | "clock";

/** What a measure is, for naming, showing, and adding up a goal. */
export type MeasureInfo = {
  id: string;
  /** As the editor lists it: "Focus minutes", "Tasks Vouchers". */
  name: string;
  /** The goal's name without "goal": "Focus", "Tasks", "Sleep". */
  goal: string;
  unit: Unit;
  /** How a week adds up its Days: their sum, their average, or the best one. */
  week: "sum" | "mean" | "max";
  /** The usual way: at least (more is better) or at most. */
  direction: Direction;
  /** Only weekly (Days a source earned). */
  weeklyOnly?: boolean;
  /** About work (Vouchers, tasks, focus, Distraction, Unlocks), not sleep or
   *  health: Voucher shows goal findings only when one of their goals is. */
  productive: boolean;
  /** A source's color, for its name. */
  color?: string;
  /** The night before the Day: known in full once it's recorded. */
  night?: boolean;
};

/** A source's name and color, as the app draws it. */
export type Named = { name: string; color: string };

const FIXED: Record<string, Omit<MeasureInfo, "id">> = {
  vouchers: { name: "Vouchers", goal: "Voucher", unit: "vouchers", week: "sum", direction: "at_least", productive: true },
  focus: { name: "Focus minutes", goal: "Focus", unit: "minutes", week: "sum", direction: "at_least", productive: true },
  longest: { name: "Longest focus stretch", goal: "Focus stretch", unit: "minutes", week: "max", direction: "at_least", productive: true },
  distraction: { name: "Distraction minutes", goal: "Distraction", unit: "minutes", week: "sum", direction: "at_most", productive: true },
  unlocks: { name: "Unlocks", goal: "Unlock", unit: "unlocks", week: "sum", direction: "at_most", productive: true },
  asleep: { name: "Time asleep", goal: "Sleep", unit: "minutes", week: "mean", direction: "at_least", productive: false, night: true },
  bedtime: { name: "Bedtime", goal: "Bedtime", unit: "clock", week: "mean", direction: "at_most", productive: false, night: true },
  wake: { name: "Wake-up time", goal: "Wake-up", unit: "clock", week: "mean", direction: "at_most", productive: false, night: true },
};

/** Source kinds that are about work, not health. */
const WORK: SourceKind[] = ["tasks", "focus"];

/** What a goal's measure is, or null for one this app doesn't know. */
export function measureInfo(measure: string, sources: Record<string, Pick<Source, "kind">>, named: (id: string) => Named): MeasureInfo | null {
  if (FIXED[measure]) return { id: measure, ...FIXED[measure] };
  const [kind, id] = measure.split(/:(.*)/s);
  if ((kind !== "source" && kind !== "source_days") || !id) return null;
  const n = named(id), work = sources[id] ? WORK.includes(sources[id].kind) : true;
  if (kind === "source") return { id: measure, name: `${n.name} Vouchers`, goal: n.name, unit: "vouchers", week: "sum", direction: "at_least", productive: work, color: n.color };
  return { id: measure, name: `Days with ${n.name}`, goal: `${n.name} Days`, unit: "days", week: "sum", direction: "at_least", weeklyOnly: true, productive: work, color: n.color };
}

/** Every measure a goal can have, for the editor: the fixed ones, then each
 *  source's Vouchers and the Days it earned. */
export function measureChoices(sources: Record<string, Pick<Source, "kind" | "on">>, named: (id: string) => Named): MeasureInfo[] {
  const ids = [...Object.keys(FIXED), ...Object.keys(sources).flatMap((id) => [`source:${id}`, `source_days:${id}`])];
  return ids.map((m) => measureInfo(m, sources, named)!).filter(Boolean);
}

/** Where a Day's log-based values are known from: GET /status's log_first_day. */
export type Reading = { timeZone: string; logFirstDay?: string };

/** Minutes after midnight of a moment on the Ledger's clock. */
const clockMinutes = (at: string, timeZone: string) => ((minutesIntoDay(at, at.slice(0, 10), timeZone, 0) % 1440) + 1440) % 1440;

/** A bedtime as minutes after noon, so 23:30 comes before 00:30. */
const fromNoon = (m: number) => (m - 720 + 1440) % 1440;

/** One Day's value for a measure, or null when it isn't known. A bedtime is
 *  minutes after noon (see `fromNoon`), so it compares across midnight. */
export function dayValue(measure: string, d: DayTotal, r: Reading): number | null {
  const logged = !r.logFirstDay || d.day >= r.logFirstDay;
  switch (measure) {
    case "vouchers": return d.earned;
    case "focus": return logged ? (d.stretches ?? []).reduce((a, b) => a + b, 0) : null;
    case "longest": return logged ? Math.max(0, ...(d.stretches ?? [])) : null;
    case "distraction": return measured(d) ? distractionOf(d) : null;
    case "unlocks": return logged && d.tears !== undefined ? d.tears : null;
    case "asleep": return d.sleep?.asleep ?? null;
    case "bedtime": return d.sleep ? fromNoon(clockMinutes(d.sleep.bedtime, r.timeZone)) : null;
    case "wake": return d.sleep ? clockMinutes(d.sleep.wake, r.timeZone) : null;
  }
  const [kind, id] = measure.split(/:(.*)/s);
  if (!logged || !id) return null;
  const v = d.by_source?.[id] ?? 0;
  return kind === "source" ? v : kind === "source_days" ? (v > 0 ? 1 : 0) : null;
}

/** A goal's target on the scale `dayValue` uses (a bedtime from noon). */
export const scaledTarget = (g: Pick<Goal, "measure" | "target">) => (g.measure === "bedtime" ? fromNoon(g.target) : g.target);

/** Met, missed, unknown (no data, or a week with under 4 known Days), or,
 *  for the period still going, not decided yet. */
export type Cell = "met" | "missed" | "none" | "open";

/** One Day or week of a goal. */
export type PeriodOf = {
  /** The Day, or the week's Monday. */
  key: string;
  /** Its value on the measure's scale, or null. */
  value: number | null;
  cell: Cell;
  /** Still going: today, or this week. */
  current: boolean;
};

/** A hit rate: periods met of those known. */
export type Rate = { met: number; of: number };

export type GoalRecord = {
  goal: Goal;
  /** Every Day (or week) in the history, oldest first, the current one last. */
  periods: PeriodOf[];
  /** Met periods in a row up to the last finished one, plus the current one
   *  once it's met. Unknown ones are skipped, neither kept nor broken. */
  streak: number;
  /** The last 4 and 12 weeks: 28 and 84 finished Days, or 4 and 12 finished weeks. */
  rate4: Rate | null;
  rate12: Rate | null;
};

/** The fewest known Days for a week to count. */
export const WEEK_DAYS = 4;

const meets = (g: Pick<Goal, "direction">, value: number, target: number) => (g.direction === "at_least" ? value >= target - 1e-9 : value <= target + 1e-9);

/** Adds up a week's known Days the measure's way, or null with too few. */
function weekValue(values: (number | null)[], how: MeasureInfo["week"], finished: boolean): number | null {
  const known = values.filter((v): v is number => v !== null);
  if (!known.length || (finished && known.length < WEEK_DAYS)) return null;
  if (how === "sum") return known.reduce((a, b) => a + b, 0);
  if (how === "max") return Math.max(...known);
  return known.reduce((a, b) => a + b, 0) / known.length;
}

/** How a goal went over `history` (GET /history, oldest first, today last). */
export function evaluate(goal: Goal, history: DayTotal[], info: MeasureInfo, r: Reading): GoalRecord {
  const today = history.at(-1)?.day ?? "";
  const target = scaledTarget(goal);
  // Whether a current period's value already settles it: a sum or a best
  // can only grow, and a night is whole once recorded.
  const early = (value: number) => {
    if (info.night && goal.period === "day") return meets(goal, value, target) ? "met" : "missed";
    if (info.week === "mean") return "open";
    if (goal.direction === "at_least") return meets(goal, value, target) ? "met" : "open";
    return meets(goal, value, target) ? "open" : "missed";
  };
  let periods: PeriodOf[];
  if (goal.period === "day") {
    periods = history.map((d) => {
      const current = d.day === today;
      if (goal.daily) {
        // The Daily goal: each Day against its own goal, as the Streak counts.
        return { key: d.day, value: d.earned, current, cell: d.goal_met ? "met" : current ? "open" : "missed" };
      }
      const value = dayValue(goal.measure, d, r);
      const cell: Cell = value === null ? (current ? "open" : "none") : current ? early(value) : meets(goal, value, target) ? "met" : "missed";
      return { key: d.day, value, current, cell };
    });
  } else {
    const weeks = new Map<string, (number | null)[]>();
    for (const d of history) {
      const k = mondayOf(d.day);
      if (!weeks.has(k)) weeks.set(k, []);
      weeks.get(k)!.push(dayValue(goal.measure, d, r));
    }
    const thisWeek = mondayOf(today);
    periods = [...weeks].map(([key, values]) => {
      const current = key === thisWeek;
      const value = weekValue(values, info.week, !current);
      const cell: Cell = value === null ? (current ? "open" : "none") : current ? early(value) : meets(goal, value, target) ? "met" : "missed";
      return { key, value, current, cell };
    });
    // A first week the history only starts partway through isn't a week.
    if (periods.length && history[0] && mondayOf(history[0].day) !== history[0].day && periods[0].cell !== "open") periods[0] = { ...periods[0], cell: "none", value: null };
  }
  const finished = periods.filter((p) => !p.current);
  let streak = 0;
  for (let i = finished.length - 1; i >= 0; i--) {
    if (finished[i].cell === "none") continue;
    if (finished[i].cell !== "met") break;
    streak++;
  }
  if (periods.at(-1)?.current && periods.at(-1)!.cell === "met") streak++;
  const rate = (n: number): Rate | null => {
    const last = finished.slice(-n).filter((p) => p.cell === "met" || p.cell === "missed");
    return last.length ? { met: last.filter((p) => p.cell === "met").length, of: last.length } : null;
  };
  const per = goal.period === "day" ? 7 : 1;
  return { goal, periods, streak, rate4: rate(4 * per), rate12: rate(12 * per) };
}

/** A value on the measure's scale as people read it: "16", "1h30", "23:30", "3 Days". */
export function showValue(info: Pick<MeasureInfo, "unit" | "id">, v: number, { units = false } = {}): string {
  switch (info.unit) {
    case "clock": {
      const m = Math.round(info.id === "bedtime" ? (v + 720) % 1440 : v) % 1440;
      return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
    }
    case "minutes": return v >= 120 ? hoursAndMinutes(v) : `${Math.round(v)}${units ? " min" : ""}`;
    case "vouchers": { const n = Number.isInteger(v) ? String(v) : v.toFixed(1); return units ? `${n} ${v === 1 ? "Voucher" : "Vouchers"}` : n; }
    case "unlocks": return units ? `${Math.round(v)} ${Math.round(v) === 1 ? "Unlock" : "Unlocks"}` : String(Math.round(v));
    case "days": return units ? `${Math.round(v)} ${Math.round(v) === 1 ? "Day" : "Days"}` : String(Math.round(v));
  }
}

/** What a goal asks, in words: "at least 90 min a Day", "in bed by 23:30",
 *  "at most 5h00 a week". A target is on the Ledger's scale (a clock time
 *  in minutes after midnight). */
export function targetText(g: Pick<Goal, "measure" | "direction" | "target" | "period">, info: Pick<MeasureInfo, "unit" | "id" | "week">): string {
  const per = g.period === "day" ? "a Day" : info.week === "mean" ? "a night, on average" : "a week";
  if (info.unit === "clock") {
    const t = showValue({ ...info, id: "wake" }, g.target);
    if (info.id === "bedtime") return g.direction === "at_most" ? `in bed by ${t}${g.period === "week" ? ", on average" : ""}` : `in bed at ${t} or later`;
    return g.direction === "at_most" ? `up by ${t}${g.period === "week" ? ", on average" : ""}` : `up at ${t} or later`;
  }
  return `${g.direction === "at_least" ? "at least" : "at most"} ${showValue(info, g.target, { units: true })} ${per}`;
}
