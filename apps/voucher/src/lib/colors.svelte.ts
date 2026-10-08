// Names and colours of the sources, kept by the Ledger so every device draws a
// source the same way. Anything that draws a source reads them through
// sources.ts, so a rename or a new colour shows everywhere at once.
export const custom = $state<{ sources: Record<string, string>; names: Record<string, string> }>({ sources: {}, names: {} });

type Named = { name?: string | null; color?: string | null };

/** Takes names and chosen colours from the Ledger's settings (a map by id),
 *  Today's sources (a list with ids), or the desktop's colour map. */
export function rememberSources(sources: Record<string, Named | string> | (Named & { id: string })[]) {
  const entries: [string, Named | string][] = Array.isArray(sources) ? sources.map((s) => [s.id, s]) : Object.entries(sources);
  const colors: Record<string, string> = {};
  const names: Record<string, string> = { ...custom.names };
  for (const [id, v] of entries) {
    const color = typeof v === "string" ? v : v?.color;
    if (color) colors[id] = color;
    if (typeof v !== "string" && v?.name) names[id] = v.name;
  }
  custom.sources = colors;
  custom.names = names;
}
