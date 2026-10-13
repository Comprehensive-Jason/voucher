// Insights: every kind of finding from the history, ranked. The Good Day
// comparison is the one heavy part, so it runs in the worker
// (correlateOff.ts) and its findings come in separately; everything else
// here takes a millisecond or two on the main thread.
import { MIN_N } from "../correlate";
import type { GoodDaySetup } from "../goodDays";
import { styleOf } from "../sources";
import type { Context } from "./context";
import { experimentFindings, markerFindings } from "./experiments";
import { goalFitFindings, lateFindings, unlistedFindings } from "./patterns";
import { plannedFindings } from "./planned";
import { rank } from "./rank";
import { lapseFindings, recordFindings } from "./records";
import { shiftFindings } from "./shifts";
import { suggest } from "./suggest";
import type { Dismissal, Finding } from "./types";

export type { Context } from "./context";
export { correlationFindings } from "./correlations";

/** Finished Days it takes to know the usual, before which the card shows how far along it is. */
export const FIRST_DAYS = 14;

/** Every finding but the correlations, which come from the worker. */
export function cheapFindings(ctx: Context): Finding[] {
  if (ctx.days.length < FIRST_DAYS) return [];
  const shifts = shiftFindings(ctx);
  // Late Distraction as a pattern only when no shift already says it.
  const late = shifts.some((f) => f.id === "shift:late" || (f.id === "shift:distraction" && f.sentence.some((r) => r.text.includes(" after ")))) ? [] : lateFindings(ctx);
  return [
    ...shifts, ...late, ...plannedFindings(ctx), ...unlistedFindings(ctx), ...goalFitFindings(ctx),
    ...markerFindings(ctx), ...experimentFindings(ctx), ...recordFindings(ctx), ...lapseFindings(ctx),
  ];
}

/** The findings to show, best first: with suggestions where `suggestions`
 *  (Voucher; Counterfoil only reads), without what dismissals hide, and
 *  without the finding an open Experiment came from. */
export function insights(ctx: Context, cheap: Finding[], correlations: Finding[], dismissed: Record<string, Dismissal>, { suggestions = true } = {}): Finding[] {
  const open = new Set(ctx.experiments.filter((e) => e.status === "running" || e.status === "ready").map((e) => e.finding));
  let all = [...cheap, ...(ctx.days.length < FIRST_DAYS ? [] : correlations)].filter((f) => !open.has(f.id));
  if (!suggestions) all = all.filter((f) => f.experiment === undefined);
  else all = suggest(all, ctx);
  return rank(all, dismissed);
}

/** One meter of the empty state: what a kind of finding waits on. */
export type Meter = { name: string; color: string; n: number; of: number; label: string };

/** How far along the history is, for the empty state. */
export function waiting(ctx: Context, setup: GoodDaySetup | null): { left: number; on: number; meters: Meter[] } {
  const on = ctx.days.length + 1, n = Math.min(ctx.days.length, FIRST_DAYS);
  const meters: Meter[] = [
    { name: "Shifts", color: "var(--muted)", n, of: FIRST_DAYS, label: `Day ${n} of ${FIRST_DAYS}` },
    { name: "Planned time", color: "var(--muted)", n, of: FIRST_DAYS, label: `Day ${n} of ${FIRST_DAYS}` },
  ];
  // The Good Day drivers nearest to having enough Days each way.
  const drivers = (setup?.dayDrivers ?? [])
    .map((d) => ({ d, withN: d.did.filter((x) => x === 1).length, withoutN: d.did.filter((x) => x === 0).length }))
    .filter((x) => x.withN + x.withoutN > 0)
    .sort((a, b) => Math.min(b.withN, b.withoutN) - Math.min(a.withN, a.withoutN))
    .slice(0, 2);
  for (const { d, withN, withoutN } of drivers) {
    const short = Math.min(withN, withoutN), side = withoutN < withN ? "without" : "with";
    const color = d.id.startsWith("~") ? setup?.doerOf.get(d.id)?.color ?? "var(--muted)" : styleOf(d.id).color;
    meters.push({ name: d.name, color, n: Math.min(short, MIN_N), of: MIN_N, label: `${Math.min(short, MIN_N)} of ${MIN_N} Days ${side}` });
  }
  return { left: Math.max(0, FIRST_DAYS - ctx.days.length), on, meters };
}
