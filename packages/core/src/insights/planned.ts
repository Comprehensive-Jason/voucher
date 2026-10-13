// Planned-time patterns, from the time blocks' splits (PlannedBlock): where
// in the Day lost planned time (Distraction inside a block) falls, and how
// often an Unlock runs into a block.
//
// Where it falls: the last 28 Days' blocks, their minutes and lost minutes
// spread over the hours of the Day, and the two hours holding the most lost
// minutes. How sure: shuffle which blocks lost time (each block keeps its
// hours, and takes another block's share lost), find the two worst hours
// again, and count how often the shuffle puts as many lost minutes in them.
// Taking the worst two hours of each shuffle counts the search for them too,
// so an unlucky stretch of the Day doesn't look like a pattern. It needs 8
// blocks and half an hour lost, and the two hours must hold 40% of it.
import { confidenceOf } from "../correlate";
import type { DayTotal, PlannedBlock } from "../types";
import { clamp, into, random, seedOf, type Context } from "./context";
import { hhmm, intoPlanned, planned as say, when } from "./text";
import type { Confidence, Finding } from "./types";

const SPAN = 28, MIN_BLOCKS = 8, MIN_LOST = 30, MOSTLY = 0.4, SHUFFLES = 999, WIDTH = 2;
/** Unlocks into blocks: how far back, and how many make a pattern. */
const RECENT = 14, MIN_INTO = 3;

type Placed = { start: number; minutes: number; lost: number };

/** Each block's minutes in each hour of the Day it touches, as [hour, minutes]. */
function overlaps(b: Placed): [number, number][] {
  const out: [number, number][] = [];
  for (let h = Math.floor(b.start / 60); h < 24 && h * 60 < b.start + b.minutes; h++) {
    const m = Math.min(b.start + b.minutes, (h + 1) * 60) - Math.max(b.start, h * 60);
    if (m > 0) out.push([h, m]);
  }
  return out;
}

/** Minutes planned and lost in each hour of the Day, each block losing `share(i)` of its minutes. */
function binned(parts: [number, number][][], share: (i: number) => number, lost = new Array<number>(24).fill(0)): number[] {
  lost.fill(0);
  for (let i = 0; i < parts.length; i++) { const f = share(i); for (const [h, m] of parts[i]) lost[h] += m * f; }
  return lost;
}

/** The WIDTH hours with the most lost minutes, and how many. */
function worst(lost: number[]): [number, number] {
  let at = 0, most = -1;
  for (let h = 0; h + WIDTH <= 24; h++) {
    let s = 0;
    for (let k = h; k < h + WIDTH; k++) s += lost[k];
    if (s > most) { most = s; at = h; }
  }
  return [at, most];
}

export function plannedFindings(ctx: Context): Finding[] {
  const out: Finding[] = [];
  const recent = ctx.days.slice(-SPAN);
  // Blocks whose Distraction is known (every reporting device sent spans).
  const blocks: Placed[] = recent.flatMap((d) => (d.distraction_spans == null ? [] : (d.planned ?? []).map((b) => ({ start: Math.max(0, into(ctx, b.start, d.day)), minutes: b.minutes, lost: b.split.distraction }))))
    .filter((b) => b.start < 1440 && b.minutes > 0);
  const total = blocks.reduce((a, b) => a + b.lost, 0);
  if (blocks.length >= MIN_BLOCKS && total >= MIN_LOST) {
    const fractions = blocks.map((b) => b.lost / b.minutes);
    const parts = blocks.map(overlaps);
    const real = { lost: binned(parts, (i) => fractions[i]), planned: binned(parts, () => 1) };
    const [h, most] = worst(real.lost);
    const share = most / total;
    const inPlanned = real.planned.slice(h, h + WIDTH).reduce((a, b) => a + b, 0), allPlanned = real.planned.reduce((a, b) => a + b, 0);
    const rateIn = most / Math.max(1, inPlanned), rateOut = (total - most) / Math.max(1, allPlanned - inPlanned);
    if (share >= MOSTLY && rateIn > rateOut * 1.25) {
      const next = random(seedOf(recent.map((d) => d.day).join()));
      let asMany = 0;
      const order = fractions.map((_, i) => i), scratch = new Array<number>(24).fill(0);
      for (let s = 0; s < SHUFFLES; s++) {
        for (let i = order.length - 1; i > 0; i--) { const k = Math.floor(next() * (i + 1)); [order[i], order[k]] = [order[k], order[i]]; }
        if (worst(binned(parts, (i) => fractions[order[i]], scratch))[1] >= most - 1e-9) asMany++;
      }
      const chance = (1 + asMany) / (1 + SHUFFLES);
      const confidence = confidenceOf(chance) as 0 | Confidence;
      if (confidence) {
        const from = ctx.dayStart + h * 60, to = from + WIDTH * 60;
        const night = Math.floor((((ctx.curfewStart - ctx.dayStart) % 1440) + 1440) % 1440 / 60);
        out.push({
          id: "planned:lost",
          kind: "planned",
          domain: "planned",
          sentence: say(when(from, to, ctx.curfewStart)),
          size: clamp(rateIn / Math.max(0.01, rateOut) - 1, 0, 3),
          confidence,
          pill: { text: `${Math.round(share * 100)}%`, tone: "worse" },
          visual: { kind: "hours", minutes: real.lost, from: h, to: h + WIDTH, night },
          proof: {
            facts: [
              ["Lost planned time, 4 weeks", `${Math.round(total)} min`],
              [`${hhmm(from)} to ${hhmm(to)}`, `${Math.round(most)} min, ${Math.round(rateIn * 100)}% of what was planned then`],
              ["The rest of the Day", `${Math.round(rateOut * 100)}% of what was planned`],
              ["Blocks", String(blocks.length)],
            ],
            note: `Shuffling which blocks lost time put this much in one two-hour stretch ${Math.round(chance * 100)}% of the time.`,
            big: { kind: "hours", minutes: real.lost, from: h, to: h + WIDTH, night, axis: [hhmm(ctx.dayStart), hhmm(from), hhmm(ctx.dayStart)] },
          },
          value: from,
          floor: 120,
        });
      }
    }
  }
  const into_ = unlocksIntoBlocks(ctx);
  if (into_) out.push(into_);
  return out;
}

/** An Unlock open when a block starts, running on into it for 5 minutes or more. */
function runsInto(ctx: Context, d: DayTotal, b: PlannedBlock): boolean {
  const start = Date.parse(b.start);
  return (d.unlocks ?? []).some(([a, z]) => Date.parse(a) < start && Date.parse(z) - start >= 5 * 60_000);
}

/** Unlocks running into planned blocks, 3 or more times in two weeks. How
 *  steadily it happens (how many of those Days) stands in for how sure. */
export function unlocksIntoBlocks(ctx: Context): Finding | null {
  const recent = ctx.days.slice(-RECENT);
  const hits = recent.flatMap((d) => (d.planned ?? []).filter((b) => runsInto(ctx, d, b)).map((b) => ({ d, b })));
  if (hits.length < MIN_INTO) return null;
  const counts = new Array<number>(24).fill(0);
  for (const { d, b } of hits) { const m = into(ctx, b.start, d.day); if (m >= 0 && m < 1440) counts[Math.floor(m / 60)]++; }
  const [h, most] = worst(counts);
  const at = most / hits.length >= 0.5 ? when(ctx.dayStart + h * 60, ctx.dayStart + (h + WIDTH) * 60, ctx.curfewStart) : null;
  const daysHit = new Set(hits.map((x) => x.d.day)).size;
  const night = Math.floor((((ctx.curfewStart - ctx.dayStart) % 1440) + 1440) % 1440 / 60);
  return {
    id: "pattern:into-planned",
    kind: "pattern",
    domain: "unlocks",
    sentence: intoPlanned(at),
    size: clamp(hits.length / 4, 0, 2.5),
    confidence: daysHit >= 6 ? 3 : daysHit >= 4 ? 2 : 1,
    pill: { text: `${hits.length} times`, tone: "worse" },
    visual: { kind: "hours", minutes: counts, from: at ? h : -1, to: at ? h + WIDTH : -1, night },
    proof: {
      facts: [["Blocks an Unlock ran into, 2 weeks", String(hits.length)], ["Days it happened", String(daysHit)]],
      note: "An Unlock counts when it was open as a block started and ran 5 minutes or more into it. The bars say how steadily it happens: on how many Days.",
    },
    value: hits.length,
    floor: 3,
  };
}
