// Colours chosen for sources on Rules, kept by the Ledger so every device
// draws a source the same way. Anything that draws a source reads them
// through sources.ts, so a change shows everywhere at once.
export const custom = $state<{ sources: Record<string, string> }>({ sources: {} });

/** Takes the chosen colours from the Ledger's settings (or the app's Today). */
export function rememberSourceColors(sources: Record<string, { color?: string | null }> | Record<string, string>) {
  const next: Record<string, string> = {};
  for (const [id, v] of Object.entries(sources)) {
    const color = typeof v === "string" ? v : v?.color;
    if (color) next[id] = color;
  }
  custom.sources = next;
}
