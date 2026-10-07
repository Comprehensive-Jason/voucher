// Sample Ledger replies for design checks in a plain browser, where there is
// no Tauri and no Ledger. Mirrors the round 4 canvas with neutral task names.
import type { DaySummary, DayTotal, Entry } from "./types";

const TODAY = "2026-10-07";

const earned = (time: string, task: string, title: string, day = TODAY): Entry =>
  ({ kind: "earned", at: `${day}T${time}:00-07:00`, task, title, kept: true });
const redeemed = (time: string, tickets: number, day = TODAY): Entry =>
  ({ kind: "redeemed", at: `${day}T${time}:00-07:00`, tickets, minutes: tickets * 10 });

const days: Record<string, DaySummary> = {
  [TODAY]: {
    day: TODAY, earned: 11, redeemed: 3, unlocked_minutes: 30, goal: 16, goal_met: false, goal_met_at: null,
    streak: 4, by_source: { todoist: 7, obsidian: 2, workout: 1, readwise: 1 },
    log: [
      redeemed("19:42", 2),
      earned("16:40", "todoist:1", "Weekly review"),
      earned("15:50", "readwise:1", "30 min focused"),
      earned("15:20", "obsidian:2", "30 min focused"),
      earned("14:40", "workout:1", "Fitbod upper body"),
      earned("13:05", "clickup:1", "Draft the budget"),
      redeemed("12:10", 1),
      earned("11:32", "todoist:2", "Finish the problem set"),
      earned("11:05", "todoist:3", "Reply to the landlord"),
      earned("09:40", "obsidian:1", "30 min focused"),
      earned("08:30", "todoist:4", "Stretch 10 min"),
      earned("08:10", "todoist:5", "Make bed"),
      earned("07:20", "todoist:6", "Take medication"),
    ],
  },
  "2026-10-06": {
    day: "2026-10-06", earned: 17, redeemed: 4, unlocked_minutes: 40, goal: 16, goal_met: true,
    goal_met_at: "2026-10-06T17:30:00-07:00", streak: 4, by_source: { todoist: 11, obsidian: 3, workout: 1, readwise: 1, moonreader: 1 },
    log: [
      redeemed("21:10", 1, "2026-10-06"),
      earned("19:05", "obsidian:3", "30 min focused", "2026-10-06"),
      earned("17:30", "todoist:7", "Submit lab report", "2026-10-06"),
      redeemed("16:15", 2, "2026-10-06"),
      earned("15:00", "workout:2", "Fitbod legs", "2026-10-06"),
      earned("13:40", "readwise:2", "30 min focused", "2026-10-06"),
      redeemed("12:20", 1, "2026-10-06"),
      earned("11:10", "todoist:8", "Clean the kitchen", "2026-10-06"),
      earned("10:05", "moonreader:1", "30 min focused", "2026-10-06"),
      earned("09:00", "todoist:9", "Plan the week", "2026-10-06"),
      earned("08:10", "todoist:10", "Make bed", "2026-10-06"),
    ],
  },
};

function blankDay(day: string): DaySummary {
  return { day, earned: 16, redeemed: 6, unlocked_minutes: 60, goal: 16, goal_met: true, goal_met_at: null,
    streak: 3, by_source: {}, log: [] };
}

function history(n: number): DayTotal[] {
  const out: DayTotal[] = [];
  const end = new Date(`${TODAY}T12:00:00Z`);
  // A fixed pseudo-random pattern, so screenshots are stable.
  let seed = 7;
  for (let back = n - 1; back >= 0; back--) {
    const d = new Date(end.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    seed = (seed * 9301 + 49297) % 233280;
    const earned = back === 0 ? 11 : Math.floor((seed / 233280) * 22);
    out.push({ day: d, earned, redeemed: Math.floor(earned / 3), goal_met: earned >= 16 });
  }
  return out;
}

const settings = {
  time_zone: "America/Los_Angeles", bank_limit: 24, unlock_minutes: 10,
  curfew_start: "22:00:00", curfew_end: "06:00:00", morning_boundary: "06:00:00", daily_goal: 16,
};
let pending: [Record<string, unknown>, string][] = [[{ UnlockMinutes: 15 }, "2026-10-08T13:00:00Z"]];

export function sampleLedger(method: string, path: string, body: unknown): unknown {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (route === "/status") {
    return { bank: 9, curfew_active: false, unlock: null, settings, pending, today: days[TODAY] };
  }
  if (route === "/day") {
    const d = params.get("date") ?? TODAY;
    return days[d] ?? blankDay(d);
  }
  if (route === "/history") return history(Number(params.get("days") ?? 84));
  if (route === "/cancel") {
    pending = pending.filter((_, i) => i !== Number(params.get("index")));
    return sampleLedger("GET", "/status", null);
  }
  if (route === "/change" && method === "POST") {
    pending = [...pending, [body as Record<string, unknown>, "2026-10-08T13:00:00Z"]];
    return { At: "2026-10-08T13:00:00Z" };
  }
  throw new Error(`no sample for ${method} ${path}`);
}
