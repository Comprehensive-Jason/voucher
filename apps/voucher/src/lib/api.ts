// Talks to the app's Rust side inside Tauri. In a plain browser (design checks
// on sprout) it serves sample data instead; `?state=` picks which situation.
import { noteFailure, noteSuccess } from "./health.svelte";
import { invoke } from "@tauri-apps/api/core";
import type { CalendarChoice, CalendarDay, CalendarId, DayTotal, DeviceCalendars, DeviceUsage, PlannedBlock, PlannedSplit, Protection, Sleep, SourceProgress, Status, Today } from "./types";
import { sampleLedger } from "./sample";
import { sampleDeviceCalendars } from "./sampleExtra";
import { rememberSources } from "./colors.svelte";

/** Fired after any change to the Ledger's settings, for panels to reload. */
export const RULES_CHANGED = "voucher:rules-changed";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Calls the phone's own side (Kotlin), through the Rust `device` command. */
export function device<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>("device", { command, args: args ?? null });
}

/** The browser preview pretends the Ledger is down with `?ledger=down`, to see the app as a device does then. */
const previewDown = !inTauri && typeof location !== "undefined" && new URLSearchParams(location.search).get("ledger") === "down";

/** The browser preview plays one of the Ledger's test faults with `?fault=`,
 *  to see how the app shows it: `refuse-changes` (a Rules change refused),
 *  `refuse-tear`, `fail-marker`, `fail-export`, `token` (Todoist's token
 *  turned down), `unauthorized` (the access code), or `garbled` (a reply that
 *  doesn't parse). Each throws the message the app's Rust side would. */
type Fault = "refuse-changes" | "refuse-tear" | "fail-marker" | "fail-export" | "token" | "unauthorized" | "garbled";
const previewFault = (!inTauri && typeof location !== "undefined" ? new URLSearchParams(location.search).get("fault") : null) as Fault | null;

/** The error a preview fault throws for this request, if any. */
function faultFor(method: string, path: string): Error | null {
  const route = path.split("?")[0];
  switch (previewFault) {
    case "unauthorized": return new Error("The Ledger wants its access code: reconnect in Setup.");
    case "garbled": return new Error("Unexpected Ledger reply: expected value at line 1 column 1");
    case "refuse-changes": return method === "POST" && route === "/change" ? new Error("The Ledger refused this (400)") : null;
    case "refuse-tear": return route === "tear" ? new Error("Refused by the Ledger") : null;
    case "fail-marker": return method === "POST" && route.startsWith("/marker") ? new Error("The Ledger refused this (500)") : null;
    case "fail-export": return route.startsWith("/export") ? new Error("The Ledger refused this (500)") : null;
    default: return null;
  }
}

/** Runs a Ledger call, telling lib/health.svelte.ts whether it got through.
 *  `method` and `path` name it for the preview's faults. */
async function watched<T>(call: () => Promise<T> | T, method = "GET", path = ""): Promise<T> {
  try {
    if (previewDown) throw new Error("Can't reach the Ledger: io: Connection refused (os error 111)");
    const fault = faultFor(method, path);
    if (fault) throw fault;
    const reply = await call();
    noteSuccess();
    return reply;
  } catch (e) { noteFailure(e); throw e; }
}

export async function today(): Promise<Today> {
  const t = await watched(() => (inTauri ? invoke<Today>("today") : sampleToday()), "GET", "today");
  // Today names each source and carries its colour; older desktop builds send only colours.
  rememberSources(t.sources?.some((s) => s.name) ? t.sources : t.sourceColors ?? {});
  return t;
}

export function tear(count: number): Promise<Today> {
  if (inTauri) return watched(() => invoke<Today>("tear", { count }));
  return watched(() => {
    const t = sampleToday();
    const now = Math.floor(Date.now() / 1000);
    const from = t.unlockEndsAt && t.unlockEndsAt > now ? t.unlockEndsAt : now;
    return { ...t, bank: t.bank - count, unlockEndsAt: from + count * t.unlockMinutes * 60,
      unlockStartedAt: t.unlockStartedAt ?? now, unlockVouchers: t.unlockVouchers + count };
  }, "POST", "tear");
}

function sampleSources(): SourceProgress[] {
  const s = (id: string, kind: SourceProgress["kind"], every: number, progress: number, earned: number, on = true) =>
    ({ id, kind, on, every, progress, earned });
  return [
    s("todoist", "tasks", 1, 0, 5), s("clickup", "tasks", 1, 0, 2), s("workout", "workout", 15, 9, 1),
    s("obsidian", "focus", 30, 18, 2), s("readwise", "focus", 30, 22, 1), s("moonreader", "focus", 30, 9, 0),
    s("anki", "focus", 30, 6, 0), s("steps", "steps", 2000, 1450, 1),
  ];
}

function sampleToday(): Today {
  const state = new URLSearchParams(location.search).get("state") ?? "locked";
  const now = Math.floor(Date.now() / 1000);
  const base: Today = {
    bank: 9, bankLimit: 24, unlockMinutes: 10, unlockEndsAt: null,
    curfewActive: false, curfewStart: "22:00", curfewEnd: "06:00",
    day: "2026-10-07", goalDone: 11, goalTarget: 16, streakDays: 4,
    sources: sampleSources(),
    log: [
      { kind: "earned", at: new Date(Date.now() - 3 * 3600_000).toISOString(), task: "todoist:1", title: "Weekly review", kept: false },
    ],
    unlockStartedAt: null, unlockVouchers: 0, curfewRoomMinutes: null, sourceColors: sampleColors(),
    blocklists: ["Instagram", "YouTube", "Reddit", "Games"],
  };
  switch (state) {
    case "running": return { ...base, bank: 7, unlockEndsAt: now + 17 * 60 + 12, unlockStartedAt: now - 2 * 60 - 48, unlockVouchers: 2 };
    case "curfew": return { ...base, bank: 8, curfewActive: true };
    case "full": return { ...base, bank: 24 };
    case "goalmet": return { ...base, goalDone: 16, streakDays: 5 };
    case "streaklost": return { ...base, goalDone: 0, streakDays: 0 };
    case "empty": return { ...base, bank: 0 };
    default: return base;
  }
}

/**
 * Every Day as CSV from the Ledger (`GET /export/days.csv`), handed to
 * Android's share sheet on the phone and tablet (Obsidian, Drive, a file
 * manager) or saved as a file elsewhere. The same URL works with curl and
 * the access code, for scripts.
 */
export async function exportDays(): Promise<void> {
  const csv = await ledger<string>("GET", "/export/days.csv");
  const name = `voucher-days-${new Date().toISOString().slice(0, 10)}.csv`;
  if (inTauri && /android/i.test(navigator.userAgent)) {
    await device("share", { title: name, text: csv });
    return;
  }
  const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
  const a = Object.assign(document.createElement("a"), { href: url, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** The browser preview's pretend network delay, from `?latency=200` (ms),
 *  to see screens as a device sees them while the Ledger answers. */
const previewLatency = !inTauri && typeof location !== "undefined" ? Number(new URLSearchParams(location.search).get("latency")) || 0 : 0;

/** The last settings and status any screen fetched. A screen that opens
 *  starts from it, fully drawn, instead of empty until its own answer comes:
 *  Rules sliding up shows its finished columns and notices, and nothing pops
 *  in halfway through the slide. */
let lastStatus: Status | null = null;
export const statusNow = () => lastStatus;

/** Whether two Ledger answers say the same thing, so a screen can keep what
 *  it shows (and skip a redraw) when a fresh answer hasn't changed. */
export const sameAnswer = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/** Any other Ledger request, passed through the app's Rust side. */
export async function ledger<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (previewLatency) await new Promise((r) => setTimeout(r, previewLatency));
  const reply = await watched(() => (inTauri
    ? invoke<T>("ledger", { method, path, body: body === undefined ? null : JSON.stringify(body) })
    : previewReply<T>(method, path, body)), method, path);
  if (path === "/status" || (method === "POST" && path.startsWith("/cancel"))) lastStatus = reply as Status;
  // A settings change tells every panel showing settings to look again, so
  // e.g. a loosening made under Sources shows at once among Limits' changes.
  if (method === "POST" && ["/change", "/cancel", "/setup"].some((p) => path.startsWith(p)) && typeof window !== "undefined") {
    window.dispatchEvent(new Event(RULES_CHANGED));
  }
  // Any fresh look at the settings also refreshes how sources are named and drawn.
  if (path === "/status") {
    const sources = (reply as { settings?: { sources?: Record<string, { name?: string; color?: string }> } }).settings?.sources;
    if (sources) rememberSources(sources);
  }
  return reply;
}

/** The sample Ledger's answer, with `?fault=token` turning Todoist's token down. */
function previewReply<T>(method: string, path: string, body: unknown): T {
  const reply = sampleLedger(method, path, body) as T;
  if (previewFault === "token" && path === "/status") {
    const s = reply as Status;
    return { ...s, source_errors: { ...s.source_errors, todoist: "sign-in expired" } } as T;
  }
  return reply;
}

function sampleColors(): Record<string, string> {
  const sources = (sampleLedger("GET", "/status", null) as { settings: { sources: Record<string, { color?: string }> } }).settings.sources;
  return Object.fromEntries(Object.entries(sources).filter(([, s]) => s.color).map(([id, s]) => [id, s.color!]));
}

/**
 * Today's on-device usage. Null when the phone can't measure it (no usage
 * access yet, or not running on Android).
 */
export async function deviceUsage(): Promise<DeviceUsage | null> {
  // A dev build pointed at the test portal (VITE_TEST_PORTAL in a local env
  // file) shows the portal's made-up Distraction time instead of this device's.
  const portal = import.meta.env.DEV ? import.meta.env.VITE_TEST_PORTAL : undefined;
  if (portal) {
    try { return await (await fetch(`${portal}/api/usage`)).json(); } catch { /* fall through */ }
  }
  if (!inTauri) {
    return { measured: true, apps: [{ label: "Instagram", minutes: 14 }, { label: "YouTube", minutes: 8 }, { label: "Reddit", minutes: 4 }],
      blockedOpens: 23, closedWithoutTearing: 21,
      attempts: [{ label: "Instagram", count: 14 }, { label: "YouTube", count: 6 }, { label: "Reddit", count: 3 }] };
  }
  try {
    return await device<DeviceUsage | null>("usage");
  } catch {
    return null;
  }
}

/** The last protection check, for a screen to start from (see statusNow). */
let lastProtection: Protection | null = null;
export const protectionNow = () => lastProtection;

/** The phone's protection parts. Null outside Android. */
export async function protection(): Promise<Protection | null> {
  return (lastProtection = await checkProtection());
}
async function checkProtection(): Promise<Protection | null> {
  if (!inTauri) {
    const p = new URLSearchParams(location.search).get("protection");
    return { deviceOwner: p !== "off", usageAccess: p !== "off", overlay: p !== "off" && p !== "partial" };
  }
  try {
    return await device<Protection>("protection");
  } catch {
    return null;
  }
}

/** Opens the system screen that turns on one protection part. */
export async function fixProtection(part: keyof Protection): Promise<void> {
  if (inTauri) await device("openSettings", { part });
}

/** Apps on this phone that could count as Focused time. */
export async function launchableApps(): Promise<{ package: string; label: string }[]> {
  if (!inTauri) {
    // A browser preview has no device to ask, so it shows a sample of apps.
    return [
      ["com.duolingo", "Duolingo"], ["org.zotero.android", "Zotero"], ["com.google.android.apps.docs.editors.docs", "Docs"],
      ["com.ichi2.anki", "AnkiDroid"], ["com.readermobile", "Readwise Reader"], ["com.flyersoft.moonreaderp", "Moon+ Reader Pro"],
      ["com.shortform.app", "Shortform"], ["com.overdrive.mobile.android.libby", "Libby"], ["com.hoopladigital.android", "Hoopla"],
      ["com.substack.app", "Substack"], ["org.wikipedia", "Wikipedia"], ["md.obsidian", "Obsidian"], ["com.pleco.chinesesystem", "Pleco"],
      ["com.instructure.candroid", "Canvas"], ["com.twitter.android", "X"], ["tv.danmaku.bili", "bilibili"], ["com.discord", "Discord"],
      ["com.linkedin.android", "LinkedIn"], ["com.brave.browser", "Brave"], ["com.desmos.calculator", "Desmos"],
    ].map(([pkg, label]) => ({ package: pkg, label }));
  }
  try {
    return await device<{ package: string; label: string }[]>("apps");
  } catch {
    return [];
  }
}

/** The Ledger address this device uses, or null before setup. */
export async function connection(): Promise<string | null> {
  if (!inTauri) return new URLSearchParams(location.search).get("fresh") ? null : "http://sample-ledger:8787";
  return invoke<string | null>("connection");
}

/** Connects this device to a Ledger; returns its key's first characters. */
export async function connect(url: string, code: string): Promise<string> {
  if (!inTauri) return "sikFbkXq";
  return invoke<string>("connect", { url, code: code.trim() || null });
}

/** Asks for Health Connect access to exercise and heart rate. */
export async function requestHealth(): Promise<boolean> {
  if (!inTauri) return true;
  try { return await device<boolean>("requestHealth"); } catch { return false; }
}

/** The ADB command that makes Voucher Device Owner on this phone. */
export const DEVICE_OWNER_COMMAND = "adb shell dpm set-device-owner io.github.comprehensivejason.voucher/.VoucherAdminReceiver";

/** This device's name for the Ledger, such as "SM-S928U-4f2a". */
export async function deviceId(): Promise<string> {
  if (!inTauri) return "sample-phone";
  try { return await device<string>("deviceId"); } catch { return "unknown-device"; }
}

/** An installed app's icon as a data URL, or null. */
export async function appIcon(pkg: string): Promise<string | null> {
  if (!inTauri) return null;
  try { return await device<string>("appIcon", { pkg }); } catch { return null; }
}

/** Running on Windows, where the guard service and ActivityWatch replace Android's protection parts. */
export const onWindows = typeof navigator !== "undefined" && navigator.userAgent.includes("Windows");

/** What each protection part is called and does on this platform. */
export function protectionParts(): { part: keyof Protection; name: string; what: string }[] {
  if (onWindows) {
    return [
      { part: "deviceOwner", name: "Voucher guard", what: "A Windows service that closes paused programs and blocks sites. Installed with Voucher." },
      { part: "usageAccess", name: "ActivityWatch", what: "Counts focused time in your apps. Voucher reads it on this PC." },
    ];
  }
  return [
    { part: "deviceOwner", name: "App blocking", what: "Pauses your Distractions, and stops Voucher being uninstalled" },
    { part: "usageAccess", name: "Usage access", what: "Counts focused time in your apps" },
    { part: "overlay", name: "Blocked-app screen and site time", what: "Shows Voucher's screen when a paused app opens, and counts time on sites in Brave and Chrome" },
  ];
}

/** Which protection part is missing, most serious first, with what to say and do about it. */
export function missingProtection(guard: Protection | null) {
  if (!guard) return null;
  if (!guard.deviceOwner) return { level: "off", part: "deviceOwner" as const, title: "Protection off",
    text: onWindows ? "The Voucher guard isn't running, so nothing is closed or blocked." : "Voucher isn't Device Owner on this device, so nothing is paused.",
    action: onWindows ? "See how to fix it" : "Set up app blocking" };
  if (!guard.usageAccess) return { level: "partial", part: "usageAccess" as const, title: "Protection partly on",
    text: onWindows ? "ActivityWatch isn't running, so Focused time on this PC can't be counted." : "Usage access is off, so Focused time and Distraction minutes can't be measured.",
    action: onWindows ? "Get ActivityWatch" : "Turn usage access on" };
  if (!guard.overlay && !onWindows) return { level: "partial", part: "overlay" as const, title: "Protection partly on",
    text: "The blocked-app screen is off, so paused apps show Android's plain dialog and time on sites can't be counted.", action: "Turn the blocked-app screen on" };
  return null;
}

// ---- Sleep and calendar load ----
// What a Day was like besides its Vouchers. The Ledger sends both with each
// Day in GET /history and GET /day; these read and write them. (It still
// keeps old energy answers and takes POST /energy, but the app no longer asks.)

/** One Day's sleep and calendar load. */
export interface DayMeasures { day: string; sleep: Sleep | null; calendar: CalendarDay | null }

/** The last `days` Days' sleep and calendar load, oldest first. */
export async function dayMeasures(days: number): Promise<DayMeasures[]> {
  const history = await ledger<DayTotal[]>("GET", `/history?days=${days}`);
  return history.map((d) => ({ day: d.day, sleep: d.sleep ?? null, calendar: d.calendar ?? null }));
}

/** Which calendars count toward the calendar load, and the device that reports them. */
export const calendarChoice = () => ledger<CalendarChoice>("GET", "/calendars");

/** Saves a choice of calendars made on `device`, which then reports them. */
export const chooseCalendars = (device: string, calendars: CalendarId[]) =>
  ledger<CalendarChoice>("POST", "/calendars", { device, calendars });

/** The calendars on this device and whether Voucher may read them: Android
 *  only, null elsewhere (calendars are chosen on Android). The browser
 *  preview shows Android's sheet with sample calendars on `?calendars=pick`,
 *  and before access is given on `?calendars=ask`. */
export async function deviceCalendars(): Promise<DeviceCalendars | null> {
  if (!inTauri) {
    const p = new URLSearchParams(location.search).get("calendars");
    if (p === "ask") return { granted: false, calendars: [] };
    return p === "pick" ? { granted: true, calendars: sampleDeviceCalendars() } : null;
  }
  try { return await device<DeviceCalendars | null>("calendars"); } catch { return null; }
}

/** Asks Android for calendar access; the answer comes later, so check deviceCalendars again when the app is visible. */
export async function requestCalendarAccess(): Promise<void> {
  if (inTauri) { try { await device("requestCalendar"); } catch { /* not on this platform */ } }
}

// ---- Planned vs actual ----
// Time blocks from Todoist, with how each one's minutes went. The Ledger
// sends them with each Day in GET /history and GET /day.

/** One Day's planned time blocks. `spansKnown` is false when some device
 *  sent Distraction minutes without their times (older Enforcers), or none
 *  sent any (Windows sends no Distraction), so the blocks' Distraction isn't
 *  known: show it as unknown, not as none. */
export interface DayPlanned { day: string; planned: PlannedBlock[]; spansKnown: boolean }

/** A block's split with every Unlock field: as the Ledger sent them, or from
 *  an older Ledger, which counted Unlocks inside `distraction`, its minutes
 *  inside `unlocks` (the Day's), counted as used. */
export function fullSplit(b: PlannedBlock, unlocks: [string, string][]): Required<PlannedSplit> {
  const s = b.split;
  if (s.unlocked != null) return { unlocked_sources: 0, unlocked_other: 0, unlocked_unknown: 0, distraction_unlocked: 0, ...s, unlocked: s.unlocked };
  const from = Date.parse(b.start), to = from + b.minutes * 60_000;
  const open = unlocks.reduce((t, [a, z]) => t + Math.max(0, Math.min(to, Date.parse(z)) - Math.max(from, Date.parse(a))), 0) / 60_000;
  const unlocked = Math.min(s.distraction, Math.round(open));
  return { ...s, unlocked, distraction_unlocked: unlocked, unlocked_sources: 0, unlocked_other: 0, unlocked_unknown: 0 };
}

/** The last `days` Days' time blocks, oldest first. */
export async function plannedBlocks(days: number): Promise<DayPlanned[]> {
  const history = await ledger<DayTotal[]>("GET", `/history?days=${days}`);
  return history.map((d) => ({ day: d.day, planned: d.planned ?? [], spansKnown: d.distraction_spans != null }));
}

/** How many time blocks the Ledger has for today, from the last status any screen fetched (0 from older Ledgers). */
export const plannedToday = (status: Status | null) => status?.today.planned?.length ?? 0;
