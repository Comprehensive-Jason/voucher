// Things that keep happening, which a rule could answer: an app or site on
// no blocklist that keeps taking Distraction time, and the Daily goal
// against the Curfew answers (goal Days that went badly, or missed Days that
// went well, as the Goal vs how the Day went card counts them). Neither is
// a comparison with chance, so their bars say how steadily they happen.
import { lateMinutes } from "../beforeAfter";
import { measured } from "../notes.svelte";
import type { DayTotal } from "../types";
import { clamp, listOf, measureContext, type Context } from "./context";
import { goalFit, hhmm, late as lateSentence, unlisted } from "./text";
import type { Finding } from "./types";

const RECENT = 14, MIN_DAYS = 4, MIN_MINUTES = 30, SOME = 3;
/** The Curfew answers looked at, as on the Goal vs how the Day went card. */
const ANSWERS = 56, MIN_ANSWERS = 4;

/** Apps and sites on no blocklist with Distraction minutes on 4 or more of the last 14 Days. */
export function unlistedFindings(ctx: Context): Finding[] {
  const recent = ctx.days.slice(-RECENT).filter(measured);
  const by = new Map<string, number[]>();
  recent.forEach((d, i) => {
    for (const [app, m] of Object.entries(d.used ?? {})) {
      if (m < SOME || listOf(ctx, app, d)) continue;
      if (!by.has(app)) by.set(app, new Array<number>(recent.length).fill(0));
      by.get(app)![i] = m;
    }
  });
  const out: Finding[] = [];
  for (const [app, minutes] of by) {
    const days = minutes.filter((m) => m > 0).length, total = minutes.reduce((a, b) => a + b, 0);
    if (days < MIN_DAYS || total < MIN_MINUTES) continue;
    out.push({
      id: `pattern:unlisted:${app}`,
      kind: "pattern",
      domain: "distraction",
      sentence: unlisted(app, days, RECENT),
      size: clamp(days / 7 + total / 300, 0, 2.5),
      confidence: days >= 10 ? 3 : days >= 7 ? 2 : 1,
      pill: { text: `${Math.round(total)} min`, tone: "worse" },
      visual: { kind: "spark", values: minutes, week: 7, usual: total / Math.max(1, recent.length), good: false },
      proof: {
        facts: [["Days with it, last 2 weeks", `${days} of ${recent.length}`], ["Minutes in all", String(Math.round(total))], ["Blocklist", "none: it counts as Other"]],
        note: "Distraction time counts it as Other because no blocklist names it. The bars say how steadily it shows up: on how many Days.",
      },
      value: total,
      floor: 60,
    });
  }
  return out;
}

/** The Daily goal against how the Days went: one finding for whichever way it's off, if either. */
export function goalFitFindings(ctx: Context): Finding[] {
  const recent = ctx.days.slice(-ANSWERS);
  const answered = recent.filter((d) => d.verdict);
  const met = answered.filter((d) => d.goal_met), missed = answered.filter((d) => !d.goal_met);
  const bad = met.filter((d) => d.verdict === "no").length, good = missed.filter((d) => d.verdict !== "no").length;
  const cells = (d: DayTotal) => (!d.verdict ? (d.goal_met ? "met" : "missed") : d.goal_met ? (d.verdict === "no" ? "bad" : "met") : d.verdict === "no" ? "missed" : "good");
  const strip = recent.slice(-14).map(cells);
  const out: Finding[] = [];
  const make = (badGoalDays: boolean, hits: number, of: number): Finding => ({
    id: badGoalDays ? "pattern:goal-bad" : "pattern:goal-good",
    kind: "pattern",
    domain: "goal",
    sentence: goalFit(badGoalDays),
    size: clamp((hits / of) * 2, 0, 2),
    confidence: of >= 12 ? 3 : of >= 8 ? 2 : 1,
    pill: { text: `${hits} of ${of}`, tone: "worse" },
    visual: { kind: "squares", cells: strip, run: 0 },
    proof: {
      facts: [["Goal Days answered", String(met.length)], ["Of those that went badly", String(bad)], ["Missed Days answered", String(missed.length)], ["Of those that went well", String(good)]],
      note: badGoalDays
        ? "Goal Days often went badly: the goal may count the wrong work, or too little of it. The bars say how many answers this rests on."
        : "Missed Days often went well: the goal may ask too much. The bars say how many answers this rests on.",
    },
    value: hits / of,
    floor: 0.2,
  });
  if (met.length >= MIN_ANSWERS && bad / met.length >= 0.3) out.push(make(true, bad, met.length));
  else if (missed.length >= MIN_ANSWERS && good / missed.length >= 0.5) out.push(make(false, good, missed.length));
  return out;
}

/** Late Distraction (15 minutes or more in the hour before Curfew, or in
 *  it) on 4 or more of the last 7 Days whose Distraction times are known. */
export function lateFindings(ctx: Context): Finding[] {
  const mc = measureContext(ctx);
  const recent = ctx.days.slice(-RECENT);
  const late = recent.map((d) => lateMinutes(d, mc.lateFrom!, ctx.timeZone, ctx.dayStart / 60));
  const week = late.slice(-7).filter((m): m is number => m !== null);
  const days = week.filter((m) => m >= 15).length;
  if (week.length < 5 || days < 4) return [];
  const from = ctx.curfewStart - 60;
  return [{
    id: "pattern:late",
    kind: "pattern",
    domain: "distraction",
    sentence: lateSentence(hhmm(from), days, week.length),
    size: clamp(days / 5, 0, 1.6),
    confidence: days >= 6 ? 3 : days >= 5 ? 2 : 1,
    pill: { text: `${Math.round(week.reduce((a, b) => a + b, 0) / week.length)} min`, tone: "worse" },
    visual: { kind: "spark", values: late, week: 7, usual: 15, good: false },
    proof: {
      facts: [[`Days with 15 min or more after ${hhmm(from)}`, `${days} of ${week.length}`], ["A Day on average", `${Math.round(week.reduce((a, b) => a + b, 0) / week.length)} min`]],
      note: "Late Distraction is Distraction in the hour before Curfew, or in it on a device that wasn't enforcing. The bars say how steadily it happens.",
    },
    value: days,
    floor: 2,
    absolute: true,
  }];
}
