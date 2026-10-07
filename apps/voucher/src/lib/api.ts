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
  return Promise.resolve({ ...t, bank: t.bank - count, unlockEndsAt: from + count * t.unlockMinutes * 60 });
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
    goalDone: 11, goalTarget: 16, streakDays: 4,
    sources: sampleSources(),
  };
  switch (state) {
    case "running": return { ...base, bank: 7, unlockEndsAt: now + 17 * 60 + 12 };
    case "curfew": return { ...base, bank: 8, curfewActive: true };
    case "full": return { ...base, bank: 24 };
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
