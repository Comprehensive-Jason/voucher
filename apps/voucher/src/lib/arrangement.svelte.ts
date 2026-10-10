// Which panels the tablet shows right of the Today column, and in what
// order. They flow into a row of columns that scrolls sideways: each column is
// three equal rows high, each panel takes one, two, or all three of them, and
// panels pack top to bottom, then left to right, so a column only keeps a gap
// when the next panel is too tall for it. Some panels have one size, others
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

const DEFAULT: PanelId[] = ["earned", "heat", "distraction", "pace", "log", "when", "trend", "runway", "strength", "ladder", "records", "streaks"];
const KEY = "tablet-arrangement";

type Sizes = Partial<Record<PanelId, number>>;
const clampSize = (id: PanelId, n: unknown) => Math.min(PANELS[id].max, Math.max(PANELS[id].min, Number(n) || PANELS[id].size));

/** Panels in order into columns: each joins the current column if it fits,
 *  otherwise starts the next. */
export function flow(order: PanelId[], sizes: Sizes): PanelId[][] {
  const out: PanelId[][] = [];
  let current: PanelId[] = [], used = 0;
  for (const id of order) {
    const size = clampSize(id, sizes[id]);
    if (used + size > ROWS && current.length) { out.push(current); current = []; used = 0; }
    current.push(id);
    used += size;
  }
  if (current.length) out.push(current);
  return out;
}

/** Known panels, each once. */
const clean = (list: unknown[]) => [...new Set(list.filter((id): id is PanelId => typeof id === "string" && id in PANELS))];

/** A saved arrangement, with any panel added since it was saved placed where
 *  the default places it (hidden ones stay hidden). Earlier saves kept
 *  columns (the first, a bare list of them, knew the first four panels);
 *  their order is read top to bottom, left to right. */
function load(): { order: PanelId[]; sizes: Sizes } {
  try {
    const raw = JSON.parse(remembered(KEY) ?? "null");
    const saved = Array.isArray(raw) ? { columns: raw, seen: ["earned", "heat", "distraction", "log"], sizes: {} } : raw;
    if (saved && (Array.isArray(saved.order) || Array.isArray(saved.columns))) {
      const order = clean(Array.isArray(saved.order) ? saved.order : saved.columns.flat());
      const seen: string[] = saved.seen ?? [];
      for (const id of DEFAULT) {
        if (seen.includes(id) || order.includes(id)) continue;
        // After the panel the default puts before it, or first.
        const before = DEFAULT.slice(0, DEFAULT.indexOf(id)).reverse().find((p) => order.includes(p));
        order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
      }
      return { order, sizes: saved.sizes ?? {} };
    }
  } catch { /* the default, below */ }
  return { order: [...DEFAULT], sizes: {} };
}

class Arrangement {
  #start = load();
  order = $state<PanelId[]>(this.#start.order);
  sizes = $state<Sizes>(this.#start.sizes);
  columns = $derived(flow(this.order, this.sizes));
  hidden = $derived((Object.keys(PANELS) as PanelId[]).filter((id) => !this.order.includes(id)));

  /** Its height in thirds. */
  size(id: PanelId): number { return clampSize(id, this.sizes[id]); }

  #save() {
    remember(KEY, JSON.stringify({ order: this.order, sizes: this.sizes, seen: Object.keys(PANELS) }));
  }
  /** Where a dragged panel goes: position `at` among the others. */
  move(id: PanelId, at: number) {
    const rest = this.order.filter((p) => p !== id);
    rest.splice(Math.max(0, Math.min(at, rest.length)), 0, id);
    this.order = rest;
    this.#save();
  }
  /** A new height in thirds; the panels after it flow on from there. */
  resize(id: PanelId, thirds: number) {
    this.sizes = { ...this.sizes, [id]: clampSize(id, thirds) };
    this.#save();
  }
  hide(id: PanelId) {
    this.order = this.order.filter((p) => p !== id);
    this.#save();
  }
  /** Back in, at the end. */
  show(id: PanelId) {
    this.order = [...this.order.filter((p) => p !== id), id];
    this.#save();
  }
  reset() {
    this.sizes = {};
    this.order = [...DEFAULT];
    this.#save();
  }
}

export const arrangement = new Arrangement();
