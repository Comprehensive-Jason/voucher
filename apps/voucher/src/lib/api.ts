// Talks to the app's Rust side inside Tauri. In a plain browser (design checks
// on sprout) it serves sample data instead; `?state=` picks which situation.
import { invoke } from "@tauri-apps/api/core";
import type { DeviceUsage, Protection, SourceProgress, Today } from "./types";
import { sampleLedger } from "./sample";

const inTauri = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export function today(): Promise<Today> {
  return inTauri ? invoke<Today>("today") : Promise.resolve(sampleToday());
}

export function tear(count: number): Promise<Today> {
  if (inTauri) return invoke<Today>("tear", { count });
  const t = sampleToday();
  const now = Math.floor(Date.now() / 1000);
  const from = t.unlockEndsAt && t.unlockEndsAt > now ? t.unlockEndsAt : now;
  return Promise.resolve({ ...t, bank: t.bank - count, unlockEndsAt: from + count * t.unlockMinutes * 60,
    unlockStartedAt: t.unlockStartedAt ?? now, unlockTickets: t.unlockTickets + count });
}

function sampleSources(): SourceProgress[] {
  const s = (id: string, kind: SourceProgress["kind"], every: number, progress: number, earned: number, on = true) =>
    ({ id, kind, on, every, progress, earned });
  return [
    s("todoist", "tasks", 1, 0, 5), s("clickup", "tasks", 1, 0, 2), s("workout", "workout", 15, 9, 1),
    s("obsidian", "focus", 30, 18, 2), s("readwise", "focus", 30, 22, 1), s("moonreader", "focus", 30, 9, 0),
    s("anki", "focus", 30, 6, 0),
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
    unlockStartedAt: null, unlockTickets: 0,
    blocklists: ["Instagram", "YouTube", "Reddit", "Games"],
  };
  switch (state) {
    case "running": return { ...base, bank: 7, unlockEndsAt: now + 17 * 60 + 12, unlockStartedAt: now - 2 * 60 - 48, unlockTickets: 2 };
    case "curfew": return { ...base, bank: 8, curfewActive: true };
    case "full": return { ...base, bank: 24 };
    case "goalmet": return { ...base, goalDone: 16, streakDays: 5 };
    case "streaklost": return { ...base, goalDone: 0, streakDays: 0 };
    case "empty": return { ...base, bank: 0 };
    default: return base;
  }
}

/** Any other Ledger request, passed through the app's Rust side. */
export function ledger<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (inTauri) {
    return invoke<T>("ledger", { method, path, body: body === undefined ? null : JSON.stringify(body) });
  }
  return Promise.resolve(sampleLedger(method, path, body) as T);
}

/**
 * Today's on-device usage. Null when the phone can't measure it (no usage
 * access yet, or not running on Android).
 */
export async function deviceUsage(): Promise<DeviceUsage | null> {
  if (!inTauri) {
    return { apps: [{ label: "Instagram", minutes: 14 }, { label: "YouTube", minutes: 8 }, { label: "Reddit", minutes: 4 }],
      blockedOpens: 23, closedWithoutTearing: 21 };
  }
  try {
    return await invoke<DeviceUsage | null>("plugin:voucher|usage");
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
    return await invoke<Protection>("plugin:voucher|protection");
  } catch {
    return null;
  }
}

/** Opens the system screen that turns on one protection part. */
export async function fixProtection(part: keyof Protection): Promise<void> {
  if (inTauri) await invoke("plugin:voucher|open_settings", { part });
}

/** Apps on this phone that could count as Focused time. */
export async function launchableApps(): Promise<{ package: string; label: string }[]> {
  if (!inTauri) {
    return [
      { package: "com.duolingo", label: "Duolingo" }, { package: "org.zotero.android", label: "Zotero" },
      { package: "com.google.android.apps.docs.editors.docs", label: "Docs" }, { package: "net.ankiweb.ankidroid", label: "AnkiDroid" },
    ];
  }
  try {
    return await invoke<{ package: string; label: string }[]>("plugin:voucher|apps");
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
export async function connect(url: string): Promise<string> {
  if (!inTauri) return "sikFbkXq";
  return invoke<string>("connect", { url });
}

/** Asks for Health Connect access to exercise and heart rate. */
export async function requestHealth(): Promise<boolean> {
  if (!inTauri) return true;
  try { return await invoke<boolean>("plugin:voucher|request_health"); } catch { return false; }
}

/** The ADB command that makes Voucher Device Owner on this phone. */
export const DEVICE_OWNER_COMMAND = "adb shell dpm set-device-owner io.github.comprehensivejason.voucher/.VoucherAdminReceiver";

/** This device's name for the Ledger, such as "SM-S928U-4f2a". */
export async function deviceId(): Promise<string> {
  if (!inTauri) return "sample-phone";
  try { return await invoke<string>("plugin:voucher|device_id"); } catch { return "unknown-device"; }
}
