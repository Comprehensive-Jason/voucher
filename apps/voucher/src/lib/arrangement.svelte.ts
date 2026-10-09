// Which panels the tablet shows right of the Today column, and where: a row
// of columns that scrolls sideways, each holding one or two panels, top to
// bottom. You arrange them on the tablet itself; the arrangement is kept on
// this device (a phone shows its own layout), and anything it can't read
// falls back to the default.
import { remember, remembered } from "./storage";

export type PanelId = "earned" | "heat" | "distraction" | "log"
  | "trend" | "when" | "pace" | "runway" | "strength" | "ladder" | "streaks" | "records";

export const PANELS: Record<PanelId, { name: string; /** Takes the column's spare height. */ grows: boolean }> = {
  earned: { name: "Vouchers earned", grows: true },
  heat: { name: "Activity graph", grows: false },
  distraction: { name: "Distraction time", grows: true },
  log: { name: "Log", grows: true },
  pace: { name: "Pace to goal", grows: false },
  trend: { name: "Trend lines", grows: false },
  when: { name: "When you earn", grows: false },
  runway: { name: "Morning runway", grows: false },
  strength: { name: "Habit strength", grows: false },
  ladder: { name: "Streak ladder", grows: false },
  streaks: { name: "Source streaks", grows: false },
  records: { name: "Personal records", grows: false },
};

/** At most this many panels share a column. */
export const PER_COLUMN = 2;

const DEFAULT: PanelId[][] = [["earned", "heat"], ["distraction"], ["log"], ["pace", "trend"], ["when", "runway"], ["strength", "ladder"], ["streaks", "records"]];
const KEY = "tablet-arrangement";

/** Drops unknown and repeated panels, splits overfull columns, and removes empty ones. */
function tidy(columns: PanelId[][]): PanelId[][] {
  const seen = new Set<PanelId>();
  const out: PanelId[][] = [];
  for (const column of columns) {
    const kept = column.filter((id) => id in PANELS && !seen.has(id) && seen.add(id));
    for (let i = 0; i < kept.length; i += PER_COLUMN) out.push(kept.slice(i, i + PER_COLUMN));
  }
  return out;
}

/** A saved arrangement, with any panel added since it was saved placed as
 *  the default places it (hidden ones stay hidden). The first saves didn't
 *  list which panels they knew, so those knew the first four. */
function load(): PanelId[][] {
  try {
    const raw = JSON.parse(remembered(KEY) ?? "null");
    const saved = Array.isArray(raw) ? { columns: raw, seen: ["earned", "heat", "distraction", "log"] } : raw;
    if (saved && Array.isArray(saved.columns) && saved.columns.every(Array.isArray)) {
      const fresh = DEFAULT.map((c) => c.filter((id) => !saved.seen?.includes(id))).filter((c) => c.length);
      return tidy([...saved.columns, ...fresh]);
    }
  } catch { /* the default, below */ }
  return DEFAULT.map((c) => [...c]);
}

class Arrangement {
  columns = $state<PanelId[][]>(load());
  hidden = $derived((Object.keys(PANELS) as PanelId[]).filter((id) => !this.columns.some((c) => c.includes(id))));

  #set(next: PanelId[][]) {
    this.columns = tidy(next);
    remember(KEY, JSON.stringify({ columns: this.columns, seen: Object.keys(PANELS) }));
  }
  #where(id: PanelId): [number, number] {
    const col = this.columns.findIndex((c) => c.includes(id));
    return [col, col < 0 ? -1 : this.columns[col].indexOf(id)];
  }

  /** Into the column before (-1) or after (+1); past either end starts a new column. */
  sideways(id: PanelId, by: -1 | 1) {
    const [col] = this.#where(id);
    if (col < 0) return;
    const next = this.columns.map((c) => c.filter((p) => p !== id));
    const to = col + by;
    if (to < 0) next.unshift([id]);
    else if (to >= next.length) next.push([id]);
    else if (next[to].length < PER_COLUMN) next[to].push(id);
    // A full neighbour: a column of its own between the two, or, if it was
    // alone (so that would be where it already is), past the neighbour.
    else {
      const alone = next[col].length === 0;
      next.splice(by > 0 ? (alone ? to + 1 : to) : alone ? to : to + 1, 0, [id]);
    }
    this.#set(next);
  }
  /** Swaps it with the other panel in its column. */
  flip(id: PanelId) {
    const [col] = this.#where(id);
    if (col < 0 || this.columns[col].length < 2) return;
    this.#set(this.columns.map((c, i) => (i === col ? [...c].reverse() : c)));
  }
  hide(id: PanelId) {
    this.#set(this.columns.map((c) => c.filter((p) => p !== id)));
  }
  /** Back in, as a column of its own at the end. */
  show(id: PanelId) {
    this.#set([...this.columns, [id]]);
  }
  reset() {
    this.#set(DEFAULT.map((c) => [...c]));
  }
}

export const arrangement = new Arrangement();
