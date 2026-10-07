// How each Activity source is named and coloured everywhere in the app. The
// Ledger names a source by the prefix of what earned (`todoist:…`, `clickup:…`).
export interface SourceStyle { name: string; short: string; color: string }

export const SOURCES: Record<string, SourceStyle> = {
  tasks: { name: "Tasks", short: "Tasks", color: "#5b9cff" },
  obsidian: { name: "Obsidian", short: "Obsidian", color: "#b08cff" },
  workout: { name: "Workout", short: "Workout", color: "#ff8a5c" },
  readwise: { name: "Readwise Reader", short: "Reader", color: "#ffd166" },
  moonreader: { name: "Moon+ Reader", short: "Moon+", color: "#e0a82e" },
  anki: { name: "Anki", short: "Anki", color: "#ff6fa8" },
};

/** Todoist and ClickUp both count as Tasks. */
const ALIASES: Record<string, string> = { todoist: "tasks", clickup: "tasks" };

export function sourceOf(task: string): SourceStyle {
  const prefix = task.split(":")[0];
  return SOURCES[ALIASES[prefix] ?? prefix] ?? { name: prefix, short: prefix, color: "#a3a8ad" };
}
