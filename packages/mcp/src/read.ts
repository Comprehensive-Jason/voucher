// What the read tools answer, as compact JSON with units in the names
// (`_min` minutes, `vouchers` Vouchers). Goals and Insights come from core's
// own code ($core/goals.ts and $core/insights), run here in Node, so an AI
// sees the same hit rates and findings as Counterfoil's cards.
import process from "node:process";
import { distractionOf } from "$core/beforeAfter";
import { rememberSources } from "$core/colors.svelte";
import { correlateRequest } from "$core/correlate";
import { setCurfew } from "$core/curfew.svelte";
import { evaluate, measureInfo, showValue, targetText, type Goal, type Named } from "$core/goals";
import { comparedDays, goodDaySetup } from "$core/goodDays";
import { cheapFindings, correlationFindings, FIRST_DAYS, insights, type Context } from "$core/insights/index";
import { goalRuns } from "$core/insights/goals";
import type { Finding, InsightsState } from "$core/insights/types";
import { measured } from "$core/notes.svelte";
import { rateText, styleOf } from "$core/sources";
import { clock, historyDays } from "$core/time";
import type { DaySummary, DayTotal, Marker, Status } from "$core/types";
import { ledger, type Connection } from "./ledger";

/** The Ledger's status, with what every tool needs set from it: the Day's
 *  hours, the sources' names, and this process's clock on the Ledger's zone. */
export async function status(c: Connection): Promise<Status> {
  const s = await ledger<Status>(c, "GET", "/status");
  setCurfew(s.settings.curfew_start, s.settings.curfew_end);
  rememberSources(s.settings.sources);
  // A Day starts at Curfew's end on the Ledger's clock; core's date helpers use the process's.
  process.env.TZ = s.settings.time_zone;
  return s;
}

/** The last `n` Days, oldest first, today last. */
export const history = (c: Connection, n: number) => ledger<DayTotal[]>(c, "GET", `/history?days=${Math.max(1, Math.min(400, n))}`);

/** Days from `from` to `to` back from today, inclusive, as /history counts them. */
export const daysBack = (from: string, today: string) => Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;

const named = (id: string): Named => { const s = styleOf(id); return { name: s.name, color: s.color }; };
const text = (runs: { text: string }[]) => runs.map((r) => r.text).join("");
const hhmm = (at: string, tz: string) => clock(at, tz);
const nonEmpty = <T extends object>(o: T | undefined) => (o && Object.keys(o).length ? o : undefined);

/** One Day as the tools return it. Unknown is null, never 0. */
export function compactDay(d: DayTotal, tz: string, logFirstDay?: string) {
  const logged = !logFirstDay || d.day >= logFirstDay;
  const stretches = d.stretches ?? [];
  const planned = d.planned ?? [];
  return {
    day: d.day,
    vouchers: d.earned,
    daily_goal: d.goal ?? null,
    daily_goal_met: d.goal_met,
    vouchers_by_source: nonEmpty(d.by_source),
    vouchers_spent: d.redeemed,
    unlocks: logged ? d.tears ?? null : null,
    unlocked_min: d.unlocked_minutes ?? null,
    distraction_min: measured(d) ? distractionOf(d) : null,
    distraction_by_app_min: measured(d) ? nonEmpty(d.used) : undefined,
    focus_min: logged ? stretches.reduce((a, b) => a + b, 0) : null,
    longest_stretch_min: logged ? (stretches.length ? Math.max(...stretches) : 0) : null,
    blocked_opens: d.opens ?? null,
    walked_away: d.walked ?? null,
    sleep: d.sleep ? { asleep_min: d.sleep.asleep, bedtime: hhmm(d.sleep.bedtime, tz), wake: hhmm(d.sleep.wake, tz), source: d.sleep.source } : null,
    calendar: d.calendar ? { events: d.calendar.events, busy_min: d.calendar.busy_minutes } : null,
    curfew_answer: d.verdict ?? null,
    planned: planned.length
      ? { blocks: planned.length, min: planned.reduce((a, b) => a + b.minutes, 0), done: planned.filter((b) => b.done_at).length,
          distraction_min: planned.reduce((a, b) => a + b.split.distraction, 0) }
      : undefined,
  };
}

/** One Day in detail: its totals, log, Markers, and Unlock reasons. */
export function dayDetail(s: DaySummary, total: DayTotal | undefined, tz: string, logFirstDay?: string) {
  const base = total ? compactDay(total, tz, logFirstDay) : { day: s.day, vouchers: s.earned, daily_goal: s.goal, daily_goal_met: s.goal_met, vouchers_by_source: nonEmpty(s.by_source), vouchers_spent: s.redeemed, unlocked_min: s.unlocked_minutes };
  return {
    ...base,
    daily_goal_met_at: s.goal_met_at ? hhmm(s.goal_met_at, tz) : null,
    streak_days: s.streak,
    log: s.log.map((e) =>
      e.kind === "earned" ? { at: hhmm(e.at, tz), earned: styleOf(e.task.split(":")[0]).name, title: e.title || undefined, kept: e.kept ? undefined : false }
      : e.kind === "redeemed" ? { at: hhmm(e.at, tz), unlocked_vouchers: e.tickets, unlocked_min: e.minutes }
      : { at: hhmm(e.at, tz), gap_until: hhmm(e.until, tz), device: e.device }),
    markers: (s.markers ?? []).map((m) => ({ at: hhmm(m.at, tz), text: m.text, rule: m.rule })),
    unlock_reasons: total?.reasons?.length ? total.reasons.map(([h, reason]) => ({ hour: `${String(h).padStart(2, "0")}:00`, reason })) : undefined,
  };
}

const CELL_WORD = { met: "met", missed: "missed", none: "unknown", open: "in progress" } as const;

/** Every goal with how it's going. */
export function goalsWithRates(goals: Goal[], days: DayTotal[], s: Status) {
  const reading = { timeZone: s.settings.time_zone, logFirstDay: s.log_first_day };
  const infos = goals.map((g) => ({ g, info: measureInfo(g.measure, s.settings.sources, named) }));
  const known = infos.filter((x): x is { g: Goal; info: NonNullable<typeof x.info> } => !!x.info);
  return infos.map(({ g, info }) => {
    if (!info) return { id: g.id, measure: g.measure, direction: g.direction, target: g.target, period: g.period, note: "a measure this server doesn't know" };
    const r = evaluate(g, days, info, reading);
    const rate = (x: { met: number; of: number } | null) => (x ? { met: x.met, of: x.of, pct: Math.round((x.met / x.of) * 100) } : null);
    const current = r.periods.at(-1);
    return {
      id: g.id,
      name: text(goalRuns(g, info, known)),
      daily: g.daily || undefined,
      measure: g.measure,
      measure_name: info.name,
      unit: info.unit === "clock" ? "clock time" : info.unit,
      direction: g.direction,
      target: info.unit === "clock" ? showValue({ ...info, id: "wake" }, g.target) : g.target,
      period: g.period,
      asks: targetText(g, info),
      pending: g.pending ? { target: g.pending.target, from: g.pending.at } : undefined,
      streak: r.streak,
      hit_rate_4_weeks: rate(r.rate4),
      hit_rate_12_weeks: rate(r.rate12),
      current: current ? { [g.period === "day" ? "day" : "week_of"]: current.key, value: current.value === null ? null : showValue(info, current.value, { units: true }), state: CELL_WORD[current.cell] } : null,
      last_12: r.periods.filter((p) => !p.current).slice(-12).map((p) => CELL_WORD[p.cell]),
    };
  });
}

const CONFIDENCE = { 1: "Low", 2: "Medium", 3: "High" } as const;

/** Insights' findings, ranked, as Counterfoil shows them: none dismissed,
 *  no suggestions (this server changes no rule but the Daily goal). */
export function findings(s: Status, history: DayTotal[], markers: Marker[], kept: InsightsState, goals: Goal[]): { waiting_days?: number; findings: ReturnType<typeof compactFinding>[] } {
  const tz = s.settings.time_zone;
  const dayStart = Math.round((Number(s.settings.curfew_end.slice(0, 2)) * 60 + Number(s.settings.curfew_end.slice(3, 5))));
  const curfewStart = Math.round((Number(s.settings.curfew_start.slice(0, 2)) * 60 + Number(s.settings.curfew_start.slice(3, 5))));
  const days = history.slice(0, -1);
  const ctx: Context = {
    days, today: history.at(-1)?.day ?? s.today.day, current: history.at(-1) ?? null, timeZone: tz, dayStart, curfewStart,
    blocklists: s.settings.blocklists, markers, settings: null, pending: [], experiments: kept.experiments,
    goals, sources: s.settings.sources, logFirstDay: s.log_first_day,
  };
  if (days.length < FIRST_DAYS) return { waiting_days: FIRST_DAYS - days.length, findings: [] };
  const setup = goodDaySetup(comparedDays(history), tz, dayStart);
  const correlations = correlationFindings(correlateRequest(setup.request), setup);
  return { findings: insights(ctx, cheapFindings(ctx), correlations, kept.dismissed, { suggestions: false }).map(compactFinding) };
}

function compactFinding(f: Finding) {
  return {
    id: f.id,
    kind: f.kind,
    about: f.domain,
    says: text(f.sentence),
    change: f.pill?.text,
    better: f.pill ? (f.pill.tone === "good" ? true : f.pill.tone === "worse" ? false : undefined) : undefined,
    record: f.pill?.tone === "gold" || undefined,
    confidence: f.confidence ? CONFIDENCE[f.confidence] : undefined,
    facts: Object.fromEntries(f.proof.facts),
    note: f.proof.note,
    goals: f.goals,
  };
}

/** The sources: what earns, and at what rate. */
export const sourcesOf = (s: Status) =>
  Object.entries(s.settings.sources).map(([id, src]) => ({ id, name: styleOf(id).name, kind: src.kind, on: src.on, earns: rateText(src.kind, src.every) }));

/** The blocklists, by name only. */
export const blocklistsOf = (s: Status) => Object.entries(s.settings.blocklists).map(([id, l]) => ({ id, name: l.name, on: l.on }));
