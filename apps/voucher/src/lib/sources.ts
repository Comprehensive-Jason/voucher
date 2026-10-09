// How each Activity source is named and coloured everywhere in the app. Every
// source is a group the Ledger names (Tasks, Reading, …); a log entry names
// its source by prefix (`reading:…`), or by its service (`todoist:…`) for
// tasks. A colour chosen on Rules replaces the default.
import { custom } from "./colors.svelte";
import type { SourceKind } from "./types";
export interface SourceStyle { name: string; short: string; color: string; sub?: string }

/** Defaults for the sources Voucher ships with, and for ones from before
 *  groups (`readwise`, `moonreader`) that older log entries still name. */
export const SOURCES: Record<string, SourceStyle> = {
  tasks: { name: "Tasks", short: "Tasks", color: "#5b9cff" },
  obsidian: { name: "Obsidian", short: "Obsidian", color: "#b08cff" },
  workout: { name: "Workout", short: "Workout", color: "#ff8a5c" },
  reading: { name: "Reading", short: "Reading", color: "#ffd166" },
  readwise: { name: "Readwise Reader", short: "Reader", color: "#ffd166" },
  moonreader: { name: "Moon+ Reader", short: "Moon+", color: "#e0a82e" },
  anki: { name: "Anki", short: "Anki", color: "#ff6fa8" },
  steps: { name: "Steps", short: "Steps", color: "#05afa5" },
};

/** The task services, members of the Tasks group. */
const SERVICES: Record<string, SourceStyle> = {
  todoist: { name: "Todoist", short: "Todoist", color: "#5b9cff", sub: "your completed tasks" },
  clickup: { name: "ClickUp", short: "ClickUp", color: "#7aa7ff", sub: "assigned to you" },
};

/** Colours for groups the user makes, in the order new ones take them (light
 *  swatches from the palette, so the picker shows them as chosen). */
export const SPARE = ["#7dd9fb", "#c1d58a", "#f3b2e6", "#d1bfff", "#e9c57d", "#76e0d6", "#feb896"];

/** Earnings name a service; they count toward the Tasks group. */
export const groupOf = (id: string) => (SERVICES[id] ? "tasks" : id);

/** The order sources are listed in everywhere (Rules, the hour chart's list,
 *  and its bars from the bottom up): Tasks, Workout, and Steps first, since
 *  they're the ones that aren't time in an app, then the rest by name. */
const PINNED = ["tasks", "workout", "steps"];
export function compareSources(a: { id: string; name: string }, b: { id: string; name: string }): number {
  const rank = (id: string) => (PINNED.includes(id) ? PINNED.indexOf(id) : PINNED.length);
  return rank(a.id) - rank(b.id) || a.name.localeCompare(b.name);
}

export function styleOf(id: string): SourceStyle {
  const key = groupOf(id);
  const known = SOURCES[key];
  const name = custom.names[key];
  const n = [...key].reduce((a, c) => a + c.charCodeAt(0), 0);
  const base = known ?? { name: key.replace(/^app\./, ""), short: key.replace(/^app\./, ""), color: SPARE[n % SPARE.length] };
  // A name set in Rules wins over the shipped one, short form included.
  const named = name && name !== base.name ? { ...base, name, short: name } : base;
  const color = custom.sources[key];
  return color ? { ...named, color } : named;
}

/** A task service (Todoist, ClickUp) by its own name, or any other source. */
export function serviceOf(id: string): SourceStyle {
  return SERVICES[id] ?? styleOf(id);
}

/** The colour a source is drawn in before any choice on Rules. */
export function defaultColorOf(id: string): string {
  const key = groupOf(id);
  return SOURCES[key]?.color ?? SPARE[[...key].reduce((a, c) => a + c.charCodeAt(0), 0) % SPARE.length];
}

export function sourceOf(task: string): SourceStyle {
  return styleOf(task.split(":")[0]);
}

/** Poll problems that a new token fixes, as opposed to a service having a bad moment. */
export function needsToken(problem: string | undefined): boolean {
  return problem === "sign-in expired" || problem === "not connected";
}

/** How far each kind of source's rate can go: tasks, minutes, or steps per Voucher. */
export const RATE_RANGE: Record<SourceKind, { min: number; max: number; step: number }> = {
  tasks: { min: 1, max: 5, step: 1 },
  workout: { min: 5, max: 30, step: 5 },
  focus: { min: 10, max: 120, step: 5 },
  steps: { min: 500, max: 10000, step: 500 },
};

/** "1 per 30 min", "1 per task", "1 per 2,000 steps". */
export function rateText(kind: SourceKind, every: number): string {
  if (kind === "tasks") return every === 1 ? "1 per task" : `1 per ${every} tasks`;
  if (kind === "steps") return `1 per ${every.toLocaleString("en-US")} steps`;
  if (kind === "workout") return `1 per ${every} zone min`;
  return `1 per ${every} min`;
}
