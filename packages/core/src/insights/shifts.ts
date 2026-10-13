// Shifts against the usual: this week (the last 7 finished Days) against
// the usual (the 28 Days before it), for Distraction, Unlocks, Vouchers,
// time asleep, Distraction per Unlock, and late Distraction. A shift says
// what drove it where it can: which blocklist or source moved most, and
// which hours of the Day.
//
// How sure: the same question asked of every other week in the history.
// Each 7-Day stretch in the 8 weeks before this week is compared with the
// usual Days around it (the 28 before this week, leaving that stretch out),
// and the share of those stretches that moved at least as far is the
// chance an ordinary week moves this much: (1 + as far) / (1 + compared), as
// correlate.ts counts its shuffles, then its tiers (High under 5%, Medium
// under 10%, Low under 20%). Stretches start on any Day, so their weekdays
// match this week's in turn, and a stretch keeps its Days together, so a
// run of bad Days counts once, as a bad week does. Under 5 stretches to
// compare (about 18 Days of history), nothing shows.
import { minutesByList } from "../blocklists";
import { confidenceOf } from "../correlate";
import { distractionOf, lateMinutes } from "../beforeAfter";
import { measured } from "../notes.svelte";
import { styleOf } from "../sources";
import type { DayTotal } from "../types";
import { clamp, into, known, mean, measureContext, sd, signed, type Context } from "./context";
import { shift as say, hhmm, when, type Named } from "./text";
import type { Confidence, Finding } from "./types";

/** Days in "this week", in the usual, and in the stretch of history the other weeks come from. */
export const WEEK = 7, USUAL = 28, BACK = 56;
/** The fewest known Days this week and in the usual, and the fewest other weeks to compare. */
const MIN_WEEK = 4, MIN_USUAL = 7, MIN_WEEKS = 5;
/** A part (a blocklist, a source, some hours) is named when it carries this share of the change. */
const MOSTLY = 0.4;

type ShiftMeasure = {
  id: string;
  /** As the sentence names it. */
  name: string;
  domain: string;
  up: boolean;
  value: (d: DayTotal) => number | null;
  /** The least change that counts, in its units. */
  floor: number;
  /** The pill as a percentage of the usual, or in minutes. */
  percent: boolean;
  /** Its parts on a Day, by id, with how each is named. */
  parts?: (d: DayTotal) => Record<string, number>;
  partName?: (id: string) => Named | null;
  /** Its amount in each hour of the Day from the Day's start, or null when unknown. */
  hours?: (d: DayTotal) => number[] | null;
};

/** Minutes of `spans` in each hour of the Day. */
function spanHours(ctx: Context, d: DayTotal, spans: [string, string][]): number[] {
  const out = new Array<number>(24).fill(0);
  for (const [a, b] of spans) {
    const x = Math.max(0, into(ctx, a, d.day)), y = Math.min(1440, into(ctx, b, d.day));
    for (let m = Math.floor(x); m < y; m++) out[Math.floor(m / 60)] += Math.min(1, y - m);
  }
  return out;
}

function measures(ctx: Context): ShiftMeasure[] {
  const mc = measureContext(ctx);
  const list = (id: string): Named | null => (id === "~other" ? null : ctx.blocklists[id] ? { name: ctx.blocklists[id].name, color: ctx.blocklists[id].color } : null);
  const source = (id: string): Named => ({ name: styleOf(id).name, color: styleOf(id).color });
  return [
    {
      id: "distraction", name: "Distraction", domain: "distraction", up: false, floor: 10, percent: true,
      value: (d) => (measured(d) ? distractionOf(d) : null),
      parts: (d) => Object.fromEntries(minutesByList(d.used, d.used_lists, ctx.blocklists).map((p) => [p.id, p.minutes])),
      partName: list,
      hours: (d) => (d.distraction_spans ? spanHours(ctx, d, d.distraction_spans) : null),
    },
    {
      id: "late", name: "Late Distraction", domain: "distraction", up: false, floor: 5, percent: true,
      value: (d) => lateMinutes(d, mc.lateFrom!, ctx.timeZone, ctx.dayStart / 60),
    },
    {
      id: "unlocks", name: "Unlocks", domain: "unlocks", up: false, floor: 0.5, percent: true,
      value: (d) => (d.tears === undefined ? null : d.tears),
      hours: (d) => {
        if (!d.unlocks) return null;
        const out = new Array<number>(24).fill(0);
        for (const [a] of d.unlocks) { const m = into(ctx, a, d.day); if (m >= 0 && m < 1440) out[Math.floor(m / 60)]++; }
        return out;
      },
    },
    {
      id: "earned", name: "Vouchers", domain: "earning", up: true, floor: 1.5, percent: true,
      value: (d) => d.earned,
      parts: (d) => d.by_source ?? {},
      partName: source,
    },
    { id: "asleep", name: "Time asleep", domain: "sleep", up: true, floor: 20, percent: false, value: (d) => d.sleep?.asleep ?? null },
    {
      id: "per_unlock", name: "Distraction per Unlock", domain: "distraction", up: false, floor: 2, percent: true,
      value: (d) => (measured(d) && (d.tears ?? 0) > 0 ? distractionOf(d) / d.tears! : null),
    },
  ];
}

/** What drove a change: the part (blocklist or source) and the hours that
 *  carry the most of it, each only when it carries at least MOSTLY of it. */
function drivers(m: ShiftMeasure, week: DayTotal[], usual: DayTotal[], change: number, ctx: Context): { part: { id: string; named: Named } | null; hours: [number, number] | null; byPart: [string, number][] } {
  let part: { id: string; named: Named } | null = null;
  let byPart: [string, number][] = [];
  if (m.parts && m.partName) {
    const avg = (days: DayTotal[]) => {
      const sums = new Map<string, number>();
      const counted = days.filter((d) => m.value(d) !== null);
      for (const d of counted) for (const [id, v] of Object.entries(m.parts!(d))) sums.set(id, (sums.get(id) ?? 0) + v);
      return { sums, n: Math.max(1, counted.length) };
    };
    const w = avg(week), u = avg(usual);
    const ids = new Set([...w.sums.keys(), ...u.sums.keys()]);
    byPart = [...ids].map((id): [string, number] => [id, (w.sums.get(id) ?? 0) / w.n - (u.sums.get(id) ?? 0) / u.n]).sort((a, b) => Math.sign(change) * (b[1] - a[1]));
    const [top, moved] = byPart[0] ?? [];
    const named = top !== undefined ? m.partName(top) : null;
    if (named && moved * Math.sign(change) >= MOSTLY * Math.abs(change)) part = { id: top, named };
  }
  let hours: [number, number] | null = null;
  if (m.hours) {
    const avg = (days: DayTotal[]) => {
      const rows = known(days.map((d) => m.hours!(d)));
      return rows.length ? rows.reduce((t, r) => t.map((x, i) => x + r[i] / rows.length), new Array<number>(24).fill(0)) : null;
    };
    const w = avg(week), u = avg(usual);
    if (w && u) {
      const diff = w.map((x, i) => (x - u[i]) * Math.sign(change));
      const total = diff.reduce((a, b) => a + Math.max(0, b), 0);
      // The 1 to 3 hours that carry the most of the change, and their share.
      let best: [number, number, number] | null = null;
      for (let len = 1; len <= 3; len++) for (let h = 0; h + len <= 24; h++) {
        const s = diff.slice(h, h + len).reduce((a, b) => a + b, 0);
        // A wider stretch wins only when it adds a fair part.
        if (!best || s > best[2] * (1 + 0.2 * (len - (best[1] - best[0])))) best = [h, h + len, s];
      }
      if (best && total > 0 && best[2] >= MOSTLY * total) hours = [best[0], best[1]];
    }
  }
  return { part, hours, byPart };
}

export function shiftFindings(ctx: Context): Finding[] {
  const { days } = ctx;
  if (days.length < WEEK + MIN_USUAL) return [];
  const week = days.slice(-WEEK);
  const before = days.slice(Math.max(0, days.length - WEEK - BACK), days.length - WEEK);
  const usual = before.slice(-USUAL);
  const out: Finding[] = [];
  for (const measure of measures(ctx)) {
    // Each Day's value worked out once: late Distraction reads the clock, which is slow.
    const values = new Map([...before, ...week].map((d) => [d.day, measure.value(d)]));
    const m = { ...measure, value: (d: DayTotal) => (values.has(d.day) ? values.get(d.day)! : measure.value(d)) };
    const w = known(week.map(m.value)), u = known(usual.map(m.value));
    if (w.length < MIN_WEEK || u.length < MIN_USUAL) continue;
    const typical = mean(u), change = mean(w) - typical;
    if (Math.abs(change) < m.floor || (m.percent && typical > 0 && Math.abs(change) / typical < 0.15)) continue;
    // Every other week: each 7-Day stretch before this one, against the usual Days without it.
    const swings: number[] = [];
    for (let p = 0; p + WEEK <= before.length; p++) {
      const stretch = before.slice(p, p + WEEK), inside = new Set(stretch.map((d) => d.day));
      const v = known(stretch.map(m.value)), rest = known(usual.filter((d) => !inside.has(d.day)).map(m.value));
      if (v.length < MIN_WEEK || rest.length < MIN_USUAL) continue;
      swings.push(mean(v) - mean(rest));
    }
    if (swings.length < MIN_WEEKS) continue;
    const asFar = swings.filter((s) => Math.abs(s) >= Math.abs(change) - 1e-9).length;
    const chance = (1 + asFar) / (1 + swings.length);
    const confidence = confidenceOf(chance) as 0 | Confidence;
    if (!confidence) continue;
    const spread = sd(swings);
    const good = change > 0 === m.up;
    const { part, hours, byPart } = drivers(m, week, usual, change, ctx);
    const at = hours ? when(ctx.dayStart + hours[0] * 60, ctx.dayStart + hours[1] * 60, ctx.curfewStart) : null;
    const pct = typical > 0 ? Math.round((change / typical) * 100) : null;
    const show = (v: number) => (m.id === "unlocks" ? v.toFixed(1) : m.id === "earned" ? v.toFixed(1) : `${Math.round(v)} min`);
    const series = days.slice(-14).map(m.value);
    out.push({
      id: `shift:${m.id}`,
      kind: "shift",
      domain: m.domain,
      subject: part ? { id: part.id, color: part.named.color } : undefined,
      sentence: say(m.name, part?.named, at),
      size: clamp(Math.abs(change) / (spread > 0 ? spread : Math.abs(change)), 0, 4),
      confidence,
      pill: { text: m.percent && pct !== null ? `${signed(pct)}%` : `${signed(change)} min`, tone: good ? "good" : "worse" },
      visual: { kind: "spark", values: series, week: WEEK, usual: typical, good },
      proof: {
        facts: [
          ["This week, a Day", show(mean(w))],
          ["The 4 weeks before, a Day", show(typical)],
          ...byPart.slice(0, 3).filter(([, v]) => Math.abs(v) >= 0.05).map(([id, v]): [string, string] => [m.partName?.(id)?.name ?? "Other", `${signed(v, m.id === "earned" ? 1 : 0)}${m.id === "earned" ? "" : " min"} a Day`]),
          ...(hours ? [["Most of it", `${hhmm(ctx.dayStart + hours[0] * 60)} to ${hhmm(ctx.dayStart + hours[1] * 60)}`] as [string, string]] : []),
        ],
        note: `Of ${swings.length} other weeks, ${Math.round((asFar / swings.length) * 100)}% moved this far from the usual.`,
        big: { kind: "spark", values: days.slice(-35).map(m.value), week: WEEK, usual: typical, good },
      },
      value: change,
      floor: m.floor,
    });
  }
  // Late Distraction rising says the same as Distraction rising in its last
  // hours: keep the one that names more.
  const all = out.find((f) => f.id === "shift:distraction"), late = out.find((f) => f.id === "shift:late");
  if (all && late && all.sentence.some((r) => /after /.test(r.text)) && all.value > 0 === late.value > 0) out.splice(out.indexOf(late), 1);
  return out;
}
