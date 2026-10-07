// Sample Ledger replies for design checks in a plain browser, where there is
// no Tauri and no Ledger. Mirrors the round 4 canvas with neutral task names.
import type { Blocklist, DaySummary, DayTotal, Entry } from "./types";

const app = (pkg: string, label: string, note: string | null = null, added = false) =>
  ({ package: pkg, label, note, on: true, added });
const site = (s: string, note: string | null = null, added = false) => ({ site: s, note, on: true, added });

const TODAY = "2026-10-07";

const earned = (time: string, task: string, title: string, day = TODAY): Entry =>
  ({ kind: "earned", at: `${day}T${time}:00-07:00`, task, title, kept: true });
const redeemed = (time: string, tickets: number, day = TODAY): Entry =>
  ({ kind: "redeemed", at: `${day}T${time}:00-07:00`, tickets, minutes: tickets * 10 });

const days: Record<string, DaySummary> = {
  [TODAY]: {
    day: TODAY, earned: 11, redeemed: 3, unlocked_minutes: 30, goal: 16, goal_met: false, goal_met_at: null,
    streak: 4, by_source: { todoist: 7, obsidian: 2, workout: 1, readwise: 1 }, sources: [],
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
      earned("07:20", "todoist:6", "Water the plants"),
    ],
  },
  "2026-10-06": {
    day: "2026-10-06", earned: new URLSearchParams(location.search).get("state") === "streaklost" ? 9 : 17, redeemed: 4, unlocked_minutes: 40, goal: 16, goal_met: new URLSearchParams(location.search).get("state") !== "streaklost",
    goal_met_at: "2026-10-06T17:30:00-07:00", streak: 4, by_source: { todoist: 11, obsidian: 3, workout: 1, readwise: 1, moonreader: 1 }, sources: [],
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
    streak: 4, by_source: {}, log: [], sources: [] };
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
  sources: {
    todoist: { kind: "tasks", on: true, every: 1, packages: [] },
    clickup: { kind: "tasks", on: true, every: 1, packages: [] },
    workout: { kind: "workout", on: true, every: 15, packages: [] },
    obsidian: { kind: "focus", on: true, every: 30, packages: ["md.obsidian"] },
    readwise: { kind: "focus", on: true, every: 30, packages: ["com.readermobile"] },
    moonreader: { kind: "focus", on: true, every: 30, packages: ["com.flyersoft.moonreaderp"] },
    anki: { kind: "focus", on: false, every: 30, packages: ["com.ichi2.anki"] },
  } as Record<string, { kind: "tasks" | "workout" | "focus"; on: boolean; every: number; packages: string[] }>,
  blocklists: {
    instagram: { name: "Instagram", color: "#e5609b", premade: true, on: true,
      apps: [app("com.instagram.android", "Instagram")], sites: [site("instagram.com", "All subdomains")] },
    youtube: { name: "YouTube", color: "#ff6b5b", premade: true, on: true,
      apps: [app("com.google.android.youtube", "YouTube"), app("org.schabi.newpipe", "NewPipe", "Alternative viewer"),
        app("com.github.libretube", "LibreTube", "Alternative viewer")],
      sites: [site("youtube.com", "All subdomains"), site("youtu.be"),
        site("list:invidious", "Known public instances, kept up to date"), site("list:piped", "Known public instances, kept up to date")] },
    reddit: { name: "Reddit", color: "#ff8a3d", premade: true, on: true,
      apps: [app("com.reddit.frontpage", "Reddit")], sites: [site("reddit.com", "All subdomains")] },
    games: { name: "Games", color: "#7d8cff", premade: false, on: true,
      apps: [app("com.example.chess", "Chess", null, true), app("com.example.puzzle", "Puzzle", null, true),
        app("com.example.cards", "Cards", null, true), app("com.example.words", "Words", null, true)], sites: [] },
  } as Record<string, Blocklist>,
  released_devices: [] as string[],
};
/** The next 06:00 in Los Angeles (13:00 UTC while on daylight time). */
function nextMorning(): string {
  const d = new Date();
  d.setUTCHours(13, 0, 0, 0);
  if (d.getTime() <= Date.now()) d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString();
}
let pending: [Record<string, unknown>, string][] = [[{ UnlockMinutes: 15 }, nextMorning()]];

export function sampleLedger(method: string, path: string, body: unknown): unknown {
  const [route, query = ""] = path.split("?");
  const params = new URLSearchParams(query);
  if (route === "/status") {
    const expired = new URLSearchParams(location.search).get("expired");
    return { bank: 9, curfew_active: false, unlock: null, settings, pending, today: days[TODAY],
      source_errors: expired ? { [expired]: "sign-in expired" } : {},
      setup_complete: !new URLSearchParams(location.search).get("fresh"),
      blocked: { apps: [], sites: [] } };
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
  if (route === "/setup") return sampleLedger("GET", "/status", null);
  if (route === "/token") return { message: "saved; it is used from the next check" };
  if (route === "/change" && method === "POST") {
    pending = [...pending, [body as Record<string, unknown>, nextMorning()]];
    return { At: nextMorning() };
  }
  throw new Error(`no sample for ${method} ${path}`);
}
