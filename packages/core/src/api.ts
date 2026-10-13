// Talks to the app's Rust side inside Tauri. In a plain browser (design checks
// on sprout) it serves sample data instead; `?state=` picks which situation.
import { noteFailure, noteSuccess } from "./health.svelte";
import { invoke } from "@tauri-apps/api/core";
import type { CalendarChoice, CalendarDay, CalendarId, DayTotal, PlannedBlock, PlannedSplit, Sleep, Status } from "./types";
import { sampleLedger } from "./sample";
import { rememberSources } from "./colors.svelte";
import { current } from "./palette";

/** Fired after any change to the Ledger's settings, for panels to reload. */
export const RULES_CHANGED = "voucher:rules-changed";

/** Running inside the app's Tauri shell, rather than a plain browser. */
export const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

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

/** Runs a Ledger call, telling $core/health.svelte.ts whether it got through.
 *  `method` and `path` name it for the preview's faults. */
export async function watched<T>(call: () => Promise<T> | T, method = "GET", path = ""): Promise<T> {
  try {
    if (previewDown) throw new Error("Can't reach the Ledger: io: Connection refused (os error 111)");
    const fault = faultFor(method, path);
    if (fault) throw fault;
    const reply = await call();
    noteSuccess();
    return reply;
  } catch (e) { noteFailure(e); throw e; }
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

/** Which Ledger requests this app may make, when it limits them (allowLedger). */
let mayCall: ((method: string, path: string) => boolean) | null = null;
/** Limits this app's Ledger requests to those `check` allows: any other one
 *  throws before it's sent. Counterfoil, which only reads, sets this. */
export function allowLedger(check: (method: string, path: string) => boolean) {
  mayCall = check;
}

/** A dev server's way through to a real Ledger, when it has one
 *  (packages/core/ledgerProxy.js): a browser build then asks the Ledger
 *  there instead of answering from sample data. */
const proxy: string | undefined = !inTauri ? import.meta.env.VITE_LEDGER_PROXY : undefined;

/** A Ledger request through the dev server's proxy, failing with the words
 *  the app's Rust side uses, so the Ledger notice reads them the same. */
async function viaProxy<T>(method: string, path: string, body: unknown): Promise<T> {
  let reply: Response;
  try {
    reply = await fetch(`${proxy}${path}`, { method, headers: body === undefined ? {} : { "Content-Type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
  } catch (e) { throw new Error(`Can't reach the Ledger: ${e}`); }
  if (reply.status === 401) throw new Error("The Ledger wants its access code: set LEDGER_CODE for the dev server.");
  // The dev server answers an empty 500 when the Ledger doesn't answer it.
  if (reply.status >= 500 && !(await reply.clone().text())) throw new Error(`Can't reach the Ledger: the dev server's proxy got no answer (${reply.status})`);
  if (!reply.ok) throw new Error(`The Ledger refused this (${reply.status})`);
  const text = await reply.text();
  if (path.split("?")[0].endsWith(".csv")) return text as T;
  try { return JSON.parse(text) as T; } catch (e) { throw new Error(`Unexpected Ledger reply: ${e}`); }
}

/** Any other Ledger request, passed through the app's Rust side. */
export async function ledger<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (mayCall && !mayCall(method, path)) throw new Error(`${method} ${path.split("?")[0]} isn't a request this app may make`);
  if (previewLatency) await new Promise((r) => setTimeout(r, previewLatency));
  const reply = await watched(() => (inTauri
    ? invoke<T>("ledger", { method, path, body: body === undefined ? null : JSON.stringify(body) })
    : proxy ? viaProxy<T>(method, path, body)
    : previewReply<T>(method, path, body)), method, path);
  // A blocklist saved in a swatch that moved in a retheme draws as the one it became.
  const lists = (reply as { settings?: { blocklists?: Record<string, { color: string }> } } | null)?.settings?.blocklists;
  for (const list of Object.values(lists ?? {})) if (list?.color) list.color = current(list.color);
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
