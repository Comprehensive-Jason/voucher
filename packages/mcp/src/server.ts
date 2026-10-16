// Counterfoil's MCP server, over stdio: an AI assistant (Claude Code,
// OpenCode) reads the Ledger's Days, goals, Insights, Markers, Experiments,
// sources, and blocklist names, and adds, edits, and removes goals. It
// changes no rule but the Daily goal, and that through POST /change like
// every app, so a lower one waits for the next Day. It never Redeems,
// checks in, or reports for a device. See README.md.
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { DAILY, measureInfo, type Goal, type NewGoal } from "$core/goals";
import type { InsightsState } from "$core/insights/types";
import { styleOf } from "$core/sources";
import { historyDays } from "$core/time";
import type { DaySummary, Marker, Status } from "$core/types";
import { connection, ledger, LedgerError, type Connection } from "./ledger";
import { blocklistsOf, compactDay, dayDetail, daysBack, findings, goalsWithRates, history, sourcesOf, status } from "./read";

const VERSION = "0.1.0";

/** Said by every tool that writes: what the Daily goal's rules are. */
const DAILY_RULE = "The Daily goal (id \"daily\") changes only through the Ledger's rule path: a new target never applies today; it starts with the next Day at 06:00, so loosening (lowering) it waits until 06:00 like every loosening, and the change shows in Voucher's Waiting changes and as a rule Marker.";

const MEASURES = [
  "vouchers (Vouchers earned)",
  "source:<id> (that source's Vouchers; source:tasks counts finished Todoist and ClickUp tasks at 1 per task)",
  "source_days:<id> (Days the source earned, weekly only, at most 7)",
  "focus (focus minutes)",
  "longest (longest focus stretch, minutes)",
  "distraction (Distraction minutes)",
  "unlocks (Unlocks)",
  "asleep (minutes asleep the night before)",
  "bedtime and wake (clock times, \"HH:MM\")",
].join("; ");

const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "YYYY-MM-DD");
const target = z.union([z.number().nonnegative(), z.string().regex(/^\d{1,2}:\d{2}$/, "HH:MM")]);

/** A target as the Ledger keeps it: a clock time as minutes after midnight. */
function ledgerTarget(measure: string, t: number | string): number {
  if (typeof t === "number") {
    if (measure === "bedtime" || measure === "wake") throw new Error(`Give ${measure} as a clock time, "HH:MM".`);
    return t;
  }
  if (measure !== "bedtime" && measure !== "wake") throw new Error(`Only bedtime and wake take a clock time; give ${measure} as a number.`);
  const [h, m] = t.split(":").map(Number);
  if (h > 23 || m > 59) throw new Error(`${t} isn't a time of day.`);
  return h * 60 + m;
}

const json = (value: unknown) => ({ content: [{ type: "text" as const, text: JSON.stringify(value) }] });
const failed = (e: unknown) => ({ isError: true, content: [{ type: "text" as const, text: e instanceof LedgerError || e instanceof Error ? e.message : String(e) }] });

/** Runs a tool's work, answering its JSON or its error in words. */
const run = async (work: () => Promise<unknown>) => { try { return json(await work()); } catch (e) { return failed(e); } };

export function server(c: Connection): McpServer {
  const mcp = new McpServer({ name: "counterfoil", version: VERSION });
  const read = { readOnlyHint: true, openWorldHint: false } as const;

  async function goalList(s?: Status) {
    const st = s ?? (await status(c));
    const [goals, days] = await Promise.all([ledger<Goal[]>(c, "GET", "/goals"), history(c, 7 * 13 + 7)]);
    return goalsWithRates(goals, days, st);
  }

  mcp.registerTool("list_days", {
    title: "Days in a range",
    description: "Each Day's totals from the Ledger, oldest first. A Day runs from Curfew's end to the next (06:00 to 06:00 by default); today is still going. Fields: vouchers (earned), daily_goal and daily_goal_met, vouchers_by_source (by source id), vouchers_spent, unlocks, unlocked_min, distraction_min and distraction_by_app_min (null when no device reported), focus_min, longest_stretch_min, blocked_opens and walked_away (opens of a blocked app that ended without an Unlock), sleep (the night before: asleep_min, bedtime, wake, source), calendar (events, busy_min), curfew_answer (yes, mostly, or no to \"Did today go the way you wanted?\"), planned (time blocks: blocks, min, done, distraction_min). null means unknown, not zero. At most 400 Days back from today.",
    inputSchema: { from: date.describe("First Day, YYYY-MM-DD"), to: date.optional().describe("Last Day, YYYY-MM-DD; today when left out") },
    annotations: read,
  }, ({ from, to }) => run(async () => {
    const s = await status(c);
    const today = s.today.day, last = to ?? today;
    if (from > last) throw new Error("from is after to.");
    const n = daysBack(from, today);
    if (n > 400) throw new Error("The Ledger answers at most 400 Days back from today.");
    const days = (await history(c, n)).filter((d) => d.day >= from && d.day <= last);
    return { today, days: days.map((d) => compactDay(d, s.settings.time_zone, s.log_first_day)) };
  }));

  mcp.registerTool("get_day", {
    title: "One Day in detail",
    description: "One Day's totals (as list_days gives them) plus its log (each Voucher earned with its source and task title, each Unlock with Vouchers spent and minutes, any Gap when a device stopped checking in), its Markers, the Daily goal's streak, and when the goal was met. Times are HH:MM on the Ledger's clock.",
    inputSchema: { date: date.describe("The Day, YYYY-MM-DD") },
    annotations: read,
  }, ({ date: day }) => run(async () => {
    const s = await status(c);
    const detail = await ledger<DaySummary>(c, "GET", `/day?date=${day}`);
    const back = daysBack(day, s.today.day);
    const total = back >= 1 && back <= 400 ? (await history(c, back)).find((d) => d.day === day) : undefined;
    return dayDetail(detail, total, s.settings.time_zone, s.log_first_day);
  }));

  mcp.registerTool("list_goals", {
    title: "Goals and how they're going",
    description: "Every goal, the Daily goal first. Each has its id, name, measure, direction (at_least or at_most), target (in the measure's unit; clock times as HH:MM), period (day or week, Monday to Sunday), what it asks in words, streak (Days or weeks met in a row; unknown ones are skipped), hit_rate_4_weeks and hit_rate_12_weeks (met of known, and pct), the current Day or week, and last_12 (the last 12 finished Days or weeks: met, missed, or unknown). Past periods are counted against today's target. The Daily goal has pending when a new target waits for the next Day.",
    annotations: read,
  }, () => run(async () => ({ goals: await goalList() })));

  mcp.registerTool("get_insights", {
    title: "Insights findings",
    description: "What the history turned up, ranked by size and how sure, as Counterfoil's Insights card shows it: what goes with what across Days, this week against the usual, where lost planned time falls, patterns, Before and after on Markers and Experiments, records, lapses, and goal findings (a goal's hit rate over the last 4 weeks, and goals that go together or conflict). Each has says (what and when), change (the size, signed), better (true better, false worse), confidence (Low, Medium, or High, from shuffling whole weeks; records and lapses have none), and facts. These are correlations, not causes. Dismissed findings are left out.",
    inputSchema: { limit: z.number().int().min(1).max(50).optional().describe("How many, best first; 10 when left out") },
    annotations: read,
  }, ({ limit }) => run(async () => {
    const s = await status(c);
    const [days, markers, kept, goals] = await Promise.all([
      history(c, historyDays(s.today.day, s.first_day)),
      ledger<Marker[]>(c, "GET", "/markers"),
      ledger<InsightsState>(c, "GET", "/insights").catch(() => ({ dismissed: {}, experiments: [] })),
      ledger<Goal[]>(c, "GET", "/goals"),
    ]);
    const out = findings(s, days, markers, kept, goals);
    return { ...out, findings: out.findings.slice(0, limit ?? 10), more: Math.max(0, out.findings.length - (limit ?? 10)) || undefined };
  }));

  mcp.registerTool("list_markers", {
    title: "Markers",
    description: "Markers, oldest first: dated notes on the timeline. rule is true for one the Ledger wrote when a rule changed (\"Daily goal 16\"), false for one written by hand (\"New term\"). at is an ISO time.",
    inputSchema: { from: date.optional().describe("First Day, YYYY-MM-DD"), to: date.optional().describe("Last Day, YYYY-MM-DD") },
    annotations: read,
  }, ({ from, to }) => run(async () => {
    const markers = await ledger<Marker[]>(c, "GET", "/markers");
    return { markers: markers.filter((m) => (!from || m.at.slice(0, 10) >= from) && (!to || m.at.slice(0, 10) <= to)) };
  }));

  mcp.registerTool("list_experiments", {
    title: "Experiments",
    description: "Every Experiment: a rule change tried on purpose for 14 measured Days after 3 settling ones, judged by Before and after. status is running, ready (judged, waiting for Keep it or Go back in Voucher), kept, reverted, or ended. Only Voucher starts or ends them.",
    annotations: read,
  }, () => run(async () => {
    const kept = await ledger<InsightsState>(c, "GET", "/insights");
    return {
      experiments: kept.experiments.map((e) => ({
        id: e.id, tries: e.text, judged_on: e.measure, status: e.status, start_day: e.start_day, verdict_day: e.verdict_day,
        verdict: e.verdict ? { outcome: e.verdict.outcome, title: e.verdict.title, text: e.verdict.text } : undefined,
      })),
    };
  }));

  mcp.registerTool("list_sources", {
    title: "Activity sources",
    description: "The Activity sources that earn Vouchers: id (as in vouchers_by_source and source:<id> goals), name, kind (tasks, focus, workout, or steps), on, and the Earning rate in words.",
    annotations: read,
  }, () => run(async () => ({ sources: sourcesOf(await status(c)) })));

  mcp.registerTool("list_blocklists", {
    title: "Blocklists",
    description: "The blocklists by name: id, name, and whether it's on. Their apps and sites aren't listed.",
    annotations: read,
  }, () => run(async () => ({ blocklists: blocklistsOf(await status(c)) })));

  mcp.registerTool("create_goal", {
    title: "Add a goal",
    description: `Adds a goal, which applies at once and changes no rule. Measures: ${MEASURES}. direction is at_least or at_most; period is day or week (Monday to Sunday; for asleep, bedtime, and wake a week is the average night). Targets are in the measure's unit: Vouchers, minutes, Unlocks, Days, or "HH:MM" for bedtime and wake. A measure, direction, and period already in use is refused. The Daily goal already exists and can't be added: to move it use update_goal with id "daily". ${DAILY_RULE}`,
    inputSchema: {
      measure: z.string().describe("A measure, such as focus, asleep, bedtime, source:tasks, or source_days:workout"),
      direction: z.enum(["at_least", "at_most"]),
      target: target.describe("A number in the measure's unit, or \"HH:MM\" for bedtime and wake"),
      period: z.enum(["day", "week"]),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  }, ({ measure, direction, target: t, period }) => run(async () => {
    const s = await status(c);
    if (!measureInfo(measure, s.settings.sources, (id) => ({ name: styleOf(id).name, color: "" }))) throw new Error(`Unknown measure ${measure}. Measures: ${MEASURES}.`);
    const g: NewGoal = { measure, direction, target: ledgerTarget(measure, t), period };
    await ledger<Goal[]>(c, "POST", "/goal", g);
    return { goals: await goalList(s) };
  }));

  mcp.registerTool("update_goal", {
    title: "Change a goal",
    description: `Changes a goal by id; fields left out stay as they are. Other goals change at once. For the Daily goal (id "daily") only the target can change, in Vouchers. ${DAILY_RULE}`,
    inputSchema: {
      id: z.string().describe("The goal's id, from list_goals: \"daily\" or \"g1\", \"g2\", …"),
      target: target.optional().describe("A number in the measure's unit, or \"HH:MM\" for bedtime and wake"),
      direction: z.enum(["at_least", "at_most"]).optional(),
      period: z.enum(["day", "week"]).optional(),
      measure: z.string().optional(),
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  }, ({ id, target: t, direction, period, measure }) => run(async () => {
    const s = await status(c);
    if (id === DAILY) {
      if (direction || period || measure) throw new Error("Only the Daily goal's target can change: it's always Vouchers, at least, a Day.");
      if (t === undefined) throw new Error("Give the Daily goal's new target, in Vouchers.");
      if (typeof t !== "number" || !Number.isInteger(t) || t < 1 || t > 100) throw new Error("The Daily goal is a whole number of Vouchers, 1 to 100.");
      const effect = await ledger<"Now" | { At: string }>(c, "POST", "/change", { DailyGoal: t });
      return { daily_goal: { target: t, starts: effect === "Now" ? "now (the Ledger is in its setup grace period)" : effect.At }, goals: await goalList(s) };
    }
    const goals = await ledger<Goal[]>(c, "GET", "/goals");
    const old = goals.find((g) => g.id === id);
    if (!old) throw new Error(`No goal has id ${id}. list_goals shows them.`);
    const m = measure ?? old.measure;
    const g: NewGoal = { id, measure: m, direction: direction ?? old.direction, period: period ?? old.period,
      target: t === undefined ? old.target : ledgerTarget(m, t) };
    await ledger<Goal[]>(c, "POST", "/goal", g);
    return { goals: await goalList(s) };
  }));

  mcp.registerTool("delete_goal", {
    title: "Remove a goal",
    description: `Removes a goal by id, at once. The Daily goal can't be removed, only moved with update_goal. ${DAILY_RULE}`,
    inputSchema: { id: z.string().describe("The goal's id, from list_goals") },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false },
  }, ({ id }) => run(async () => {
    if (id === DAILY) throw new Error("The Daily goal can't be removed; move it with update_goal instead.");
    await ledger<Goal[]>(c, "POST", "/goal/remove", { id });
    return { removed: id, goals: await goalList() };
  }));

  return mcp;
}

async function main() {
  let c: Connection;
  try { c = connection(); } catch (e) {
    process.stderr.write(`counterfoil-mcp: ${(e as Error).message}\n`);
    process.exit(1);
  }
  await server(c).connect(new StdioServerTransport());
}

main();
