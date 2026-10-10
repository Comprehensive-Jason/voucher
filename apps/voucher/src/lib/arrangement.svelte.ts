// Which panels the tablet shows right of the Today column, and where: a row
// of columns that scrolls sideways. Each column is three equal rows high, and
// each panel takes one, two, or all three of them; some have one size, others
// can be resized within a range. You arrange them on the tablet itself; the
// arrangement is kept on this device (a phone shows its own layout), and
// anything it can't read falls back to the default.
import { remember, remembered } from "./storage";

export type PanelId = "earned" | "heat" | "distraction" | "log"
  | "trend" | "when" | "pace" | "runway" | "strength" | "ladder" | "streaks" | "records";

/** A panel's height in thirds of a column: the smallest it can be, the
 *  largest, and where it starts. Equal min and max mean one fixed size. */
export const PANELS: Record<PanelId, { name: string; min: number; max: number; size: number }> = {
  earned: { name: "Vouchers earned", min: 2, max: 3, size: 2 },
  heat: { name: "Activity graph", min: 1, max: 1, size: 1 },
  distraction: { name: "Distraction time", min: 2, max: 3, size: 2 },
  log: { name: "Log", min: 1, max: 3, size: 3 },
  pace: { name: "Pace to goal", min: 1, max: 1, size: 1 },
  trend: { name: "Trend lines", min: 1, max: 1, size: 1 },
  when: { name: "When you earn", min: 1, max: 3, size: 2 },
  runway: { name: "Morning runway", min: 1, max: 1, size: 1 },
  strength: { name: "Habit strength", min: 1, max: 1, size: 1 },
  ladder: { name: "Streak ladder", min: 1, max: 1, size: 1 },
  streaks: { name: "Source streaks", min: 1, max: 1, size: 1 },
  records: { name: "Personal records", min: 1, max: 1, size: 1 },
};

/** Thirds in a column. */
export const ROWS = 3;

const DEFAULT: PanelId[][] = [["earned", "heat"], ["distraction", "pace"], ["log"], ["when", "trend"], ["runway", "strength", "ladder"], ["records", "streaks"]];
const KEY = "tablet-arrangement";

type Sizes = Partial<Record<PanelId, number>>;
const clampSize = (id: PanelId, n: unknown) => Math.min(PANELS[id].max, Math.max(PANELS[id].min, Number(n) || PANELS[id].size));

/** Drops unknown and repeated panels, and moves whatever doesn't fit in a
 *  column into a new column right after it; empty columns go. */
function tidy(columns: PanelId[][], sizes: Sizes): PanelId[][] {
  const seen = new Set<PanelId>();
  const out: PanelId[][] = [];
  for (const column of columns) {
    let current: PanelId[] = [], used = 0;
    for (const id of column) {
      if (!(id in PANELS) || seen.has(id)) continue;
      seen.add(id);
      const size = clampSize(id, sizes[id]);
      if (used + size > ROWS && current.length) { out.push(current); current = []; used = 0; }
      current.push(id);
      used += size;
    }
    if (current.length) out.push(current);
  }
  return out;
}

/** A saved arrangement, with any panel added since it was saved placed as
 *  the default places it (hidden ones stay hidden). The first saves were a
 *  bare list of columns and knew the first four panels. */
function load(): { columns: PanelId[][]; sizes: Sizes } {
  try {
    const raw = JSON.parse(remembered(KEY) ?? "null");
    const saved = Array.isArray(raw) ? { columns: raw, seen: ["earned", "heat", "distraction", "log"], sizes: {} } : raw;
    if (saved && Array.isArray(saved.columns) && saved.columns.every(Array.isArray)) {
      const sizes: Sizes = saved.sizes ?? {};
      const fresh = DEFAULT.map((c) => c.filter((id) => !saved.seen?.includes(id))).filter((c) => c.length);
      return { columns: tidy([...saved.columns, ...fresh], sizes), sizes };
    }
  } catch { /* the default, below */ }
  return { columns: DEFAULT.map((c) => [...c]), sizes: {} };
}

class Arrangement {
  #start = load();
  columns = $state<PanelId[][]>(this.#start.columns);
  sizes = $state<Sizes>(this.#start.sizes);
  hidden = $derived((Object.keys(PANELS) as PanelId[]).filter((id) => !this.columns.some((c) => c.includes(id))));

  /** Its height in thirds. */
  size(id: PanelId): number { return clampSize(id, this.sizes[id]); }
  #used(column: PanelId[]): number { return column.reduce((n, id) => n + this.size(id), 0); }

  #set(next: PanelId[][]) {
    this.columns = tidy(next, this.sizes);
    remember(KEY, JSON.stringify({ columns: this.columns, sizes: this.sizes, seen: Object.keys(PANELS) }));
  }
  #where(id: PanelId): [number, number] {
    const col = this.columns.findIndex((c) => c.includes(id));
    return [col, col < 0 ? -1 : this.columns[col].indexOf(id)];
  }

  /** Into the column before (-1) or after (+1), at its bottom, if there's
   *  room; past either end it starts a new column. */
  sideways(id: PanelId, by: -1 | 1) {
    const [col] = this.#where(id);
    if (col < 0) return;
    const next = this.columns.map((c) => c.filter((p) => p !== id));
    const to = col + by;
    if (to < 0) next.unshift([id]);
    else if (to >= next.length) next.push([id]);
    else if (this.#used(next[to]) + this.size(id) <= ROWS) next[to].push(id);
    // No room: a column of its own between the two, or, if it was alone
    // (so that would be where it already is), past the neighbour.
    else {
      const alone = next[col].length === 0;
      next.splice(by > 0 ? (alone ? to + 1 : to) : alone ? to : to + 1, 0, [id]);
    }
    this.#set(next);
  }
  /** Whether it fits in column `col` (leaving its own place, if it's there). */
  fits(id: PanelId, col: number): boolean {
    const column = this.columns[col];
    return !column || this.#used(column.filter((p) => p !== id)) + this.size(id) <= ROWS;
  }
  /** Where a dragged panel goes: into column `col` at position `at`, or a new
   *  last column when `col` is past the end. */
  place(id: PanelId, col: number, at: number) {
    const next = this.columns.map((c) => c.filter((p) => p !== id));
    if (col >= next.length) next.push([id]);
    else next[col].splice(Math.min(at, next[col].length), 0, id);
    this.#set(next);
  }
  /** Two panels trade places (a drag onto one the same height). */
  swap(a: PanelId, b: PanelId) {
    this.#set(this.columns.map((c) => c.map((p) => (p === a ? b : p === b ? a : p))));
  }
  /** A dragged panel as a column of its own, before column `col`. */
  column(id: PanelId, col: number) {
    const next = this.columns.map((c) => c.filter((p) => p !== id));
    next.splice(col, 0, [id]);
    this.#set(next);
  }
  /** Up (-1) or down (+1) past its neighbour in the column. */
  shift(id: PanelId, by: -1 | 1) {
    const [col, at] = this.#where(id);
    const to = at + by;
    if (col < 0 || to < 0 || to >= this.columns[col].length) return;
    this.#set(this.columns.map((c, i) => {
      if (i !== col) return c;
      const out = [...c];
      [out[at], out[to]] = [out[to], out[at]];
      return out;
    }));
  }
  /** A new height in thirds; anything it pushes out of its column moves to a new column after it. */
  resize(id: PanelId, thirds: number) {
    this.sizes = { ...this.sizes, [id]: clampSize(id, thirds) };
    this.#set(this.columns);
  }
  hide(id: PanelId) {
    this.#set(this.columns.map((c) => c.filter((p) => p !== id)));
  }
  /** Back in, as a column of its own at the end. */
  show(id: PanelId) {
    this.#set([...this.columns, [id]]);
  }
  reset() {
    this.sizes = {};
    this.#set(DEFAULT.map((c) => [...c]));
  }
}

export const arrangement = new Arrangement();
