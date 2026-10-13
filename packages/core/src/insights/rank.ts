// Which findings show, and in what order. Ranked by size times how sure:
// size is about how many of its usual swings a finding moved (insights'
// generators each say theirs), and the bars weigh it: High counts in full,
// Medium 0.8, Low 0.55, and a count with no bars (a record, a lapse) 0.8.
//
// A dismissed finding stays hidden until it changes a lot: its number
// flips sign, or moves by half of what it was when dismissed (and at least
// its floor); a record or a lapse comes back at any new value past its
// floor. Each kind dismissed in the last 90 Days ranks lower: by a fifth for
// each dismissal, down to two fifths.
import type { Dismissal, Finding } from "./types";

const WEIGHT = { 1: 0.55, 2: 0.8, 3: 1 } as const;
const NO_BARS = 0.8, PER_DISMISSAL = 0.8, LOWEST = 0.4, RECENT_MS = 90 * 86_400_000;

/** Whether a dismissed finding is still hidden. */
export function stillHidden(f: Finding, d: Dismissal | undefined): boolean {
  if (!d) return false;
  const flipped = Math.sign(f.value) !== Math.sign(d.value) && Math.abs(f.value) >= f.floor && d.value !== 0;
  const moved = Math.abs(f.value - d.value);
  return !(flipped || moved >= (f.absolute ? f.floor : Math.max(f.floor, Math.abs(d.value) / 2)));
}

/** How much a kind's dismissals lower it. */
export function kindWeights(dismissed: Record<string, Dismissal>, now = Date.now()): Record<string, number> {
  const out: Record<string, number> = {};
  for (const d of Object.values(dismissed)) {
    if (now - Date.parse(d.at) > RECENT_MS) continue;
    out[d.kind] = Math.max(LOWEST, (out[d.kind] ?? 1) * PER_DISMISSAL);
  }
  return out;
}

export const scoreOf = (f: Finding, weights: Record<string, number>) => f.size * (f.confidence ? WEIGHT[f.confidence] : NO_BARS) * (weights[f.kind] ?? 1);

/** The findings to show, best first: not dismissed (or changed a lot since), ranked. */
export function rank(findings: Finding[], dismissed: Record<string, Dismissal>, now = Date.now()): Finding[] {
  const weights = kindWeights(dismissed, now);
  return findings
    .filter((f) => !stillHidden(f, dismissed[f.id]))
    .map((f) => ({ f, score: scoreOf(f, weights) }))
    .sort((a, b) => b.score - a.score || a.f.id.localeCompare(b.f.id))
    .map(({ f }) => f);
}
