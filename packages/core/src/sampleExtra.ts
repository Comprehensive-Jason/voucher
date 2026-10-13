// Sample sleep and calendar load for the browser preview, added to
// $core/sample.ts's Days (and so to `?history=N`). A hash of each date picks
// its figures, so any span agrees and screenshots are stable. Like the
// Ledger: nights are later and longer at the weekend, about one in seven is
// estimated (no Health Connect session), and weekdays carry most events.
// Also each Day's Unlocks, focus
// stretches with their starts, and Distraction spans, fitted to sample.ts's
// tears and stretch lengths.
//
// Links for What goes with a good Day to find: Distraction after 22:00 on
// about three evenings in ten pushes that night's bedtime later (so a
// shorter night); and about half the stretches that aren't the Day's
// longest start soon after an Unlock (with Distraction in it) and run
// shorter than the rest.
//
// And something of every kind for Insights to find (see `forInsights`):
// this week's Distraction up, mostly YouTube after 21:00; lost planned time
// mostly 14:00 to 16:00; a site on no blocklist most Days; a record six
// Days ago and a lapse since; and the Ledger's side of Insights (an
// Experiment due for its verdict, and with `?experiment=running` one
// running instead).
import type { InsightsState } from "./insights/types";
import type { CalendarChoice, CalendarDay, CalendarId, DaySummary, DayTotal, PlannedBlock, Sleep, TimedStretch } from "./types";

/** The sample's today, as sample.ts serves it. */
export const SAMPLE_TODAY = "2026-10-07";
/** Days from a sample Day to today. */
const back = (day: string) => Math.round((Date.parse(`${SAMPLE_TODAY}T12:00:00Z`) - Date.parse(`${day}T12:00:00Z`)) / 86_400_000);

/** A number in [0, 1) from a date and a salt. */
function hash(day: string, salt: number): number {
  const dn = Math.round(Date.parse(`${day}T12:00:00Z`) / 86_400_000);
  let x = Math.imul(dn ^ Math.imul(salt + 101, 0x9e3779b9), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
}

const shift = (day: string, n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
/** A moment on a date in the sample's zone (Los Angeles, on daylight time), from minutes after midnight. */
const local = (day: string, minutes: number) => {
  const d = minutes >= 1440 ? shift(day, 1) : minutes < 0 ? shift(day, -1) : day;
  const m = ((minutes % 1440) + 1440) % 1440;
  return `${d}T${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00-07:00`;
};
/** 0 Sunday to 6 Saturday. */
const weekday = (day: string) => new Date(`${day}T12:00:00Z`).getUTCDay();

/** Whether the sample Day had Distraction after 22:00 (on Days whose Distraction is measured). */
const lateEvening = (day: string) => hash(day, 60) < LATE_P;
// How strongly the sample's links show (see the top of this file).
const LATE_P = 0.3, LATE_BED = 135, AFTER_BREAK_P = 0.5, AFTER_BREAK = 0.6;

/** The night ending on `day`'s morning, or null for one with no data at all. */
export function sampleSleep(day: string): Sleep | null {
  if (hash(day, 1) < 0.04) return null;
  // Friday and Saturday nights (waking Saturday and Sunday) run later and longer.
  const weekend = weekday(day) === 6 || weekday(day) === 0;
  const bed = (weekend ? 50 : -15) + Math.round((hash(day, 2) - 0.5) * 90) + (lateEvening(shift(day, -1)) ? LATE_BED : 0);
  const wake = (weekend ? 9 * 60 + 20 : 7 * 60 + 25) + Math.round((hash(day, 3) - 0.5) * 70);
  const length = wake - bed;
  if (hash(day, 4) < 0.14) {
    return { bedtime: local(shift(day, -1), 1440 + bed), wake: local(day, wake), asleep: length - (hash(day, 5) < 0.3 ? 6 : 0), source: "estimated" };
  }
  return { bedtime: local(shift(day, -1), 1440 + bed), wake: local(day, wake), asleep: Math.round(length * (0.86 + hash(day, 6) * 0.1)),
    source: "health_connect", origin: "Samsung Health", device: "SM-S928U-4f2a" };
}

/** A Day's timed events as [start, end] minutes after midnight. */
function events(day: string): [number, number][] {
  const wd = weekday(day);
  const n = wd === 0 || wd === 6 ? (hash(day, 10) < 0.35 ? 1 : 0) : 2 + Math.floor(hash(day, 11) * 5);
  const out: [number, number][] = [];
  for (let i = 0; i < n; i++) {
    const start = 9 * 60 + Math.floor(hash(day, 20 + i) * 16) * 30;
    const length = [30, 50, 60, 60, 90][Math.floor(hash(day, 40 + i) * 5)];
    out.push([start, start + length]);
  }
  return out.sort((a, b) => a[0] - b[0]);
}

/** A Day's calendar load, worked out as the Ledger does: overlaps merged, minutes split by clock hour. */
export function sampleCalendar(day: string): CalendarDay {
  const list = events(day);
  const merged: [number, number][] = [];
  for (const [a, b] of list) {
    const last = merged.at(-1);
    if (last && a <= last[1]) last[1] = Math.max(last[1], b); else merged.push([a, b]);
  }
  const busy_hours = Array<number>(24).fill(0), event_hours = Array<number>(24).fill(0);
  for (const [a] of list) event_hours[Math.floor(a / 60) % 24]++;
  for (const [a, b] of merged) for (let m = a; m < b; m++) busy_hours[Math.floor(m / 60) % 24]++;
  return {
    events: list.length, busy_minutes: merged.reduce((t, [a, b]) => t + b - a, 0), busy_hours, event_hours,
    busy: merged.map(([a, b]) => [local(day, a), local(day, b)]),
  };
}

/** Minutes after the Day began (06:00) as a moment. */
const at = (day: string, offset: number) => local(day, 360 + offset);
/** Minutes after the Day began of a sample moment such as "2026-10-07T12:10:00-07:00". */
const offsetOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) - 360;

/** A sample Day's Unlocks, focus stretches with their starts (the same
 *  lengths, but stretches soon after an Unlock run shorter), and Distraction
 *  spans (most or half of most Unlocks, none of some, now and then a few
 *  minutes outside one, and the late evenings): what "a break before a
 *  stretch" is read from. */
function breaksOf(d: DayTotal): Pick<DayTotal, "unlocks" | "timed_stretches" | "distraction_spans" | "stretches"> {
  // Unlocks: the Day's tears, the first at its first tear, the rest about two hours apart, before Curfew.
  const tears = d.tears ?? 0, unlocks: [number, number][] = [];
  const first = d.first_tear ? offsetOf(d.first_tear) : 360;
  for (let k = 0, from = first; k < tears; k++) {
    const vouchers = Math.floor(d.redeemed / tears) + (k < d.redeemed % tears ? 1 : 0);
    const to = Math.min(from + vouchers * 10, 960);
    if (to > from) unlocks.push([from, to]);
    from = to + 100 + Math.floor(hash(d.day, 80 + k) * 80);
  }
  // About three Unlocks in ten go unused, a quarter are used for half their time, the rest for most of it.
  const spans: [number, number][] = unlocks.flatMap(([a, b], k): [number, number][] => {
    const p = hash(d.day, 64 + k);
    return b - a <= 3 || p < 0.3 ? [] : [[a + 1, p < 0.55 ? a + Math.ceil((b - a) / 2) : b - 1]];
  });
  if (hash(d.day, 61) < 0.4) { const a = 120 + Math.floor(hash(d.day, 62) * 600); spans.push([a, a + 4]); }
  if (lateEvening(d.day)) spans.push([965, 990 + Math.floor(hash(d.day, 63) * 25)]);
  spans.sort((a, b) => a[0] - b[0]);
  const breaks = [...unlocks, ...spans];
  const near = (start: number) => breaks.some(([a, b]) => Math.min(b, start) - Math.max(a, start - 60) > 0);
  // Stretches: the longest never follows a break; about half the others start 5 to 35 minutes after an Unlock ends, shortened.
  const lengths = [...(d.stretches ?? [])], top = lengths.indexOf(Math.max(...lengths));
  const focus = Object.keys(d.by_source ?? {}).filter((id) => !["tasks", "workout", "steps"].includes(id));
  const placed: [number, number][] = [];
  const free = (a: number, b: number) => !placed.some(([x, y]) => a < y && x < b);
  const timed: TimedStretch[] = [];
  let used = 0;
  lengths.forEach((m, i) => {
    const source = focus[i % Math.max(1, focus.length)] ?? "reading";
    let start = -1;
    if (i !== top && unlocks.length && hash(d.day, 70 + i) < AFTER_BREAK_P) {
      const [, end] = unlocks[used++ % unlocks.length];
      const s = end + 5 + Math.floor(hash(d.day, 90 + i) * 30);
      if (s < 1380) { start = s; lengths[i] = m = Math.max(3, Math.round(m * AFTER_BREAK)); }
    }
    // Elsewhere: the first clear time from a hashed one, so the time of day alone doesn't give a break away.
    const from = 60 + Math.floor(hash(d.day, 100 + i) * 56) * 15;
    for (let k = 0; start < 0 && k < 88; k++) { const t = 60 + ((from - 60 + k * 15) % 1320); if (!near(t) && free(t, t + m)) start = t; }
    if (start < 0) return;
    placed.push([start, start + m]);
    timed.push({ start: at(d.day, start), minutes: m, source });
  });
  timed.sort((a, b) => a.start.localeCompare(b.start));
  const toIso = ([a, b]: [number, number]): [string, string] => [at(d.day, a), at(d.day, b)];
  return { stretches: lengths, timed_stretches: timed, unlocks: unlocks.map(toIso), distraction_spans: d.reported ? spans.map(toIso) : null };
}

/** A sample weekday's time blocks (none at the weekend): 2 to 5 of 30 to
 *  120 minutes between 08:30 and 22:00, about seven in ten done, and on about
 *  half the Days one or two that start just before an Unlock. Split as the
 *  Ledger splits them: Distraction spans first, then the timed stretches,
 *  the rest other (unknown on a Day no device reported), with the minutes
 *  an Unlock was open, and what they went to, over that. */
function plannedOf(d: DayTotal, b: ReturnType<typeof breaksOf>): PlannedBlock[] {
  if (weekday(d.day) === 0 || weekday(d.day) === 6) return [];
  const off = (iso: string) => Math.round((Date.parse(iso) - Date.parse(at(d.day, 0))) / 60_000);
  const lost = new Uint8Array(1440), open = new Uint8Array(1440), bySource = new Map<string, Uint8Array>();
  for (const [a, z] of b.distraction_spans ?? []) lost.fill(1, off(a), off(z));
  for (const [a, z] of b.unlocks ?? []) open.fill(1, off(a), off(z));
  for (const s of b.timed_stretches ?? []) {
    if (!bySource.has(s.source)) bySource.set(s.source, new Uint8Array(1440));
    bySource.get(s.source)!.fill(1, off(s.start), off(s.start) + s.minutes);
  }
  const placed: [number, number][] = [], unlockAt = (b.unlocks ?? []).map(([a]) => off(a));
  // Insights: the last four weeks' weekdays have a block from 14:00 to 15:30.
  if (back(d.day) >= 1 && back(d.day) <= 28) placed.push([480, 570]);
  for (let i = 0, n = 2 + Math.floor(hash(d.day, 120) * 4); i < n; i++) {
    const length = 30 + 15 * Math.floor(hash(d.day, 130 + i) * 7);
    let start = i < 2 && unlockAt[i] > 150 && hash(d.day, 121 + i) < 0.5 ? unlockAt[i] - 20 : 150 + 30 * Math.floor(hash(d.day, 140 + i) * 22);
    while (placed.some(([a, z]) => start < z && a < start + length)) start += 30;
    if (start + length <= 960) placed.push([start, start + length]);
  }
  return placed.sort((x, y) => x[0] - y[0]).map(([a, z], i) => {
    let sources = 0, distraction = 0, unlocked = 0, distraction_unlocked = 0, unlocked_sources = 0;
    const source_minutes: Record<string, number> = {};
    for (let m = a; m < z; m++) {
      if (open[m]) unlocked++;
      if (lost[m]) { distraction++; if (open[m]) distraction_unlocked++; continue; }
      let any = false;
      for (const [id, on] of bySource) if (on[m]) { source_minutes[id] = (source_minutes[id] ?? 0) + 1; any = true; }
      if (any) { sources++; if (open[m]) unlocked_sources++; }
    }
    const rest = z - a - sources - distraction, unlockedRest = unlocked - distraction_unlocked - unlocked_sources;
    const done = hash(d.day, 150 + i) < 0.7 ? a + Math.max(5, z - a + Math.round((hash(d.day, 160 + i) - 0.6) * 50)) : null;
    const hours = d.source_hours?.tasks ?? [];
    return { start: at(d.day, a), minutes: z - a, done_at: done === null ? null : at(d.day, done), service: "todoist",
      split: { sources, distraction, other: d.reported ? rest : 0, unknown: d.reported ? 0 : rest, unlocked, distraction_unlocked, unlocked_sources,
        unlocked_other: d.reported ? unlockedRest : 0, unlocked_unknown: d.reported ? 0 : unlockedRest }, source_minutes,
      task_vouchers: hours.reduce((t, k, h) => t + ((h * 60 - 360 >= a && h * 60 - 360 < z) ? k : 0), 0) };
  });
}

/** Sample Days with their sleep and calendar load, and (history Days)
 *  their Unlocks, timed stretches, Distraction spans, and time blocks. */
export function withMeasures<T extends DayTotal | DaySummary>(days: T[]): T[] {
  return days.map((d) => {
    const sleep = sampleSleep(d.day), calendar = sampleCalendar(d.day);
    const shaped = "stretches" in d ? forInsights(d as DayTotal) : null;
    const breaks = shaped ? lateSpans(shaped, breaksOf(shaped)) : null;
    const extra = breaks ? { ...breaks, planned: plannedOf(shaped!, breaks) } : {};
    return { ...d, ...(shaped ?? {}), ...extra, sleep, calendar } as T;
  });
}

/** A history Day shaped so Insights finds something of every kind. */
function forInsights(d: DayTotal): DayTotal {
  const n = back(d.day);
  if (n < 1) return d;
  const out: DayTotal = { ...d, used: { ...d.used }, by_source: { ...d.by_source }, hours: [...(d.hours ?? [])], source_hours: { ...d.source_hours } };
  // This week: more YouTube, in the evening (lateSpans times it).
  if (n <= 7 && d.reported) out.used!.YouTube = (out.used!.YouTube ?? 0) + 30 + Math.floor(hash(d.day, 170) * 20);
  // A site on no blocklist, most Days of the last two weeks.
  if (n <= 14 && d.reported && hash(d.day, 171) < 0.72) out.used!["news.ycombinator.com"] = 6 + Math.floor(hash(d.day, 172) * 14);
  // A record six Days ago: 23 Vouchers.
  if (n === 6) {
    const more = 23 - d.earned;
    out.earned = 23; out.goal_met = true;
    out.by_source!.tasks = (out.by_source!.tasks ?? 0) + more;
    out.hours![15] = (out.hours![15] ?? 0) + more;
    out.source_hours!.tasks = (out.source_hours!.tasks ?? Array<number>(24).fill(0)).map((x, h) => (h === 15 ? x + more : x));
  }
  // Then a lapse: the five Days since miss the goal.
  if (n <= 5 && d.earned >= (d.goal ?? 16)) {
    const less = d.earned - (9 + n);
    out.earned -= less; out.goal_met = false;
    let left = less;
    for (const id of ["tasks", "obsidian", "reading", "chinese", "workout"]) {
      const take = Math.min(left, out.by_source![id] ?? 0);
      if (!take) continue;
      out.by_source![id] -= take; left -= take;
      if (!out.by_source![id]) delete out.by_source![id];
    }
    let drop = less;
    for (let h = 23; h >= 0 && drop > 0; h--) { const t = Math.min(drop, out.hours![h]); out.hours![h] -= t; drop -= t; }
  }
  return out;
}

/** This week's evenings: Distraction from about 21:05 to 21:40. The last four
 *  weeks' weekdays: most have Distraction from 14:25 to 14:55, in the
 *  planned block then. */
function lateSpans(d: DayTotal, b: ReturnType<typeof breaksOf>): ReturnType<typeof breaksOf> {
  const n = back(d.day);
  if (!b.distraction_spans) return b;
  const spans = [...b.distraction_spans];
  if (n >= 1 && n <= 7) { const a = 905 + Math.floor(hash(d.day, 173) * 10); spans.push([at(d.day, a), at(d.day, a + 30 + Math.floor(hash(d.day, 174) * 10))]); }
  if (n >= 1 && n <= 28 && weekday(d.day) % 6 !== 0 && hash(d.day, 175) < 0.75) spans.push([at(d.day, 505), at(d.day, 535)]);
  spans.sort((x, y) => x[0].localeCompare(y[0]));
  return { ...b, distraction_spans: spans };
}

// ---- Insights: the Ledger's dismissals and Experiments ----

/** An Experiment started 09-12, due for its verdict since 09-29: the app works
 *  the verdict out and sends it, and it waits for Keep it or Go back. With
 *  `?experiment=running`, one started 10-03 is on its 2nd measured Day
 *  instead; with `?experiment=none`, there's neither. */
function sampleInsights(): InsightsState {
  const which = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("experiment");
  const due = {
    id: 1, change: { UnlockMinutes: 10 }, undo: { UnlockMinutes: 15 }, text: "Unlocks of 10 min", measure: "unlocks" as const, finding: "shift:per_unlock",
    requested_at: "2026-09-12T09:30:00-07:00", starts_at: "2026-09-12T09:30:00-07:00", start_day: "2026-09-12", settle_days: 3, measure_days: 14,
    verdict_day: "2026-09-29", marker_at: "2026-09-12T09:30:00-07:00", status: "running" as const, verdict: null, ended_at: null,
  };
  const running = {
    id: 2, change: { Curfew: { start: "21:30:00", end: "06:00:00" } }, undo: { Curfew: { start: "22:00:00", end: "06:00:00" } }, text: "Curfew at 21:30", measure: "late" as const, finding: "shift:late",
    requested_at: "2026-10-01T20:10:00-07:00", starts_at: "2026-10-01T20:10:00-07:00", start_day: "2026-10-01", settle_days: 3, measure_days: 14,
    verdict_day: "2026-10-18", marker_at: "2026-10-01T20:10:00-07:00", status: "running" as const, verdict: null, ended_at: null,
  };
  return { dismissed: {}, experiments: which === "none" ? [] : which === "running" ? [{ ...due, status: "kept" }, running] : [due] };
}
let insights: InsightsState | null = null;
const insightsNow = () => (insights ??= sampleInsights());
/** The Experiments /status lists: running, or judged and waiting. */
export const sampleOpenExperiments = () => insightsNow().experiments.filter((e) => e.status === "running" || e.status === "ready");
/** The sample's Markers for its Experiments, for /markers. */
export const sampleExperimentMarkers = () => insightsNow().experiments.flatMap((e) => (e.marker_at ? [{ at: e.marker_at, text: `Trying ${e.text}`, rule: true }] : []));

/** The sample Ledger's Insights routes, or undefined for any other. */
function insightsRoute(method: string, route: string, body: unknown): unknown {
  const st = insightsNow();
  if (route === "/insights" && method === "GET") return st;
  if (route === "/insights/dismiss" && method === "POST") {
    const b = body as { id: string; kind: string; value: number };
    st.dismissed = { ...st.dismissed, [b.id]: { at: new Date().toISOString(), kind: b.kind, value: b.value } };
    return st.dismissed;
  }
  if (route === "/insights/undismiss" && method === "POST") {
    const { [(body as { id: string }).id]: _, ...rest } = st.dismissed;
    st.dismissed = rest;
    return st.dismissed;
  }
  if (route === "/experiment" && method === "POST") {
    const b = body as { change: Record<string, unknown>; text: string; measure: string; finding: string };
    if (st.experiments.some((e) => e.status === "running")) throw new Error("The Ledger refused this (409)");
    const now = new Date(), day = SAMPLE_TODAY;
    const shift = (n: number) => new Date(Date.parse(`${day}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
    const tightens = !("DailyGoal" in b.change);
    const e = {
      id: Math.max(0, ...st.experiments.map((x) => x.id)) + 1, change: b.change, undo: {}, text: b.text, measure: b.measure as InsightsState["experiments"][number]["measure"], finding: b.finding,
      requested_at: now.toISOString(), starts_at: now.toISOString(), start_day: tightens ? day : shift(1), settle_days: 3, measure_days: 14,
      verdict_day: shift((tightens ? 0 : 1) + 17), marker_at: tightens ? now.toISOString() : null, status: "running" as const, verdict: null, ended_at: null,
    };
    st.experiments = [...st.experiments, e];
    return e;
  }
  if (route === "/experiment/verdict" && method === "POST") {
    const b = body as { id: number; title: string; text: string; outcome: "helped" | "unclear" | "worse"; back: string };
    st.experiments = st.experiments.map((e) => (e.id === b.id && e.status === "running" ? { ...e, status: "ready", verdict: { title: b.title, text: b.text, outcome: b.outcome, back: b.back, at: new Date().toISOString() } } : e));
    return st.experiments.find((e) => e.id === b.id);
  }
  if (route === "/experiment/end" && method === "POST") {
    const b = body as { id: number; keep: boolean };
    st.experiments = st.experiments.map((e) => (e.id !== b.id ? e : { ...e, status: b.keep ? "kept" : e.status === "ready" ? "reverted" : "ended", ended_at: new Date().toISOString() }));
    return { experiment: st.experiments.find((e) => e.id === b.id), effect: b.keep ? "Now" : { At: new Date(Date.now() + 86_400_000).toISOString() } };
  }
  return undefined;
}

/** The calendars on the sample Android device (`?calendars=pick`). */
export function sampleDeviceCalendars(): CalendarId[] {
  return [
    { account: "you@example.com", name: "you@example.com", color: "#4285f4" },
    { account: "you@example.com", name: "Classes", color: "#0b8043" },
    { account: "you@example.com", name: "Habits", color: "#f6bf26" },
    { account: "you@example.com", name: "Holidays in United States", color: "#7986cb" },
    { account: "you@work.example", name: "you@work.example", color: "#039be5" },
    { account: "you@work.example", name: "Work Synced", color: "#8e24aa" },
    { account: "you@school.example", name: "you@school.example", color: "#d81b60" },
  ];
}

/** The sample Ledger's calendar choice: made on the phone, so the preview's own device ("sample-phone") isn't the reporter. */
let choice: CalendarChoice = {
  device: "SM-S928U-4f2a",
  calendars: [sampleDeviceCalendars()[0], sampleDeviceCalendars()[1], sampleDeviceCalendars()[4]],
};
export const sampleCalendarChoice = () => choice;

/** The sample Ledger's answers for the new routes, or undefined for any other. */
export function measuresRoute(method: string, route: string, body: unknown): unknown {
  const insight = insightsRoute(method, route, body);
  if (insight !== undefined) return insight;
  if (route === "/sleep" && method === "POST") return { message: "kept" };
  if (route === "/calendar" && method === "POST") return { days: 0 };
  if (route === "/calendars" && method === "GET") return choice;
  if (route === "/calendars" && method === "POST") {
    const b = body as CalendarChoice & { device: string };
    choice = { device: b.device, calendars: b.calendars };
    return choice;
  }
  return undefined;
}
