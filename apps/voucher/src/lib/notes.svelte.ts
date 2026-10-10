// What Trends knows besides the numbers: Markers (dated notes, some written
// by the Ledger when a rule changed), the Curfew question's answers, why
// Unlocks happened. Markers are loaded once and shared by every card that
// draws them.
import { ledger } from "./api";
import { curfew } from "./curfew.svelte";
import type { Marker, Verdict } from "./types";

class Notes {
  markers = $state<Marker[]>([]);
  #loading: Promise<void> | null = null;

  /** Loads Markers once; later calls wait on the same load. */
  load(again = false) {
    if (!this.#loading || again) {
      this.#loading = (async () => {
        try { this.markers = await ledger<Marker[]>("GET", "/markers"); } catch { /* an older Ledger has none */ }
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

  /** Markers in a Day, oldest first. */
  on(day: string) {
    return this.markers.filter((m) => dayOfMoment(m.at) === day);
  }
}

export const notes = new Notes();

/** The keys for the Markers a chart shows, the same on every card: "Marker"
 *  (magenta) when one written by hand is in view, "Rule change" (grey) when
 *  one made by a rule change is. `kind` is how the chart draws them: "flag"
 *  for a line or a flag, "corner" for a tick on a grid square. Nothing when
 *  the chart shows none. */
export function markerKeys(shown: { rule: boolean }[], kind: "flag" | "corner" = "flag") {
  return [
    ...(shown.some((m) => !m.rule) ? [{ kind, color: "var(--marker)", label: "Marker" }] : []),
    ...(shown.some((m) => m.rule) ? [{ kind, color: "var(--muted)", label: "Rule change" }] : []),
  ];
}

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
export const clock = (at: string) => {
  const d = new Date(at);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
};

/** Answers the Curfew question for a Day (null clears it). */
export const answerVerdict = (day: string, verdict: Verdict | null) => ledger("POST", "/verdict", { day, verdict });

/** The Day it is now. */
export const dayNow = () => dayOfMoment(new Date().toISOString());

/** Life events offered as one-tap Markers (after the Curfew question, for now); "Other…" takes any text. */
export const MARKER_CHOICES = ["New medication or dose", "Sick", "Travel", "Exam or deadline", "New term"];

/** The reasons offered after an Unlock; the phone's notification offers the first three. */
export const REASONS = ["Bored", "Avoiding a task", "Tired", "Anxious", "Urgent", "Habit"];

/** Records why the Unlock just now happened. */
export const giveReason = (reason: string) => ledger("POST", "/reason", { reason: reason.toLowerCase() });

/** Whether a Day's Distraction minutes were measured: false means its zero is "unknown", not "none". */
export const measured = (d: { reported?: boolean; used?: Record<string, number> }) =>
  d.reported ?? Object.keys(d.used ?? {}).length > 0;
