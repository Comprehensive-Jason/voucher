// Which panels a dashboard shows right of its first column, and in what
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
//
// Each app names its own panels and default order (Voucher's are in
// lib/cards.ts) and makes one arrangement with createArrangement. The app's
// root layout hands it down with setArrangementContext, so shared code
// (the dashboard, PanelOptions, a card's options) reads it with useArrangement.
import { getContext, setContext } from "svelte";
import { storage } from "./storage";

/** A choice a card offers in Arrange mode, kept with the arrangement. */
export type PanelOption =
  /** On or off, as a Switch. */
  | { kind: "switch"; id: string; label: string; on: boolean }
  /** Some of a few things, as chips, kept in the order they were picked.
   *  `start` is what's on before any choice and `most` how many may be on
   *  at once, both by the card's height in thirds; past `most`, the ones
   *  picked first stay on. */
  | { kind: "chips"; id: string; label: string; choices: { id: string; label: string }[]; start: (size: number) => string[]; most?: (size: number) => number };

/** A panel's name, and its height in thirds of a column: the smallest it can
 *  be, the largest, and where it starts. Equal min and max mean one fixed size. */
export type Panel = { name: string; min: number; max: number; size: number; options?: PanelOption[] };

/** Thirds in a column. */
export const ROWS = 3;

type Sizes<Id extends string> = Partial<Record<Id, number>>;
/** Each card's option values, by option id: a switch's on, or chips' picks in order. */
type Choices<Id extends string> = Partial<Record<Id, Record<string, boolean | string[]>>>;

export class Arrangement<Id extends string> {
  /** Every panel this app has, by id. */
  readonly panels: Record<Id, Panel>;
  readonly #defaults: Id[];
  readonly #remember: (value: string) => void;
  order: Id[];
  sizes: Sizes<Id>;
  choices: Choices<Id>;
  columns: Id[][];
  hidden: Id[];

  constructor(panels: Record<Id, Panel>, defaults: Id[], saved: string | null, remember: (value: string) => void, firstSeen: Id[]) {
    this.panels = panels;
    this.#defaults = defaults;
    this.#remember = remember;
    const start = this.#load(saved, firstSeen);
    this.order = $state(start.order);
    this.sizes = $state(start.sizes);
    this.choices = $state(start.choices);
    this.columns = $derived(this.flow(this.order));
    this.hidden = $derived((Object.keys(this.panels) as Id[]).filter((id) => !this.order.includes(id)));
  }

  #known(id: unknown): id is Id { return typeof id === "string" && id in this.panels; }
  #clamp(id: Id, n: unknown) { const p = this.panels[id]; return Math.min(p.max, Math.max(p.min, Number(n) || p.size)); }
  /** Known panels, each once. */
  #clean(list: unknown[]): Id[] { return [...new Set(list.filter((id) => this.#known(id)))]; }
  /** Saved sizes a panel still allows. One it no longer does (a card that
   *  once grew to two-thirds and now has one size) is dropped, so the card
   *  starts again from its default rather than at the nearest edge. */
  #sizesOf(saved: unknown): Sizes<Id> {
    const out: Sizes<Id> = {};
    if (!saved || typeof saved !== "object") return out;
    for (const [id, n] of Object.entries(saved)) {
      if (!this.#known(id)) continue;
      const p = this.panels[id];
      if (Number.isInteger(n) && (n as number) >= p.min && (n as number) <= p.max) out[id] = n as number;
    }
    return out;
  }
  /** Saved option values of panels this app still has. */
  #choicesOf(saved: unknown): Choices<Id> {
    if (!saved || typeof saved !== "object") return {};
    return Object.fromEntries(Object.entries(saved).filter(([id]) => this.#known(id))) as Choices<Id>;
  }

  /** A saved arrangement, with any panel added since it was saved placed where
   *  the default places it (hidden ones stay hidden), and any panel the app
   *  no longer has left out. Earlier saves kept columns (the first, a bare
   *  list of them, knew only `firstSeen`); their order is read top to bottom,
   *  left to right. */
  #load(text: string | null, firstSeen: Id[]): { order: Id[]; sizes: Sizes<Id>; choices: Choices<Id> } {
    try {
      const raw = JSON.parse(text ?? "null");
      const saved = Array.isArray(raw) ? { columns: raw, seen: firstSeen, sizes: {} } : raw;
      if (saved && (Array.isArray(saved.order) || Array.isArray(saved.columns))) {
        const order = this.#clean(Array.isArray(saved.order) ? saved.order : saved.columns.flat());
        const seen: string[] = saved.seen ?? [];
        const defaults = this.#defaults;
        for (const id of defaults) {
          if (seen.includes(id) || order.includes(id)) continue;
          // After the panel the default puts before it, or first.
          const before = defaults.slice(0, defaults.indexOf(id)).reverse().find((p) => order.includes(p));
          order.splice(before ? order.indexOf(before) + 1 : 0, 0, id);
        }
        return { order, sizes: this.#sizesOf(saved.sizes), choices: this.#choicesOf(saved.choices) };
      }
    } catch { /* the default, below */ }
    return { order: [...this.#defaults], sizes: {}, choices: {} };
  }

  /** Panels in order into columns: each joins the current column if it fits,
   *  otherwise starts the next. */
  flow(order: Id[]): Id[][] {
    const out: Id[][] = [];
    let current: Id[] = [], used = 0;
    for (const id of order) {
      const size = this.#clamp(id, this.sizes[id]);
      if (used + size > ROWS && current.length) { out.push(current); current = []; used = 0; }
      current.push(id);
      used += size;
    }
    if (current.length) out.push(current);
    return out;
  }

  /** Its height in thirds. */
  size(id: Id): number { return this.#clamp(id, this.sizes[id]); }

  #save() {
    this.#remember(JSON.stringify({ order: this.order, sizes: this.sizes, choices: this.choices, seen: Object.keys(this.panels) }));
  }
  #option(id: Id, option: string) { return this.panels[id].options?.find((o) => o.id === option); }
  /** A switch option's state: as chosen, or its default. */
  switchOn(id: Id, option: string): boolean {
    const o = this.#option(id, option), saved = this.choices[id]?.[option];
    return typeof saved === "boolean" ? saved : o?.kind === "switch" && o.on;
  }
  /** A chips option's picks at the card's height, in the order picked: as
   *  chosen (the first ones, past what this height allows), or its default. */
  picked(id: Id, option: string): string[] {
    const o = this.#option(id, option);
    if (o?.kind !== "chips") return [];
    const size = this.size(id), saved = this.choices[id]?.[option];
    const list = Array.isArray(saved) ? saved.filter((c) => o.choices.some((x) => x.id === c)) : o.start(size);
    return list.slice(0, o.most?.(size) ?? list.length);
  }
  #choose(id: Id, option: string, value: boolean | string[]) {
    this.choices = { ...this.choices, [id]: { ...this.choices[id], [option]: value } };
    this.#save();
  }
  setSwitch(id: Id, option: string, on: boolean) { this.#choose(id, option, on); }
  /** Picks a chip, or unpicks it; a pick past what the height allows is ignored. */
  toggleChip(id: Id, option: string, choice: string) {
    const o = this.#option(id, option), now = this.picked(id, option);
    if (o?.kind !== "chips") return;
    if (now.includes(choice)) this.#choose(id, option, now.filter((c) => c !== choice));
    else if (now.length < (o.most?.(this.size(id)) ?? Infinity)) this.#choose(id, option, [...now, choice]);
  }
  /** Where a dragged panel goes: position `at` among the others. */
  move(id: Id, at: number) {
    const rest = this.order.filter((p) => p !== id);
    rest.splice(Math.max(0, Math.min(at, rest.length)), 0, id);
    this.order = rest;
    this.#save();
  }
  /** A new height in thirds; the panels after it flow on from there. */
  resize(id: Id, thirds: number) {
    this.sizes = { ...this.sizes, [id]: this.#clamp(id, thirds) };
    this.#save();
  }
  hide(id: Id) {
    this.order = this.order.filter((p) => p !== id);
    this.#save();
  }
  /** Back in, at the end. */
  show(id: Id) {
    this.order = [...this.order.filter((p) => p !== id), id];
    this.#save();
  }
  reset() {
    this.sizes = {};
    this.choices = {};
    this.order = [...this.#defaults];
    this.#save();
  }
}

/** An app's arrangement of its panels, kept on this device under
 *  `${app}:${key}`. `order` is the default: every panel shown, in that
 *  order. `firstSeen` is what the oldest saves (a bare list of columns) knew. */
export function createArrangement<Id extends string>({ panels, order, app, key, firstSeen = [] }: {
  panels: Record<Id, Panel>; order: Id[]; app: string; key: string; firstSeen?: Id[];
}): Arrangement<Id> {
  const { remember, remembered } = storage(app);
  return new Arrangement(panels, order, remembered(key), (value) => remember(key, value), firstSeen);
}

const CONTEXT = Symbol("arrangement");
/** Call from the app's root layout, so everything under it can useArrangement. */
export const setArrangementContext = <Id extends string>(arrangement: Arrangement<Id>) => setContext(CONTEXT, arrangement);
/** The app's arrangement, from its root layout. */
export function useArrangement<Id extends string = string>(): Arrangement<Id> {
  const a = getContext<Arrangement<Id> | undefined>(CONTEXT);
  if (!a) throw new Error("useArrangement: no arrangement; call setArrangementContext in the root layout");
  return a;
}
