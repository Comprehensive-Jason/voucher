// The Insights card's model: a Finding is one thing the history turned up,
// said in a short sentence (insights/text.ts) beside a small picture, the
// change as a pill, and how sure it is as bars. The generators in this
// folder make them, rank.ts orders them, and the card draws them.
import type { Run } from "../about";
import type { Tested } from "../correlate";
import type { MeasureId } from "../beforeAfter";

/** What kind of finding, which also says what its picture is. */
export type Kind =
  /** What goes with what, from the Good Day comparison (correlate.ts). */
  | "correlation"
  /** This week against the usual weeks before it. */
  | "shift"
  /** Where lost planned time falls in the Day. */
  | "planned"
  /** Something that keeps happening: an app on no blocklist, Unlocks into planned time, goal Days that went badly. */
  | "pattern"
  /** Before and after on a Marker or an Experiment. */
  | "verdict"
  /** A new best. */
  | "record"
  /** Days in a row without the Daily goal, longer than usual. */
  | "lapse";

/** 1 Low, 2 Medium, 3 High. Records and lapses are counts, so they have none. */
export type Confidence = 1 | 2 | 3;

/** The pill's color: green better, crimson worse, gold a record, gray neither. */
export type Tone = "good" | "worse" | "gold" | "neutral";

/** A row's small picture. */
export type Visual =
  /** Days without (hollow, always in the middle) and with (filled), as a ratio. */
  | { kind: "dumbbell"; without: number; with: number; color: string; good: boolean }
  /** The last Days' values: this week's in the change's color, the usual dashed. */
  | { kind: "spark"; values: (number | null)[]; week: number; usual: number; good: boolean }
  /** Before and after a Marker. */
  | { kind: "arrow"; before: number; after: number; labels: [string, string]; good: boolean | null }
  /** Minutes by hour of the Day from its start, the named hours in crimson, Curfew's shaded. */
  | { kind: "hours"; minutes: number[]; from: number; to: number; night: number }
  /** The new best against the old one. */
  | { kind: "record"; old: number; best: number; labels: [string, string] }
  /** The last Days, met or missed, with the run under it. */
  | { kind: "squares"; cells: ("met" | "missed" | "bad" | "good" | "none")[]; run: number };

/** A rule change a finding suggests trying, as the confirm sheet shows it. */
export type Suggestion = {
  /** The Ledger's Change, as POST /change takes it. */
  change: Record<string, unknown>;
  /** What it tries, as the Marker, the row, and the Experiment say it: "Curfew at 21:30". */
  text: string;
  /** The button's words: "Try 21:30". */
  button: string;
  /** The rule's name, and its value now and after: "Curfew", "22:00 to 06:00", "21:30 to 06:00". */
  rule: string;
  was: string;
  now: string;
  /** A Tightening starts at once; anything else at the Morning boundary (the Daily goal on the next Day). */
  tightens: boolean;
  /** The Before and after measure it will be judged on. */
  measure: MeasureId;
  /** What Go back says: "Go back to 22:00". */
  back: string;
};

/** What a row's proof sheet shows besides its picture: facts as label and value. */
export type Proof = {
  facts: [string, string][];
  /** One line about how sure, or what the numbers are, in plain words. */
  note?: string;
  /** A correlation's own finding, drawn on the Good Day ratio scale. */
  tested?: Tested & { unit: "vouchers" | "minutes" | "percent"; up: boolean; color: string; outcome: string };
  /** A bigger picture than the row's, with dates or hours. */
  big?: Visual & { axis?: [string, string, string] };
};

export type Finding = {
  /** Stable across recomputes, so a dismissal holds: "shift:distraction", "cor:workout|~longest|1". */
  id: string;
  kind: Kind;
  /** What it's about: "distraction", "earning", "sleep", "planned", "goal", "focus", "unlocks". */
  domain: string;
  /** The source or blocklist it names, for its color. */
  subject?: { id: string; color: string };
  /** What and when, with colored names (insights/text.ts). */
  sentence: Run[];
  /** How big, in comparable units (about how many usual swings), for ranking. */
  size: number;
  confidence: Confidence | null;
  pill: { text: string; tone: Tone } | null;
  visual: Visual;
  proof: Proof;
  suggestion?: Suggestion;
  /** The finding's number in its own units: a dismissal remembers it, and the
   *  finding comes back once it has changed a lot from it (see rank.ts). */
  value: number;
  /** The least change that counts as a lot, in the same units. */
  floor: number;
  /** Comes back after any change of `floor` or more (a record, a lapse),
   *  rather than one of half its size too. */
  absolute?: boolean;
  /** For an Experiment's verdict, its id. */
  experiment?: number;
};

/** An Experiment as the Ledger keeps it (GET /insights). */
export type Experiment = {
  id: number;
  change: Record<string, unknown>;
  undo: Record<string, unknown>;
  text: string;
  measure: MeasureId;
  finding: string;
  requested_at: string;
  starts_at: string;
  start_day: string;
  settle_days: number;
  measure_days: number;
  verdict_day: string;
  marker_at: string | null;
  status: "running" | "ready" | "kept" | "reverted" | "ended";
  verdict: { title: string; text: string; outcome: "helped" | "unclear" | "worse"; back: string; at: string } | null;
  ended_at: string | null;
};

/** A dismissed finding, as the Ledger keeps it. */
export type Dismissal = { at: string; kind: string; value: number };

/** What GET /insights answers. */
export type InsightsState = { dismissed: Record<string, Dismissal>; experiments: Experiment[] };

/** What only Voucher can do from the card: start, end, and decide Experiments. */
export type Actions = {
  tryIt: (f: Finding) => void;
  experiment: (e: Experiment) => void;
  decide: (e: Experiment, keep: boolean) => Promise<void>;
};
