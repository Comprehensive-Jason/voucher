// Voucher's cards: every panel the tablet's dashboard and the phone's Trends
// pages can show, with its size range and options, the default order, and
// the one arrangement of them this device keeps ($core/arrangement.svelte.ts).
// What each card is for and how to read it is in lib/about.ts.
import { createArrangement, type Panel } from "$core/arrangement.svelte";

export type PanelId = "earned" | "heat" | "distraction" | "log"
  | "trend" | "when" | "pace" | "runway" | "strength" | "streaks" | "records"
  | "best" | "gooddays" | "replay" | "focus"
  | "verdicts" | "compare" | "reasons"
  | "planned";

export const PANELS: Record<PanelId, Panel> = {
  earned: { name: "Vouchers earned", min: 2, max: 3, size: 2 },
  heat: { name: "Activity", min: 1, max: 1, size: 1 },
  distraction: { name: "Distraction time", min: 2, max: 3, size: 2 },
  log: { name: "Log", min: 1, max: 3, size: 3 },
  pace: { name: "Pace to goal", min: 1, max: 1, size: 1 },
  trend: { name: "Trend lines", min: 1, max: 1, size: 1 },
  when: { name: "When you earn", min: 1, max: 3, size: 2 },
  runway: { name: "Morning runway", min: 1, max: 3, size: 1, options: [{ kind: "switch", id: "fromwake", label: "From wake", on: false }] },
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
  planned: { name: "Planned vs actual", min: 1, max: 2, size: 1 },
};

const DEFAULT: PanelId[] = ["earned", "heat", "distraction", "pace", "log", "when", "trend", "runway", "strength", "records", "streaks", "replay", "planned", "best", "gooddays", "focus", "verdicts", "compare", "reasons"];

/** Kept as "voucher:tablet-arrangement", the name it has always had. */
export const arrangement = createArrangement<PanelId>({
  panels: PANELS,
  order: DEFAULT,
  app: "voucher",
  key: "tablet-arrangement",
  // The first saves, a bare list of columns, knew these four.
  firstSeen: ["earned", "heat", "distraction", "log"],
});
