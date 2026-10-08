// App icons from the device, fetched once each (a few at a time) and shared
// by every list that shows them. Null means the device has no icon for it.
import { appIcon } from "./api";

export const icons = $state<Record<string, string | null>>({});

const asked = new Set<string>();
const waiting: string[] = [];
let running = 0;

/** Starts fetching an app's icon, unless it has been asked for already. */
export function wantIcon(pkg: string) {
  if (asked.has(pkg)) return;
  asked.add(pkg);
  // Windows programs and "Every game" have no Android icon.
  if (pkg.startsWith("win:") || pkg.includes(":")) { icons[pkg] = null; return; }
  waiting.push(pkg);
  pump();
}

function pump() {
  while (running < 4 && waiting.length) {
    const pkg = waiting.shift()!;
    running++;
    appIcon(pkg).then((src) => { icons[pkg] = src; }).finally(() => { running--; pump(); });
  }
}
