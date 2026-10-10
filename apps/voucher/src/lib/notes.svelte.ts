// What Trends knows besides the numbers: Markers (dated notes, some written
// by the Ledger when a rule changed), the Curfew question's answers, why
// Unlocks happened, and Replay guesses. Markers and guesses are loaded once
// and shared by every card that draws them.
import { ledger } from "./api";
import { curfew } from "./curfew.svelte";
import type { Marker, Verdict } from "./types";

class Notes {
  markers = $state<Marker[]>([]);
  guesses = $state<Record<string, number>>({});
  #loading: Promise<void> | null = null;

  /** Loads Markers and guesses once; later calls wait on the same load. */
  load(again = false) {
    if (!this.#loading || again) {
      this.#loading = (async () => {
        try {
          const [markers, guesses] = await Promise.all([
            ledger<Marker[]>("GET", "/markers"),
            ledger<Record<string, number>>("GET", "/guesses"),
          ]);
          this.markers = markers;
          this.guesses = guesses;
        } catch { /* an older Ledger has neither */ }
      })();
    }
    return this.#loading;
  }

  async add(text: string, at?: string) {
    await ledger("POST", "/marker", at ? { text, at } : { text });
    await this.load(true);
  }

  async remove(at: string) {
    this.markers = await ledger<Marker[]>("POST", `/marker/remove?at=${encodeURIComponent(at)}`);
  }

  async guess(period: string, n: number) {
    this.guesses = await ledger<Record<string, number>>("POST", "/guess", { period, guess: n });
  }

  /** Markers in a Day, oldest first. */
  on(day: string) {
    return this.markers.filter((m) => dayOfMoment(m.at) === day);
  }
}

export const notes = new Notes();

/** The Day a moment belongs to: a Day runs from Curfew's end to the next, so 01:00 counts toward the evening before. */
export function dayOfMoment(at: string): string {
  const d = new Date(at);
  if (d.getHours() + d.getMinutes() / 60 < curfew.end) d.setDate(d.getDate() - 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** A moment's clock time as a fraction of hours (13.5 is 13:30). */
export function hourOfMoment(at: string): number {
  const d = new Date(at);
  return d.getHours() + d.getMinutes() / 60;
}

/** "13:30", in this device's time. */
export const clock = (at: string) => new Date(at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });

/** Answers the Curfew question for a Day (null clears it). */
export const answerVerdict = (day: string, verdict: Verdict | null) => ledger("POST", "/verdict", { day, verdict });

/** The reasons offered after an Unlock; the phone's notification offers the first three. */
export const REASONS = ["Bored", "Avoiding a task", "Tired", "Anxious", "Urgent", "Habit"];

/** Records why the Unlock just now happened. */
export const giveReason = (reason: string) => ledger("POST", "/reason", { reason: reason.toLowerCase() });

/** Whether a Day's Distraction minutes were measured: false means its zero is "unknown", not "none". */
export const measured = (d: { reported?: boolean; used?: Record<string, number> }) =>
  d.reported ?? Object.keys(d.used ?? {}).length > 0;
