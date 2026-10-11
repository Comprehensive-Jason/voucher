// Sample Ledger replies for design checks in a plain browser, where there is
// no Tauri and no Ledger. Mirrors the round 4 canvas with neutral task names.
import type { Blocklist, DaySummary, DayTotal, Entry, Source } from "./types";
import { measuresRoute, sampleCalendarChoice, withMeasures } from "./sampleExtra";

const app = (pkg: string, label: string, note: string | null = null, added = false) =>
  ({ package: pkg, label, note, on: true, added });
const site = (s: string, note: string | null = null, added = false) => ({ site: s, note, on: true, added });

const TODAY = "2026-10-07";

const earned = (time: string, task: string, title: string, day = TODAY): Entry =>
  ({ kind: "earned", at: `${day}T${time}:00-07:00`, task, title, kept: true });
const redeemed = (time: string, vouchers: number, day = TODAY): Entry =>
  ({ kind: "redeemed", at: `${day}T${time}:00-07:00`, tickets: vouchers, minutes: vouchers * 10 });

/** Minutes per clock hour for each app, from [hour, minutes] pairs. */
const usage = (apps: Record<string, [number, number][]>): Record<string, number[]> =>
  Object.fromEntries(Object.entries(apps).map(([app, pairs]) => {
    const hours = Array<number>(24).fill(0);
    for (const [h, m] of pairs) hours[h] = m;
    return [app, hours];
  }));

const days: Record<string, DaySummary> = {
  [TODAY]: {
    day: TODAY, earned: 11, redeemed: 3, unlocked_minutes: 30, goal: 16, goal_met: false, goal_met_at: null,
    streak: 4, by_source: { tasks: 7, obsidian: 2, workout: 1, reading: 1 }, sources: [],
    usage: usage({ Instagram: [[8, 6], [12, 9], [13, 4], [19, 12]], YouTube: [[12, 3], [20, 14]], "youtube.com": [[15, 7], [22, 4]], Reddit: [[16, 5]], "reddit.com": [[10, 3]], Chess: [[21, 8]] }),
    log: [
      redeemed("19:42", 2),
      earned("16:40", "todoist:1", "Weekly review"),
      earned("15:50", "reading:1", "30 min focused"),
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
    goal_met_at: "2026-10-06T17:30:00-07:00", streak: 4, by_source: { tasks: 11, obsidian: 3, workout: 1, reading: 2 }, sources: [],
    usage: usage({ Instagram: [[9, 4], [12, 10], [16, 8], [21, 9]], YouTube: [[16, 12], [21, 6]], Reddit: [[12, 6]], Words: [[13, 5]] }),
    log: [
      redeemed("21:10", 1, "2026-10-06"),
      earned("19:05", "obsidian:3", "30 min focused", "2026-10-06"),
      earned("17:30", "todoist:7", "Submit lab report", "2026-10-06"),
      redeemed("16:15", 2, "2026-10-06"),
      earned("15:00", "workout:2", "Fitbod legs", "2026-10-06"),
      earned("13:40", "reading:2", "30 min focused", "2026-10-06"),
      redeemed("12:20", 1, "2026-10-06"),
      earned("11:10", "todoist:8", "Clean the kitchen", "2026-10-06"),
      earned("10:05", "chinese:1", "30 min focused", "2026-10-06"),
      earned("09:00", "todoist:9", "Plan the week", "2026-10-06"),
      earned("08:10", "todoist:10", "Make bed", "2026-10-06"),
    ],
  },
};

/** Sample Markers: one by hand, two from rule changes. */
let markers = [
  { at: "2026-08-24T09:00:00-07:00", text: "Fall term starts", rule: false },
  { at: "2026-09-14T10:12:00-07:00", text: "Daily goal 16", rule: true },
  { at: "2026-10-02T21:30:00-07:00", text: "Instagram blocked in Social; Curfew 22:00 to 06:00", rule: true },
];

function blankDay(day: string): DaySummary {
  return { day, earned: 16, redeemed: 6, unlocked_minutes: 60, goal: 16, goal_met: true, goal_met_at: null,
    streak: 4, by_source: {}, log: [], sources: [] };
}

// How strongly the sample's good-Day links show (see history).
const LIFT_MIN = 12, LIFT_SHARE = 0.12, LIFT_MID = 2, LONG_P = 0.3, LONG_MIN = 75;

function history(n: number): DayTotal[] {
  const out: DayTotal[] = [];
  const end = new Date(`${TODAY}T12:00:00Z`);
  // A fixed pseudo-random pattern, so screenshots are stable.
  let seed = 7;
  let afterWorkout = false;
  /** Yesterday's Vouchers by source, and whether it was busy (9 or more earned). */
  let yesterday: Record<string, number> = {}, afterBusy = false;
  for (let back = n - 1; back >= 0; back--) {
    const d = new Date(end.getTime() - back * 86_400_000).toISOString().slice(0, 10);
    seed = (seed * 9301 + 49297) % 233280;
    const earned = back === 0 ? 11 : Math.floor((seed / 233280) * 22);
    // A plausible split by source, for the Week and Month views. Each source
    // keeps its own Days (a hash of the date, so any span agrees), with a few
    // links for What goes with a good Day to find: Chinese and Reading come
    // more often the Day after a Workout, Obsidian mostly on busy Days, and
    // Tasks take what's left.
    const dn = Math.round(Date.parse(`${d}T12:00:00Z`) / 86_400_000);
    const h = (salt: number) => {
      let x = Math.imul(dn ^ Math.imul(salt, 0x9e3779b9), 0x85ebca6b);
      x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
      return ((x ^ (x >>> 16)) >>> 0) / 4294967296;
    };
    const want: [string, number][] = [
      ["workout", h(1) < 0.42 ? 1 + (h(2) < 0.3 ? 1 : 0) : 0],
      ["chinese", h(3) < (afterWorkout ? 0.85 : 0.35) ? 1 + Math.floor(h(4) * 3) : 0],
      ["reading", h(5) < 0.6 ? 1 + Math.floor(h(6) * 2) + (afterWorkout ? 1 : 0) : 0],
      ["obsidian", h(7) < (earned >= 9 ? 0.75 : 0.2) ? 1 + Math.floor(h(8) * 3) : 0],
    ];
    const by_source: Record<string, number> = {};
    let left = earned;
    for (const [id, want_] of want) { const n = Math.min(left, want_); if (n) by_source[id] = n; left -= n; }
    if (left) by_source.tasks = left;
    afterWorkout = !!by_source.workout;
    // Distraction minutes that drift down as earning climbs, around what was unlocked.
    const unlocked = Math.floor(earned / 3) * 10;
    const spent = Math.max(0, unlocked + ((seed % 23) - 9));
    const used: Record<string, number> = {};
    if (spent) { used.Instagram = Math.round(spent * 0.45); used.YouTube = Math.round(spent * 0.3); used.Reddit = spent - used.Instagram - used.YouTube; }
    // Earnings spread over the hours, busiest mid-morning, and the first tear around midday.
    const hours = Array<number>(24).fill(0);
    for (let i = 0; i < earned; i++) hours[[8, 9, 10, 10, 11, 13, 14, 15, 16, 19, 20, 21][(i * 7 + seed) % 12]]++;
    const redeemed = Math.floor(earned / 3);
    const tearAt = 10 + ((seed >> 3) % 5), tearMin = (seed >> 5) % 60;
    const first_tear = redeemed ? `${d}T${String(tearAt).padStart(2, "0")}:${String(tearMin).padStart(2, "0")}:00-07:00` : null;
    // Each source keeps to its own hours: reading mornings, Chinese after lunch, Obsidian evenings.
    const home: Record<string, number[]> = { tasks: [9, 10, 11, 14, 15, 16], obsidian: [19, 20, 21], reading: [8, 9, 10], workout: [7, 17], chinese: [13, 14] };
    const source_hours: Record<string, number[]> = {};
    for (const [id, n] of Object.entries(by_source)) {
      const h = Array<number>(24).fill(0);
      for (let i = 0; i < n; i++) h[home[id]?.[(i + seed) % home[id].length] ?? 12]++;
      source_hours[id] = h;
    }
    // Focus stretches that lengthen over the half year, and blocked opens most
    // often walked away from. For What goes with a good Day: a Workout Day,
    // the Day after one, a busy Day, and the Day after a busy one each go with
    // a slightly longer longest stretch and a few more opens walked away
    // from; the Day after Reading now and then brings a long one.
    const grow = 1 - back / n;
    const lift = (by_source.workout ? 1 : 0) + (yesterday.workout ? 1 : 0) + (earned >= 9 ? 1 : 0) + (afterBusy ? 1 : 0);
    const stretches = Array.from({ length: 2 + (seed % 4) }, (_, i) => Math.round(8 + grow * 25 + ((seed >> (i + 2)) % 30)));
    const top = stretches.indexOf(Math.max(...stretches));
    stretches[top] = Math.max(5, stretches[top] + LIFT_MIN * (lift - LIFT_MID) + (yesterday.reading && h(11) < LONG_P ? LONG_MIN : 0));
    const opens = 3 + (seed % 9), walked = Math.min(opens, Math.round(opens * (0.5 + grow * 0.35 + LIFT_SHARE * (lift - LIFT_MID))));
    yesterday = by_source;
    afterBusy = earned >= 9;
    // Answers to the Curfew question on most Days, a few reasons, and a silent afternoon now and then.
    const verdict = seed % 5 === 0 ? null : earned >= 16 ? (seed % 7 === 0 ? "mostly" : "yes") : earned >= 10 ? (seed % 3 ? "mostly" : "yes") : "no";
    const reasons: [number, string][] = redeemed ? [[tearAt, ["bored", "avoiding a task", "tired", "anxious", "habit"][seed % 5]]] : [];
    const silent: Record<string, number[]> = {};
    if (seed % 11 === 0) { const h = Array<number>(24).fill(0); h[14] = 60; h[15] = 35; silent.phone = h; }
    const reported = back < 150;
    out.push({ day: d, earned, redeemed, goal_met: earned >= 16, by_source, unlocked_minutes: unlocked, used: reported ? used : {}, goal: 16, hours, first_tear, tears: redeemed ? Math.max(1, Math.round(redeemed / 2)) : 0, source_hours, stretches, opens, walked,
      reported, verdict: back === 0 ? null : verdict as DayTotal["verdict"], reasons, silent });
  }
  return out;
}

const settings = {
  time_zone: "America/Los_Angeles", bank_limit: 24, unlock_minutes: 10,
  curfew_start: "22:00:00", curfew_end: "06:00:00", morning_boundary: "06:00:00", daily_goal: 16,
  sources: {
    tasks: { name: "Tasks", kind: "tasks", on: true, every: 1, packages: ["todoist", "clickup"], labels: { todoist: "Todoist", clickup: "ClickUp" } },
    workout: { name: "Workout", kind: "workout", on: true, every: 15, packages: [] },
    obsidian: { name: "Obsidian", kind: "focus", on: true, every: 30, packages: ["md.obsidian", "win:Obsidian.exe"],
      labels: { "md.obsidian": "Obsidian", "win:Obsidian.exe": "Obsidian for Windows" } },
    reading: { name: "Reading", kind: "focus", on: true, every: 30, packages: ["com.readermobile", "com.flyersoft.moonreaderp", "com.shortform.app", "site:readwise.io"],
      labels: { "com.readermobile": "Readwise Reader", "com.flyersoft.moonreaderp": "Moon+ Reader Pro", "com.shortform.app": "Shortform", "site:readwise.io": "readwise.io" } },
    chinese: { name: "Chinese", kind: "focus", on: true, every: 30, packages: ["com.pleco.chinesesystem", "com.duolingo"], color: "#9be36d",
      labels: { "com.pleco.chinesesystem": "Pleco", "com.duolingo": "Duolingo" } },
    anki: { name: "Anki", kind: "focus", on: false, every: 30, packages: ["com.ichi2.anki"], labels: { "com.ichi2.anki": "AnkiDroid" } },
    steps: { name: "Steps", kind: "steps", on: true, every: 2000, packages: [] },
  } as Record<string, Source>,
  blocklists: {
    instagram: { name: "Instagram", color: "#e5609b", premade: true, on: true,
      apps: [app("com.instagram.android", "Instagram")], sites: [site("instagram.com", "All subdomains")] },
    youtube: { name: "YouTube", color: "#874c69", premade: true, on: true,
      apps: [app("com.google.android.youtube", "YouTube"), app("org.schabi.newpipe", "NewPipe", "Alternative viewer"),
        app("com.github.libretube", "LibreTube", "Alternative viewer")],
      sites: [site("youtube.com", "All subdomains"), site("youtu.be"),
        site("list:invidious", "Known public instances, kept up to date"), site("list:piped", "Known public instances, kept up to date")] },
    reddit: { name: "Reddit", color: "#e2781f", premade: true, on: true,
      apps: [app("com.reddit.frontpage", "Reddit")], sites: [site("reddit.com", "All subdomains")] },
    games: { name: "Games", color: "#d26ec1", premade: false, on: true,
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
  // Sleep and calendar load (lib/sampleExtra.ts).
  const measured = measuresRoute(method, route, body);
  if (measured !== undefined) return measured;
  if (route === "/status") {
    const expired = new URLSearchParams(location.search).get("expired");
    return { bank: 9, curfew_active: false, unlock: null, settings, pending, today: withMeasures([days[TODAY]])[0],
      source_errors: expired ? { [expired]: "sign-in expired" } : {},
      setup_complete: !new URLSearchParams(location.search).get("fresh"),
      first_day: "2026-06-29", log_first_day: "2026-10-01",
      grace_until: new URLSearchParams(location.search).get("grace") ? "2026-10-11T13:00:00Z" : null,
      blocked: { apps: [], sites: [] }, calendars: sampleCalendarChoice() };
  }
  if (route === "/day") {
    const d = params.get("date") ?? TODAY;
    return withMeasures([days[d] ?? blankDay(d)])[0];
  }
  // ?history=N in the page's address serves N Days whatever is asked: a short
  // one for empty states, a long one for What goes with a good Day.
  if (route === "/history") return withMeasures(history(Number(new URLSearchParams(location.search).get("history") ?? params.get("days") ?? 84)));
  if (route === "/markers") return markers;
  if (route === "/marker" && method === "POST") {
    const b = body as { text: string; at?: string };
    markers = [...markers, { at: b.at ?? new Date().toISOString(), text: b.text, rule: false }].sort((a, c) => a.at.localeCompare(c.at));
    return markers.at(-1);
  }
  if (route === "/marker/remove") { markers = markers.filter((m) => m.rule || m.at !== params.get("at")); return markers; }
  if (route === "/verdict" || route === "/reason") return { message: "kept" };
  if (route === "/export/days.csv") return "day,goal,earned\n2026-10-07,16,11\n";
  if (route === "/export.json") return { days: history(30), markers };
  if (route === "/cancel") {
    pending = pending.filter((_, i) => i !== Number(params.get("index")));
    return sampleLedger("GET", "/status", null);
  }
  if (route === "/setup") return sampleLedger("GET", "/status", null);
  if (route === "/token") return { message: "saved; it is used from the next check" };
  if (route === "/change" && method === "POST") {
    // Colours apply at once, as on the Ledger.
    const b = body as { SourceColor?: { id: string; color: string | null }; BlocklistColor?: { id: string; color: string } };
    if (b.SourceColor) {
      const s = settings.sources[b.SourceColor.id] as { color?: string };
      if (s) { if (b.SourceColor.color) s.color = b.SourceColor.color; else delete s.color; }
      return "Now";
    }
    if (b.BlocklistColor) {
      const l = settings.blocklists[b.BlocklistColor.id];
      if (l) l.color = b.BlocklistColor.color;
      return "Now";
    }
    // Renaming, deleting, and taking apps out are never Loosenings.
    const c = body as { RenameSource?: { id: string; name: string }; DeleteSource?: string; SourceApps?: { id: string; packages: string[]; labels?: Record<string, string> } };
    if (c.RenameSource) { settings.sources[c.RenameSource.id].name = c.RenameSource.name; return "Now"; }
    if (c.DeleteSource) { delete settings.sources[c.DeleteSource]; return "Now"; }
    const group = c.SourceApps && settings.sources[c.SourceApps.id];
    if (group && c.SourceApps!.packages.every((p) => group.packages.includes(p))) {
      group.packages = c.SourceApps!.packages;
      return "Now";
    }
    pending = [...pending, [body as Record<string, unknown>, nextMorning()]];
    return { At: nextMorning() };
  }
  throw new Error(`no sample for ${method} ${path}`);
}
