// The Day and span (Day, Week, or Month) the Trends cards show, shared: pick
// a Day or switch to Week on one card and every other card that can show it
// follows (the two bar graphs, the Activity grid, the Log, When you earn,
// Replay, Pace to goal), and they report back the same way.
export type Span = "day" | "week" | "month";

type Patch = Partial<{ day: string | null; span: Span; picked: boolean }>;

class Selection {
  /** The Day in view; null means today, and keeps meaning today as the date changes. */
  day = $state<string | null>(null);
  span = $state<Span>("day");
  /** Whether that Day was picked (a bar or a cell), not just scrolled to. */
  picked = $state(false);
  /** The card that made the last change, which doesn't follow its own change. */
  from = $state("");
  /** Bumped on every change, for cards to follow. */
  seq = $state(0);

  /** Changes what's shown, on behalf of card `from`; a change to nothing is ignored. */
  set(from: string, patch: Patch) {
    let changed = false;
    if (patch.day !== undefined && patch.day !== this.day) { this.day = patch.day; changed = true; }
    if (patch.span !== undefined && patch.span !== this.span) { this.span = patch.span; changed = true; }
    if (patch.picked !== undefined && patch.picked !== this.picked) { this.picked = patch.picked; changed = true; }
    if (!changed) return;
    this.from = from;
    this.seq++;
  }
}

export const selection = new Selection();
