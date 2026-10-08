// Names and colours of the sources, kept by the Ledger so every device draws a
// source the same way. Anything that draws a source reads them through
// sources.ts, so a rename or a new colour shows everywhere at once.
export const custom = $state<{ sources: Record<string, string>; names: Record<string, string> }>({ sources: {}, names: {} });

import { untrack } from "svelte";

type Named = { name?: string | null; color?: string | null };

/** Takes names and chosen colours from the Ledger's settings (a map by id),
 *  Today's sources (a list with ids), or the desktop's colour map. */
export function rememberSources(sources: Record<string, Named | string> | (Named & { id: string })[]) {
  const entries: [string, Named | string][] = Array.isArray(sources) ? sources.map((s) => [s.id, s]) : Object.entries(sources);
  const colors: Record<string, string> = {};
  // Callers run inside effects: reading what this writes would make them
  // rerun forever, so the old names are read untracked.
  const names: Record<string, string> = untrack(() => ({ ...custom.names }));
  for (const [id, v] of entries) {
    const color = typeof v === "string" ? v : v?.color;
    if (color) colors[id] = color;
    if (typeof v !== "string" && v?.name) names[id] = v.name;
  }
  // Only a real change is written, so nothing redraws for nothing.
  const same = (a: Record<string, string>, b: Record<string, string>) => JSON.stringify(a) === JSON.stringify(b);
  untrack(() => {
    if (!same(custom.sources, colors)) custom.sources = colors;
    if (!same(custom.names, names)) custom.names = names;
  });
}
