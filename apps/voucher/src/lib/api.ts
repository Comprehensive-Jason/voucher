// Talks to the app's Rust side inside Tauri. In a plain browser (design checks
// on sprout) it serves sample data instead; `?state=` picks which situation.
import { invoke } from "@tauri-apps/api/core";
import type { DeviceUsage, Protection, SourceProgress, Today } from "./types";
import { sampleLedger } from "./sample";
import { rememberSources } from "./colors.svelte";

/** Fired after any change to the Ledger's settings, for panels to reload. */
export const RULES_CHANGED = "voucher:rules-changed";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

/** Calls the phone's own side (Kotlin), through the Rust `device` command. */
export function device<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  return invoke<T>("device", { command, args: args ?? null });
}

export async function today(): Promise<Today> {
  const t = inTauri ? await invoke<Today>("today") : sampleToday();
  // Today names each source and carries its colour; older desktop builds send only colours.
  rememberSources(t.sources?.some((s) => s.name) ? t.sources : t.sourceColors ?? {});
  return t;
}

export function tear(count: number): Promise<Today> {
  if (inTauri) return invoke<Today>("tear", { count });
  const t = sampleToday();
  const now = Math.floor(Date.now() / 1000);
  const from = t.unlockEndsAt && t.unlockEndsAt > now ? t.unlockEndsAt : now;
  return Promise.resolve({ ...t, bank: t.bank - count, unlockEndsAt: from + count * t.unlockMinutes * 60,
    unlockStartedAt: t.unlockStartedAt ?? now, unlockVouchers: t.unlockVouchers + count });
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

/** Any other Ledger request, passed through the app's Rust side. */
export async function ledger<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const reply = inTauri
    ? await invoke<T>("ledger", { method, path, body: body === undefined ? null : JSON.stringify(body) })
    : (sampleLedger(method, path, body) as T);
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

/** The phone's protection parts. Null outside Android. */
export async function protection(): Promise<Protection | null> {
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
    { part: "overlay", name: "Blocked-app screen", what: "Shows Voucher's screen when a paused app opens" },
  ];
}
