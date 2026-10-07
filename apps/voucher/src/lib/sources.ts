// How each Activity source is named and coloured everywhere in the app. The
// Ledger names a source by id (`todoist`, `obsidian`, …), and each earning by
// its source's prefix (`todoist:…`).
export interface SourceStyle { name: string; short: string; color: string; sub?: string }

export const SOURCES: Record<string, SourceStyle> = {
  tasks: { name: "Tasks", short: "Tasks", color: "#5b9cff" },
  obsidian: { name: "Obsidian", short: "Obsidian", color: "#b08cff" },
  workout: { name: "Workout", short: "Workout", color: "#ff8a5c" },
  readwise: { name: "Readwise Reader", short: "Reader", color: "#ffd166" },
  moonreader: { name: "Moon+ Reader", short: "Moon+", color: "#e0a82e" },
  anki: { name: "Anki", short: "Anki", color: "#ff6fa8" },
};

/** Per-service styles for the Sources page, where Todoist and ClickUp are separate. */
const SERVICES: Record<string, SourceStyle> = {
  todoist: { name: "Todoist", short: "Todoist", color: "#5b9cff", sub: "your completed tasks" },
  clickup: { name: "ClickUp", short: "ClickUp", color: "#7aa7ff", sub: "assigned to you" },
  workout: { name: "Zone minutes", short: "Workout", color: "#ff8a5c", sub: "heart rate" },
};

/** Todoist and ClickUp both count as Tasks. */
const ALIASES: Record<string, string> = { todoist: "tasks", clickup: "tasks" };

/** Colours for apps added as Focused time sources later. */
const SPARE = ["#7fd1ff", "#9be36d", "#ff9ec7", "#c3a6ff", "#ffd27f"];

export function styleOf(id: string): SourceStyle {
  const known = SOURCES[ALIASES[id] ?? id];
  if (known) return known;
  const n = [...id].reduce((a, c) => a + c.charCodeAt(0), 0);
  const name = id.replace(/^app\./, "");
  return { name, short: name, color: SPARE[n % SPARE.length] };
}

export function serviceOf(id: string): SourceStyle {
  return SERVICES[id] ?? styleOf(id);
}

export function sourceOf(task: string): SourceStyle {
  return styleOf(task.split(":")[0]);
}

/** Poll problems that a new token fixes, as opposed to a service having a bad moment. */
export function needsToken(problem: string | undefined): boolean {
  return problem === "sign-in expired" || problem === "not connected";
}
