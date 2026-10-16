// Every sentence Insights says, in one place: one template per kind of
// finding, the suggestions and Experiments, the confirm sheet, the verdict
// notification, and the empty state. Plain words, no statistics.
//
// A sentence says only what and when. The row's picture, pill, and bars say
// the rest, so a sentence never repeats them: no confidence words (the bars
// say it), no size of change when the pill shows it, and no before and after
// numbers when the picture shows them. The verdict notification has no
// picture, so it says its numbers in words.
//
// House style: no em dashes, the Oxford comma, American spelling, and Day,
// Voucher, Unlock, and Marker capitalized. A name of a source or blocklist
// is a run with its color, so it shows in its own color (AboutText).
import type { Run } from "../about";
import { shortDate } from "../time";
import type { Experiment, Suggestion } from "./types";

/** A source or blocklist named in its own color. */
export type Named = { name: string; color: string };
const named = (n: Named): Run => ({ text: n.name, color: n.color });
const plain = (text: string): Run => ({ text });

/** An hour as "21:00", from minutes after midnight. */
export const hhmm = (minutes: number) => `${String(Math.floor((((minutes % 1440) + 1440) % 1440) / 60)).padStart(2, "0")}:${String((((minutes % 60) + 60) % 60)).padStart(2, "0")}`;

/** When something happened in the Day, from minutes after midnight: "after
 *  21:00" when it runs to the Day's end (`end`), else "14:00 to 16:00". */
export const when = (from: number, to: number, end: number) => (((to - end) % 1440 + 1440) % 1440 === 0 ? `after ${hhmm(from)}` : `${hhmm(from)} to ${hhmm(to)}`);

/** Shift: "Distraction this week, mostly YouTube after 21:00". */
export function shift(measure: string, part?: Named | null, at?: string | null): Run[] {
  const out: Run[] = [plain(`${measure} this week`)];
  if (part) out.push(plain(", mostly "), named(part));
  if (at) out.push(plain(part ? ` ${at}` : `, mostly ${at}`));
  return out;
}

/** Correlation: "Day after Workout: Chinese Vouchers", "Busy Days: Distraction". */
export function correlation(driver: Run[], outcome: Run[]): Run[] {
  return [...driver, plain(": "), ...outcome];
}

/** Planned time: "Lost planned time, mostly 14:00 to 16:00". */
export const planned = (at: string): Run[] => [plain(`Lost planned time, mostly ${at}`)];

/** An app or site on no blocklist: "news.example.com, on no blocklist, 9 of the last 14 Days". */
export const unlisted = (app: string, days: number, of: number): Run[] => [plain(`${app}, on no blocklist, ${days} of the last ${of} Days`)];

/** Late Distraction: "Distraction after 21:00, 5 of the last 7 Days". */
export const late = (from: string, days: number, of: number): Run[] => [plain(`Distraction after ${from}, ${days} of the last ${of} Days`)];

/** Unlocks into planned blocks: "Unlocks running into planned time, mostly 14:00 to 16:00". */
export const intoPlanned = (at: string | null): Run[] => [plain(`Unlocks running into planned time${at ? `, mostly ${at}` : ""}`)];

/** The goal against the Curfew answers: "Goal Days that went badly, the last 8 weeks". */
export const goalFit = (badGoalDays: boolean): Run[] => [plain(`${badGoalDays ? "Goal Days that went badly" : "Missed Days that went well"}, the last 8 weeks`)];

/** A goal's hit rate shift: "Sleep goal, last 4 weeks". */
export const goalShift = (goal: Run[]): Run[] => [...goal, plain(", last 4 weeks")];

/** Goals together: "Tasks goal Days: Sleep goal", "Workout Days goal weeks: Sleep goal". */
export const goalPair = (a: Run[], period: "day" | "week", b: Run[]): Run[] => [...a, plain(period === "week" ? " weeks: " : " Days: "), ...b];

/** Under a goal's hit rate shift. */
export const goalShiftNote = "The bars say how sure: shuffling whole weeks of your Days thousands of times rarely moves a hit rate this far. The picture is each week's hit rate, the last 4 weeks in color.";

/** Under goals that go together. */
export const goalPairNote = (helps: boolean) =>
  `${helps ? "Meeting one goes with meeting the other" : "Meeting one goes with missing the other"}. The bars say how sure, from shuffling whole weeks of your Days thousands of times. They go together; that doesn't prove one causes the other.`;

/** Verdict: "Curfew at 21:30: Distraction a Day". */
export const verdict = (what: string, measure: string): Run[] => [plain(`${what}: ${measure}`)];

/** Record: "Most Vouchers in a Day: Saturday", "Most Chinese Vouchers in a Day: Monday". */
export function record(name: string | Run[], day: string): Run[] {
  return [...(typeof name === "string" ? [plain(name)] : name), plain(`: ${day}`)];
}

/** Lapse: "Daily goal missed since Friday". */
export const lapse = (since: string): Run[] => [plain(`Daily goal missed since ${since}`)];

/** A running Experiment's row: "Trying Curfew at 21:30, Day 5 of 14", or "settling in" before its measured Days. */
export function running(e: Experiment, day: number): Run[] {
  if (day < 1) return [plain(`Trying ${e.text}, settling in`)];
  return [plain(`Trying ${e.text}, Day ${Math.min(day, e.measure_days)} of ${e.measure_days}`)];
}

/** Under a running Experiment: "verdict 10-29", or while it waits for the morning, "starts 06:00". */
export const runningWhen = (e: Experiment, today: string, waiting: boolean) => (waiting ? "starts 06:00" : `verdict ${shortDate(e.verdict_day, today)}`);

/** Its verdict, once in, on the row: "Curfew at 21:30: late Distraction a Day". */
export const judged = (e: Experiment, measure: string): Run[] => verdict(e.text, measure);

// ---- Suggestions ----

/** A suggestion's button and the confirm sheet's heading. */
export const tryButton = (short: string) => `Try ${short}`;
export const tryTitle = (s: Suggestion) => `Try ${s.text}?`;

/** When the change starts, on the confirm sheet. */
export function startsWhen(s: Suggestion, curfewStart: string): string {
  if (s.rule === "Daily goal") return "The Daily goal is fixed for a Day once it starts, so this one starts with the next Day, at 06:00.";
  if (!s.tightens) return "A loosening, so it waits until 06:00, as every loosening does.";
  if (s.rule === "Curfew") return `A tightening, so it starts at once: Curfew from ${curfewStart} tonight.`;
  return "A tightening, so it starts at once.";
}

/** The confirm sheet's points: the Marker, the Days, the verdict, and ending it. */
export function plan(s: Suggestion, days: { start: string; settleEnd: string; measureStart: string; measureEnd: string; verdict: string }, today: string): { marker: string; settle: [string, string]; measured: [string, string]; verdict: string; ending: string } {
  const d = (x: string) => shortDate(x, today);
  return {
    marker: `Trying ${s.text}`,
    settle: [d(days.start), d(days.settleEnd)],
    measured: [d(days.measureStart), d(days.measureEnd)],
    verdict: d(days.verdict),
    ending: s.tightens ? `Ending it early loosens ${s.rule === "Curfew" ? "Curfew" : `the ${s.rule}`}, so that waits until 06:00.` : "Ending it early puts the old rule back at 06:00.",
  };
}

// ---- The verdict, for the notification and the proof sheet ----

export type Outcome = "helped" | "unclear" | "worse";

/** The notification's title and text for a verdict. `a` and `b` are the
 *  measure before and after, as shown ("81 min"); `rare` says whether
 *  swings this big are rare in the history (null: too little history to say). */
export function verdictWords(what: string, measure: string, a: string, b: string, up: boolean, outcome: Outcome, rare: boolean | null, days: number): { title: string; text: string } {
  const moved = `${measure} ${up ? "rose" : "fell"} from ${a} to ${b} over ${days} Days`;
  if (outcome === "helped") return { title: `${what} helped`, text: `${moved}. ${rare ? "Swings this big are rare in your history, so it's likely real." : "There's too little history yet to say if that's more than chance."}` };
  if (outcome === "worse") return { title: `${what} didn't help`, text: `${moved}. Keep it anyway, or go back?` };
  return { title: `${what}: too close to call`, text: `${moved}, but ${rare === null ? "there's too little history yet to tell that from chance" : "swings this size are common in your history. It could be chance"}.` };
}

// ---- Proof sheets ----

/** What the bars mean, under a finding's proof. */
export function barsNote(kind: "correlation" | "shift" | "verdict" | "planned" | "pattern", share?: number, total?: number): string {
  switch (kind) {
    case "correlation": return "The bars say how sure: shuffling whole weeks of your Days thousands of times rarely gives a difference this big. These go together; that doesn't prove one causes the other.";
    case "shift": return share !== undefined ? `Of ${total} other weeks in your history, ${share}% moved this far from the weeks around them.` : "There's too little history yet to compare this week with others.";
    case "verdict": return share !== undefined ? `Of ${total} other stretches the same length, ${share}% changed this much just from ordinary ups and downs.` : "There's too little history yet to check this against ordinary ups and downs.";
    case "planned": return "The bars say how often shuffling which blocks lost time puts this much of it in one stretch of the Day.";
    case "pattern": return "The bars say how steadily it keeps happening.";
  }
}

// ---- The empty state ----

export const firstFindings = (n: number) => `${n === 1 ? "Day" : "Days"} until the first findings.`;
export const onDay = (day: number) => `You're on Day ${day}; it needs two weeks to know your usual.`;
export const emptyFoot = "Until then, add a Marker in the Log and Before and after compares the weeks either side of it.";
export const nothingYet = "Nothing stands out yet: no change this week, pattern, or record is big enough and steady enough to show.";
