// How each Activity source is named and coloured everywhere in the app. Every
// source is a group the Ledger names (Tasks, Reading, …); a log entry names
// its source by prefix (`reading:…`), or by its service (`todoist:…`) for
// tasks. A colour chosen on Rules replaces the default.
import { custom } from "./colors.svelte";
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
const groupOf = (id: string) => (SERVICES[id] ? "tasks" : id);

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
