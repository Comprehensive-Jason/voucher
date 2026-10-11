// Task-service tokens (Todoist, ClickUp) saved from this device. The Ledger
// keeps reporting the old problem until its next check, so for that long the
// Tasks notice and Sources say the token is in instead of asking for it again.

/** When a token was last saved here, by service. */
const saved = $state<Record<string, number>>({});

/** How long after a save to wait for the Ledger's next check (it checks every 5 minutes). */
const NEXT_CHECK_MS = 6 * 60_000;

export function noteTokenSaved(service: string) {
  saved[service] = Date.now();
}

/** Whether a token for this service was saved here and the Ledger hasn't checked it yet. */
export const tokenPending = (service: string, now = Date.now()) => now - (saved[service] ?? 0) < NEXT_CHECK_MS;

/** A task service whose token is wanted, and why ("sign-in expired", "not
 *  connected"; none when the sheet is opened just to connect it). */
export interface TokenNeed { service: string; problem?: string }

/** The one button that opens the token sheet for all of them: "Connect" when
 *  none was ever connected (or none says), else "Reconnect". */
export const tokenAction = (needs: TokenNeed[]) =>
  needs.length && needs.every((n) => !n.problem || n.problem === "not connected") ? "Connect" : "Reconnect";

/** Names joined for reading: "Todoist", "Todoist and ClickUp", "A, B, and C". */
export const andList = (names: string[]) => new Intl.ListFormat("en-US", { type: "conjunction" }).format(names);
