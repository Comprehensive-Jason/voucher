// Sample sleep, calendar load, and energy for the browser preview, added to
// lib/sample.ts's Days (and so to `?history=N`). A hash of each date picks
// its figures, so any span agrees and screenshots are stable. Like the
// Ledger: nights are later and longer at the weekend, about one in seven is
// estimated (no Health Connect session), weekdays carry most meetings, and
// energy loosely follows the night before.
import type { CalendarChoice, CalendarDay, CalendarId, DaySummary, DayTotal, Energy, Sleep } from "./types";

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

/** The night ending on `day`'s morning, or null for one with no data at all. */
export function sampleSleep(day: string): Sleep | null {
  if (hash(day, 1) < 0.04) return null;
  // Friday and Saturday nights (waking Saturday and Sunday) run later and longer.
  const weekend = weekday(day) === 6 || weekday(day) === 0;
  const bed = (weekend ? 50 : -15) + Math.round((hash(day, 2) - 0.5) * 90);
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
  const busy_hours = Array<number>(24).fill(0), meeting_hours = Array<number>(24).fill(0);
  for (const [a] of list) meeting_hours[Math.floor(a / 60) % 24]++;
  for (const [a, b] of merged) for (let m = a; m < b; m++) busy_hours[Math.floor(m / 60) % 24]++;
  return {
    meetings: list.length, busy_minutes: merged.reduce((t, [a, b]) => t + b - a, 0), busy_hours, meeting_hours,
    busy: merged.map(([a, b]) => [local(day, a), local(day, b)]),
  };
}

/** The Day's energy answer: about four Days in five, higher after a longer night. */
export function sampleEnergy(day: string, sleep: Sleep | null): Energy | null {
  if (hash(day, 50) < 0.2) return null;
  const rested = sleep ? (sleep.asleep - 420) / 70 : 0;
  return Math.max(1, Math.min(5, Math.round(3 + rested + (hash(day, 51) - 0.5) * 2.2))) as Energy;
}

/** Sample Days with their sleep, calendar load, and energy. Today has no energy answer yet. */
export function withMeasures<T extends DayTotal | DaySummary>(days: T[], today: string): T[] {
  return days.map((d) => {
    const sleep = sampleSleep(d.day);
    return { ...d, sleep, calendar: sampleCalendar(d.day), energy: d.day === today ? null : sampleEnergy(d.day, sleep) };
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
