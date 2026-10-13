// Experiments and Before and after verdicts. An Experiment is a rule change
// tried for two weeks: its first 3 Days settle, the next 14 are measured,
// and on the Day after them Before and after ($core/beforeAfter.ts) gives
// the verdict on the measure it was started for, the same way the card
// does for any Marker. Recent Markers get a verdict finding too, once their
// 14 Days after are in.
import { better, compareAt, confidenceOfShare, measureOf, MEASURES, same, SETTLE, SPAN, show, type Compared, type Measure } from "../beforeAfter";
import { dayOfMoment } from "../notes.svelte";
import { shiftDay, shortDate } from "../time";
import type { DayTotal } from "../types";
import { clamp, measureContext, signed, type Context } from "./context";
import { verdict as sayVerdict, verdictWords, type Outcome } from "./text";
import type { Experiment, Finding } from "./types";

/** Where a running Experiment is: its measured Day (under 1 while settling),
 *  whether it's still waiting for the Morning boundary, and whether its
 *  verdict is due. */
export function progress(e: Experiment, today: string): { day: number; waiting: boolean; due: boolean; measureStart: string } {
  const measureStart = shiftDay(e.start_day, e.settle_days);
  const day = Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${measureStart}T12:00:00Z`)) / 86_400_000) + 1;
  return { day, waiting: e.marker_at === null, due: today >= e.verdict_day, measureStart };
}

/** The Days an Experiment started today would settle and be measured, and its verdict Day. */
export function schedule(startDay: string) {
  return {
    start: startDay, settleEnd: shiftDay(startDay, SETTLE - 1),
    measureStart: shiftDay(startDay, SETTLE), measureEnd: shiftDay(startDay, SETTLE + SPAN - 1),
    verdict: shiftDay(startDay, SETTLE + SPAN),
  };
}

/** A change in a measure as the pill says it: "−1.5", "−35 min", "+12%". */
function changeText(m: Measure, a: number, b: number): string {
  const d = b - a;
  if (m.unit === " min") return `${signed(d)} min`;
  if (m.unit === "%") return `${signed(d)}%`;
  return signed(d, m.digits ?? 0);
}

/** What Go back undoes, in words: "Go back to 22:00". */
export function backWords(e: Pick<Experiment, "undo">): string {
  const u = e.undo as Record<string, unknown>;
  if (u.Curfew) return `Go back to ${String((u.Curfew as { start: string }).start).slice(0, 5)}`;
  if (u.UnlockMinutes !== undefined) return `Go back to ${u.UnlockMinutes} min`;
  if (u.DailyGoal !== undefined) return `Go back to a goal of ${u.DailyGoal}`;
  if (u.BankLimit !== undefined) return `Go back to ${u.BankLimit}`;
  if (u.RemoveSite) return `Unblock ${(u.RemoveSite as { site: string }).site}`;
  if (u.RemoveApp || u.BlockApp || u.BlockSite) return "Unblock it";
  return "Go back";
}

/** Before and after for a measure around Day `day`, if its Days are in. */
function around(ctx: Context, day: string, m: Measure): Compared | null {
  const at = ctx.days.findIndex((d) => d.day === day);
  if (at < 0 || at + SETTLE + SPAN > ctx.days.length) return null;
  return compareAt(ctx.days, at, m, measureContext(ctx));
}

/** An Experiment's verdict once it's due: the words for the Ledger (and so
 *  the notification), and how it came out. Null until its Days are in. */
export function judge(e: Experiment, ctx: Context): { title: string; text: string; outcome: Outcome; back: string; compared: Compared } | null {
  const m = measureOf(e.measure);
  if (!m) return null;
  const c = around(ctx, e.start_day, m);
  if (!c) return null;
  const good = better(m, c.a, c.b), share = c.luck?.share;
  const outcome: Outcome = good === true ? (share === undefined || share <= 10 ? "helped" : "unclear") : good === false ? "worse" : "unclear";
  const words = verdictWords(e.text.replace(/^./, (x) => x.toUpperCase()), m.name, show(c.a, m), show(c.b, m), c.b > c.a, outcome, share === undefined ? null : share <= 10, e.measure_days);
  return { ...words, outcome, back: backWords(e), compared: c };
}

/** A verdict finding for a comparison. */
function verdictFinding(id: string, what: string, c: Compared, extra: Partial<Finding> = {}): Finding {
  const m = c.measure, good = better(m, c.a, c.b);
  const confidence = c.luck ? confidenceOfShare(c.luck.share) || null : null;
  return {
    id, kind: "verdict", domain: m.id,
    sentence: sayVerdict(what, m.name),
    size: clamp(Math.abs(c.b - c.a) / Math.max(Math.abs(c.a), 1) * 3, 0, 3),
    confidence: confidence as Finding["confidence"],
    pill: { text: changeText(m, c.a, c.b), tone: good === null ? "neutral" : good ? "good" : "worse" },
    visual: { kind: "arrow", before: c.a, after: c.b, labels: [show(c.a, m), show(c.b, m)], good },
    proof: {
      facts: [[`${SPAN} Days before`, show(c.a, m)], [`${SPAN} Days after, from the ${SETTLE + 1}th`, show(c.b, m)]],
      note: c.luck ? `Of ${c.luck.total} other stretches the same length, ${c.luck.share}% changed this much just from ordinary ups and downs.` : "There's too little history yet to check this against ordinary ups and downs.",
      big: { kind: "arrow", before: c.a, after: c.b, labels: [show(c.a, m), show(c.b, m)], good },
    },
    value: c.b - c.a,
    floor: Math.max(0.5, Math.abs(c.a) * 0.1),
    ...extra,
  };
}

/** The verdict findings of judged Experiments still waiting for Keep it or Go back. */
export function experimentFindings(ctx: Context): Finding[] {
  return ctx.experiments.filter((e) => e.status === "ready").flatMap((e) => {
    const m = measureOf(e.measure);
    const c = m ? around(ctx, e.start_day, m) : null;
    if (!c) return [];
    return [verdictFinding(`experiment:${e.id}`, e.text.replace(/^./, (x) => x.toUpperCase()), c, { experiment: e.id, size: 5 })];
  });
}

/** Which measure a rule Marker's change is judged on. */
function measureForRule(text: string): Measure | undefined {
  const first = text.split("; ")[0];
  const id = /^Curfew/.test(first) ? "late" : /^Unlocks last/.test(first) ? "unlocks" : /^Daily goal/.test(first) ? "went_well"
    : / (blocked|unblocked) in |removed from| on$| off$|blocklist|reset$/.test(first) ? "distraction" : /pays every|source|apps changed|heart rate/.test(first) ? "earned"
    : /^Bank holds/.test(first) ? "unlocked" : null;
  return id ? measureOf(id) : undefined;
}

/** Verdicts on Markers whose 14 Days after came in during the last 3 weeks:
 *  a rule Marker on what its rule should move, a hand-written one on
 *  whichever of the card's measures moved most surely. Only ones luck
 *  rarely matches show, and never an Experiment's own Marker. */
export function markerFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const mc = measureContext(ctx);
  const index = new Map(ctx.days.map((d, i) => [d.day, i]));
  const own = new Set(ctx.experiments.map((e) => e.marker_at).filter(Boolean));
  for (const marker of ctx.markers) {
    if (own.has(marker.at) || marker.text.startsWith("Trying ")) continue;
    const at = index.get(dayOfMoment(marker.at));
    if (at === undefined || at + SETTLE + SPAN > ctx.days.length || ctx.days.length - (at + SETTLE + SPAN) > 21) continue;
    const ruled = marker.rule ? measureForRule(marker.text) : undefined;
    const candidates = ruled ? [ruled] : MEASURES.filter((m) => m.table);
    let best: Compared | null = null;
    for (const m of candidates) {
      const c = compareAt(ctx.days, at, m, mc) ?? (m.id === "late" ? compareAt(ctx.days, at, measureOf("distraction")!, mc) : null);
      if (!c || !c.luck || same(c.measure, c.a, c.b) || confidenceOfShare(c.luck.share) === 0) continue;
      if (!best || c.luck.share < best.luck!.share) best = c;
    }
    if (best) out.push(verdictFinding(`verdict:${marker.at}`, marker.text, best, { proof: { ...verdictFinding("", "", best).proof, facts: [["Marker", `${shortDate(dayOfMoment(marker.at), ctx.today)} ${marker.text}`], ...verdictFinding("", "", best).proof.facts] } }));
  }
  return out;
}

/** The Days a verdict reads, for tests and the proof sheet. */
export const verdictDays = (days: DayTotal[], start: string) => days.filter((d) => d.day >= shiftDay(start, -SPAN) && d.day < shiftDay(start, SETTLE + SPAN));
