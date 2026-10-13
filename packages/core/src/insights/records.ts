// Records and lapses: a new best in the last week (most Vouchers in a Day,
// the longest Streak, most from one source, the longest focus stretch), and
// Days in a row without the Daily goal, longer than the usual lapse. They
// are counts, not comparisons with chance, so they have no bars.
import { styleOf } from "../sources";
import { dayLabel, hoursAndMinutes, shiftDay, shortDate } from "../time";
import { goalRuns, median } from "../trends";
import type { DayTotal } from "../types";
import { clamp, sd, type Context } from "./context";
import { lapse as sayLapse, record as sayRecord } from "./text";
import type { Finding } from "./types";

/** A record must be set in the last week, over at least two weeks before it. */
const RECENT = 7, BEFORE = 14;

export function recordFindings(ctx: Context): Finding[] {
  const all = ctx.current ? [...ctx.days, ctx.current] : ctx.days;
  if (all.length < RECENT + BEFORE) return [];
  const earlier = all.slice(0, -RECENT), recent = all.slice(-RECENT);
  const out: Finding[] = [];
  const day = (d: string) => dayLabel(d, ctx.today);
  const best = <T,>(list: T[], score: (t: T) => number) => list.reduce<T | null>((a, b) => (a === null || score(b) > score(a) ? b : a), null);
  const size = (now: number, old: number, values: number[]) => clamp((now - old) / Math.max(1, sd(values) || 1) + 0.6, 0, 2.5);
  const make = (id: string, sentence: Finding["sentence"], now: number, old: number, labels: [string, string], when: string, values: number[], subject?: Finding["subject"]): Finding => ({
    id, kind: "record", domain: id.split(":")[1], subject, sentence,
    size: size(now, old, values), confidence: null,
    pill: { text: labels[1], tone: "gold" },
    visual: { kind: "record", old, best: now, labels },
    proof: { facts: [["New best", `${labels[1]}, ${when}`], ["Best before", labels[0]]], note: "Records only go up. Personal records lists every one." },
    value: now, floor: 1, absolute: true,
  });

  // Most Vouchers in a Day.
  const top = best(recent, (d) => d.earned), was = best(earlier, (d) => d.earned);
  if (top && was && top.earned > was.earned) {
    out.push(make("record:earned", sayRecord("Most Vouchers in a Day", day(top.day)), top.earned, was.earned, [String(was.earned), String(top.earned)], day(top.day), all.map((d) => d.earned)));
  }
  // The longest Streak, while it's still going.
  const runs = goalRuns(all), last = runs.at(-1);
  const going = last && (last.end === all.at(-1)!.day || last.end === ctx.days.at(-1)?.day);
  const longestBefore = Math.max(0, ...runs.slice(0, -1).map((r) => r.length));
  if (going && last && last.length > longestBefore && longestBefore >= 2) {
    const since = shiftDay(last.end, -(last.length - 1));
    out.push(make("record:streak", sayRecord("Longest Streak", `since ${shortDate(since, ctx.today)}`), last.length, longestBefore, [`${longestBefore} Days`, `${last.length} Days`], `since ${shortDate(since, ctx.today)}`, runs.map((r) => r.length)));
  }
  // Most from one source in a Day: the one past its old best by the most.
  const sources = [...new Set(all.flatMap((d) => Object.keys(d.by_source ?? {})))];
  let mostFrom: Finding | null = null, margin = 0;
  for (const id of sources) {
    const of = (d: DayTotal) => d.by_source?.[id] ?? 0;
    const t = best(recent, of), w = best(earlier, of);
    if (!t || !w || of(w) < 2 || of(t) <= of(w)) continue;
    const s = styleOf(id), m = (of(t) - of(w)) / of(w);
    if (m <= margin) continue;
    margin = m;
    mostFrom = make(`record:source:${id}`, sayRecord([{ text: "Most " }, { text: s.name, color: s.color }, { text: " Vouchers in a Day" }], day(t.day)), of(t), of(w), [String(of(w)), String(of(t))], day(t.day), all.map(of), { id, color: s.color });
  }
  if (mostFrom) out.push(mostFrom);
  // The longest focus stretch.
  const stretch = (d: DayTotal) => (d.stretches?.length ? Math.max(...d.stretches) : 0);
  const ts = best(recent, stretch), ws = best(earlier, stretch);
  if (ts && ws && stretch(ws) > 0 && stretch(ts) > stretch(ws)) {
    out.push(make("record:stretch", sayRecord("Longest focus stretch", day(ts.day)), stretch(ts), stretch(ws), [hoursAndMinutes(stretch(ws)), hoursAndMinutes(stretch(ts))], day(ts.day), all.map(stretch)));
  }
  return out;
}

/** Days in a row without the Daily goal, up to the last finished Day, when
 *  it's 3 or more and longer than the usual finished lapse. */
export function lapseFindings(ctx: Context): Finding[] {
  const days = ctx.days;
  let run = 0;
  for (let i = days.length - 1; i >= 0 && !days[i].goal_met; i--) run++;
  if (run < 3 || run === days.length) return [];
  // Finished lapses: missed Days in a row after a goal Day, ended by one.
  const lapses: { length: number; end: string }[] = [];
  let n = 0, seenGoal = false;
  for (const d of days.slice(0, -run)) {
    if (d.goal_met) { if (n && seenGoal) lapses.push({ length: n, end: d.day }); n = 0; seenGoal = true; } else n++;
  }
  const usual = lapses.length >= 3 ? median(lapses.map((l) => l.length)) : 2;
  if (run <= usual) return [];
  const first = days[days.length - run].day;
  const longer = [...lapses].reverse().find((l) => l.length >= run);
  const last = days.slice(-10);
  return [{
    id: "lapse:goal", kind: "lapse", domain: "goal",
    sentence: sayLapse(dayLabel(first, ctx.today)),
    size: clamp(run / Math.max(1, usual) - 0.4, 0, 2.5), confidence: null,
    pill: { text: `${run} Days`, tone: "worse" },
    visual: { kind: "squares", cells: last.map((d) => (d.goal_met ? "met" : "missed")), run: Math.min(run, last.length) },
    proof: {
      facts: [["Missed in a row", `${run} Days`], ["Usual lapse", `${usual} ${usual === 1 ? "Day" : "Days"}`], ["As long or longer before", longer ? `ended ${shortDate(longer.end, ctx.today)}` : "never"]],
      note: "A lapse ends with the next goal Day. Habit strength shows how each one dents the habit.",
    },
    value: run, floor: 2, absolute: true,
  }];
}
