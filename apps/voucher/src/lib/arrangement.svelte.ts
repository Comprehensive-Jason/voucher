// Which panels the tablet shows right of the Today column, and in what
// order. They flow into a row of columns that scrolls sideways: each column is
// three equal rows high, each panel takes one, two, or all three of them, and
// panels pack top to bottom, then left to right, so a column only keeps a gap
// when the next panel is too tall for it. Some panels have one size, others
// can be resized within a range. You arrange them on the tablet itself; the
// arrangement is kept on this device (a phone shows its own layout), and
// anything it can't read falls back to the default.
//
// A card can also offer options (PanelOption): switches or chips it shows in
// Arrange mode beside its size. They're kept with the arrangement, per card,
// and the card reads them wherever it's drawn (arrangement.switchOn,
// arrangement.picked).
import { remember, remembered } from "./storage";

export type PanelId = "earned" | "heat" | "distraction" | "log"
  | "trend" | "when" | "pace" | "runway" | "strength" | "streaks" | "records"
  | "best" | "gooddays" | "replay" | "focus"
  | "verdicts" | "compare" | "reasons"
  | "sleep" | "calendar" | "planned";

/** A choice a card offers in Arrange mode, kept with the arrangement. */
export type PanelOption =
  /** On or off, as a Switch. */
  | { kind: "switch"; id: string; label: string; on: boolean }
  /** Some of a few things, as chips, kept in the order they were picked.
   *  `start` is what's on before any choice and `most` how many may be on
   *  at once, both by the card's height in thirds; past `most`, the ones
   *  picked first stay on. */
  | { kind: "chips"; id: string; label: string; choices: { id: string; label: string }[]; start: (size: number) => string[]; most?: (size: number) => number };

/** A panel's height in thirds of a column: the smallest it can be, the
 *  largest, and where it starts. Equal min and max mean one fixed size. */
export const PANELS: Record<PanelId, { name: string; min: number; max: number; size: number; options?: PanelOption[] }> = {
  earned: { name: "Vouchers earned", min: 2, max: 3, size: 2 },
  heat: { name: "Activity", min: 1, max: 1, size: 1 },
  distraction: { name: "Distraction time", min: 2, max: 3, size: 2 },
  log: { name: "Log", min: 1, max: 3, size: 3 },
  pace: { name: "Pace to goal", min: 1, max: 1, size: 1 },
  trend: { name: "Trend lines", min: 1, max: 1, size: 1 },
  when: { name: "When you earn", min: 1, max: 3, size: 2 },
  runway: { name: "Morning runway", min: 1, max: 3, size: 1 },
  strength: { name: "Habit strength", min: 1, max: 1, size: 1 },
  streaks: { name: "Source streaks", min: 1, max: 3, size: 1 },
  records: { name: "Personal records", min: 1, max: 1, size: 1 },
  best: { name: "Best hours by source", min: 1, max: 3, size: 1 },
  gooddays: { name: "What goes with a good Day", min: 1, max: 3, size: 1 },
  replay: { name: "Replay", min: 1, max: 1, size: 1 },
  focus: { name: "Focus stretches", min: 1, max: 2, size: 1 },
  verdicts: { name: "Goal vs how the Day went", min: 1, max: 1, size: 1 },
  compare: { name: "Before and after", min: 1, max: 2, size: 1 },
  reasons: { name: "Why you unlock", min: 1, max: 1, size: 1 },
  sleep: { name: "Sleep", min: 1, max: 3, size: 1, options: [{
    kind: "chips", id: "columns", label: "Beside each night",
    choices: [{ id: "verdict", label: "Curfew answer" }, { id: "vouchers", label: "Vouchers" }, { id: "distraction", label: "Distraction" }],
    start: (size) => (size === 1 ? ["verdict"] : ["verdict", "vouchers", "distraction"]),
    most: (size) => (size === 1 ? 2 : 3),
  }] },
  calendar: { name: "Calendar load", min: 1, max: 1, size: 1 },
  planned: { name: "Planned vs actual", min: 1, max: 2, size: 1 },
};

/** Thirds in a column. */
export const ROWS = 3;

const DEFAULT: PanelId[] = ["earned", "heat", "distraction", "pace", "log", "when", "trend", "runway", "strength", "records", "streaks", "replay", "planned", "best", "gooddays", "sleep", "calendar", "focus", "verdicts", "compare", "reasons"];
const KEY = "tablet-arrangement";

type Sizes = Partial<Record<PanelId, number>>;
/** Each card's option values, by option id: a switch's on, or chips' picks in order. */
type Choices = Partial<Record<PanelId, Record<string, boolean | string[]>>>;
const clampSize = (id: PanelId, n: unknown) => Math.min(PANELS[id].max, Math.max(PANELS[id].min, Number(n) || PANELS[id].size));
/** Saved sizes a panel still allows. One it no longer does (a card that
 *  once grew to two-thirds and now has one size) is dropped, so the card
 *  starts again from its default rather than at the nearest edge. */
function sizesOf(saved: unknown): Sizes {
  const out: Sizes = {};
  if (!saved || typeof saved !== "object") return out;
  for (const [id, n] of Object.entries(saved)) {
    if (!(id in PANELS)) continue;
    const p = PANELS[id as PanelId];
    if (Number.isInteger(n) && n >= p.min && n <= p.max) out[id as PanelId] = n;
  }
  return out;
}

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
function load(): { order: PanelId[]; sizes: Sizes; choices: Choices } {
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
      return { order, sizes: sizesOf(saved.sizes), choices: saved.choices && typeof saved.choices === "object" ? saved.choices : {} };
    }
  } catch { /* the default, below */ }
  return { order: [...DEFAULT], sizes: {}, choices: {} };
}

class Arrangement {
  #start = load();
  order = $state<PanelId[]>(this.#start.order);
  sizes = $state<Sizes>(this.#start.sizes);
  choices = $state<Choices>(this.#start.choices);
  columns = $derived(flow(this.order, this.sizes));
  hidden = $derived((Object.keys(PANELS) as PanelId[]).filter((id) => !this.order.includes(id)));

  /** Its height in thirds. */
  size(id: PanelId): number { return clampSize(id, this.sizes[id]); }

  #save() {
    remember(KEY, JSON.stringify({ order: this.order, sizes: this.sizes, choices: this.choices, seen: Object.keys(PANELS) }));
  }
  #option(id: PanelId, option: string) { return PANELS[id].options?.find((o) => o.id === option); }
  /** A switch option's state: as chosen, or its default. */
  switchOn(id: PanelId, option: string): boolean {
    const o = this.#option(id, option), saved = this.choices[id]?.[option];
    return typeof saved === "boolean" ? saved : o?.kind === "switch" && o.on;
  }
  /** A chips option's picks at the card's height, in the order picked: as
   *  chosen (the first ones, past what this height allows), or its default. */
  picked(id: PanelId, option: string): string[] {
    const o = this.#option(id, option);
    if (o?.kind !== "chips") return [];
    const size = this.size(id), saved = this.choices[id]?.[option];
    const list = Array.isArray(saved) ? saved.filter((c) => o.choices.some((x) => x.id === c)) : o.start(size);
    return list.slice(0, o.most?.(size) ?? list.length);
  }
  #choose(id: PanelId, option: string, value: boolean | string[]) {
    this.choices = { ...this.choices, [id]: { ...this.choices[id], [option]: value } };
    this.#save();
  }
  setSwitch(id: PanelId, option: string, on: boolean) { this.#choose(id, option, on); }
  /** Picks a chip, or unpicks it; a pick past what the height allows is ignored. */
  toggleChip(id: PanelId, option: string, choice: string) {
    const o = this.#option(id, option), now = this.picked(id, option);
    if (o?.kind !== "chips") return;
    if (now.includes(choice)) this.#choose(id, option, now.filter((c) => c !== choice));
    else if (now.length < (o.most?.(this.size(id)) ?? Infinity)) this.#choose(id, option, [...now, choice]);
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
    this.choices = {};
    this.order = [...DEFAULT];
    this.#save();
  }
}

export const arrangement = new Arrangement();
