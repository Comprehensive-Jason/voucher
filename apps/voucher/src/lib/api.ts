// Talks to the app's Rust side inside Tauri. In a plain browser (design checks
// on sprout) it serves sample data instead; `?state=` picks which situation.
import { invoke } from "@tauri-apps/api/core";
import type { Today } from "./types";

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

function sampleToday(): Today {
  const state = new URLSearchParams(location.search).get("state") ?? "locked";
  const now = Math.floor(Date.now() / 1000);
  const base: Today = {
    bank: 9, bankLimit: 24, unlockMinutes: 10, unlockEndsAt: null,
    curfewActive: false, curfewStart: "22:00", curfewEnd: "06:00",
    sample: {
      goalDone: 11, goalTarget: 16, streakDays: 4,
      sources: [
        { name: "Tasks", detail: "+1 each · 7 today", progress: 1, color: "#5b9cff" },
        { name: "Obsidian", detail: "18 / 30 min", progress: 0.6, color: "#b08cff" },
        { name: "Workout", detail: "9 / 15 zone min", progress: 0.6, color: "#ff8a5c" },
        { name: "Readwise Reader", detail: "22 / 30 min", progress: 0.73, color: "#ffd166" },
        { name: "Moon+ Reader", detail: "9 / 30 min", progress: 0.3, color: "#e0a82e" },
        { name: "Anki", detail: "6 / 30 min", progress: 0.2, color: "#ff6fa8" },
      ],
    },
  };
  switch (state) {
    case "running": return { ...base, bank: 7, unlockEndsAt: now + 17 * 60 + 12 };
    case "curfew": return { ...base, bank: 8, curfewActive: true };
    case "full": return { ...base, bank: 24 };
    case "empty": return { ...base, bank: 0 };
    default: return base;
  }
}
