// Sample sleep, calendar load, and energy for the browser preview, added to
// lib/sample.ts's Days (and so to `?history=N`). A hash of each date picks
// its figures, so any span agrees and screenshots are stable. Like the
// Ledger: nights are later and longer at the weekend, about one in seven is
// estimated (no Health Connect session), weekdays carry most events, and
// energy loosely follows the night before. Also each Day's Unlocks, focus
// stretches with their starts, and Distraction spans, fitted to sample.ts's
// tears and stretch lengths.
//
// Links for What goes with a good Day to find: Distraction after 22:00 on
// about three evenings in ten pushes that night's bedtime later (so a
// shorter night, and lower energy the Day after); a busy calendar lowers
// that Day's energy; and about half the stretches that aren't the Day's
// longest start soon after an Unlock (with Distraction in it) and run
// shorter than the rest.
import type { CalendarChoice, CalendarDay, CalendarId, DaySummary, DayTotal, Energy, PlannedBlock, Sleep, TimedStretch } from "./types";

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
const LATE_P = 0.3, LATE_BED = 135, BUSY_ENERGY = 1.2, AFTER_BREAK_P = 0.5, AFTER_BREAK = 0.6;

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

/** The Day's energy answer: about four Days in five, higher after a longer night, lower on a busy Day. */
export function sampleEnergy(day: string, sleep: Sleep | null, busyMinutes = 0): Energy | null {
  if (hash(day, 50) < 0.2) return null;
  const rested = sleep ? (sleep.asleep - 420) / 70 : 0;
  const busy = busyMinutes >= 240 ? BUSY_ENERGY : 0;
  return Math.max(1, Math.min(5, Math.round(3 + rested - busy + (hash(day, 51) - 0.5) * 2.2))) as Energy;
}

/** Minutes after the Day began (06:00) as a moment. */
const at = (day: string, offset: number) => local(day, 360 + offset);
/** Minutes after the Day began of a sample moment such as "2026-10-07T12:10:00-07:00". */
const offsetOf = (iso: string) => Number(iso.slice(11, 13)) * 60 + Number(iso.slice(14, 16)) - 360;

/** A sample Day's Unlocks, focus stretches with their starts (the same
 *  lengths, but stretches soon after an Unlock run shorter), and Distraction
 *  spans (most of each Unlock, now and then a few minutes outside one, and
 *  the late evenings): what "a break before a stretch" is read from. */
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
  const spans: [number, number][] = unlocks.filter(([a, b]) => b - a > 3).map(([a, b]) => [a + 1, b - 1]);
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
 *  two Days in five one that starts just before the Day's first Unlock. Split
 *  as the Ledger splits them: Distraction and Unlocks first, then the timed
 *  stretches, the rest other (unknown on a Day no device reported). */
function plannedOf(d: DayTotal, b: ReturnType<typeof breaksOf>): PlannedBlock[] {
  if (weekday(d.day) === 0 || weekday(d.day) === 6) return [];
  const off = (iso: string) => Math.round((Date.parse(iso) - Date.parse(at(d.day, 0))) / 60_000);
  const lost = new Uint8Array(1440), bySource = new Map<string, Uint8Array>();
  for (const [a, z] of [...(b.distraction_spans ?? []), ...(b.unlocks ?? [])]) lost.fill(1, off(a), off(z));
  for (const s of b.timed_stretches ?? []) {
    if (!bySource.has(s.source)) bySource.set(s.source, new Uint8Array(1440));
    bySource.get(s.source)!.fill(1, off(s.start), off(s.start) + s.minutes);
  }
  const placed: [number, number][] = [], firstUnlock = b.unlocks?.[0] ? off(b.unlocks[0][0]) : -1;
  for (let i = 0, n = 2 + Math.floor(hash(d.day, 120) * 4); i < n; i++) {
    const length = 30 + 15 * Math.floor(hash(d.day, 130 + i) * 7);
    let start = i === 0 && firstUnlock > 150 && hash(d.day, 121) < 0.4 ? firstUnlock - 20 : 150 + 30 * Math.floor(hash(d.day, 140 + i) * 22);
    while (placed.some(([a, z]) => start < z && a < start + length)) start += 30;
    if (start + length <= 960) placed.push([start, start + length]);
  }
  return placed.sort((x, y) => x[0] - y[0]).map(([a, z], i) => {
    let sources = 0, distraction = 0;
    const source_minutes: Record<string, number> = {};
    for (let m = a; m < z; m++) {
      if (lost[m]) { distraction++; continue; }
      let any = false;
      for (const [id, on] of bySource) if (on[m]) { source_minutes[id] = (source_minutes[id] ?? 0) + 1; any = true; }
      if (any) sources++;
    }
    const rest = z - a - sources - distraction;
    const done = hash(d.day, 150 + i) < 0.7 ? a + Math.max(5, z - a + Math.round((hash(d.day, 160 + i) - 0.6) * 50)) : null;
    const hours = d.source_hours?.tasks ?? [];
    return { start: at(d.day, a), minutes: z - a, done_at: done === null ? null : at(d.day, done), service: "todoist",
      split: { sources, distraction, other: d.reported ? rest : 0, unknown: d.reported ? 0 : rest }, source_minutes,
      task_vouchers: hours.reduce((t, k, h) => t + ((h * 60 - 360 >= a && h * 60 - 360 < z) ? k : 0), 0) };
  });
}

/** Sample Days with their sleep, calendar load, and energy, and (history
 *  Days) their Unlocks, timed stretches, Distraction spans, and time blocks.
 *  Today has no energy answer yet. */
export function withMeasures<T extends DayTotal | DaySummary>(days: T[], today: string): T[] {
  return days.map((d) => {
    const sleep = sampleSleep(d.day), calendar = sampleCalendar(d.day);
    const breaks = "stretches" in d ? breaksOf(d) : null;
    const extra = breaks ? { ...breaks, planned: plannedOf(d as DayTotal, breaks) } : {};
    return { ...d, ...extra, sleep, calendar, energy: d.day === today ? null : sampleEnergy(d.day, sleep, calendar.busy_minutes) };
  });
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
  if (route === "/energy" && method === "POST") return { message: "kept" };
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
