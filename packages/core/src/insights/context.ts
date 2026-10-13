// What every Insights generator reads, and the small helpers they share.
import type { Context as MeasureContext } from "../beforeAfter";
import { blocklistOf } from "../blocklists";
import { minutesIntoDay } from "../time";
import type { Blocklist, DayTotal, Marker, Pending, Settings } from "../types";
import type { Experiment } from "./types";

export type Context = {
  /** Finished Days, oldest first: today is still going, so it's left out. */
  days: DayTotal[];
  /** The current Day, and its totals so far (records count it). */
  today: string;
  current: DayTotal | null;
  /** The Ledger's clock, and when its Day starts and Curfew starts, in minutes after midnight. */
  timeZone: string;
  dayStart: number;
  curfewStart: number;
  blocklists: Record<string, Blocklist>;
  markers: Marker[];
  /** The rules now and the changes waiting, for suggestions; null where an app can't change rules. */
  settings: Settings | null;
  pending: Pending[];
  experiments: Experiment[];
};

/** Minutes from a Day's start to a moment, on the Ledger's clock. */
export const into = (ctx: Context, at: string, day: string) => minutesIntoDay(at, day, ctx.timeZone, ctx.dayStart / 60);

/** The Context Before and after's measures take. */
export const measureContext = (ctx: Context): MeasureContext => ({
  timeZone: ctx.timeZone, startHour: ctx.dayStart / 60,
  // Late: the hour before Curfew, and Curfew itself.
  lateFrom: ((ctx.curfewStart - 60 - ctx.dayStart) % 1440 + 1440) % 1440,
  listed: (app, d) => listOf(ctx, app, d) !== undefined,
});

/** The blocklist an app or site counted on that Day, as Distraction time counts it. */
export function listOf(ctx: Context, app: string, d: DayTotal): string | undefined {
  const said = d.used_lists?.[app];
  return said && ctx.blocklists[said] ? said : blocklistOf(app, ctx.blocklists);
}

export const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
export const sd = (xs: number[]) => {
  if (xs.length < 2) return NaN;
  const m = mean(xs);
  return Math.sqrt(xs.reduce((a, x) => a + (x - m) ** 2, 0) / (xs.length - 1));
};
export const known = <T>(xs: (T | null | undefined)[]): T[] => xs.filter((x): x is T => x !== null && x !== undefined && !(typeof x === "number" && Number.isNaN(x)));
/** A signed number with a real minus: "+40", "−3". */
export const signed = (v: number, digits = 0) => `${v < 0 ? "−" : "+"}${Math.abs(v).toFixed(digits).replace(/\.0+$/, "")}`;
export const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** A small seeded generator (mulberry32), so the same Days always give the same shuffles. */
export function random(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** A seed from some text (FNV-1a). */
export function seedOf(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 0x01000193);
  return h >>> 0;
}
