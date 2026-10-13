// Whether the app can talk to the Ledger. Every Ledger request reports here
// (lib/api.ts), so one notice can say what's wrong, at the top of Rules'
// notices and on the phone's Today, instead of each card printing the raw
// error. A problem clears as soon as any request gets through.

/** What kind of trouble: the Ledger doesn't answer; it answers but wants the
 *  access code again; or its answers don't parse (the app and the Ledger are
 *  different versions). */
export type LedgerProblem = { kind: "unreachable" | "access" | "version"; detail: string; since: number };

export const health = $state<{ problem: LedgerProblem | null }>({ problem: null });

/** The kind of a Ledger error message, or null for one that isn't about the
 *  connection (a change the Ledger refused, say: that one belongs to its card). */
export function problemKind(message: string): LedgerProblem["kind"] | null {
  if (/^Can't reach the Ledger|^Not connected to a Ledger/.test(message)) return "unreachable";
  if (/access code/.test(message)) return "access";
  if (/^Unexpected Ledger reply/.test(message)) return "version";
  return null;
}

/** A request failed: note it if it's about the connection. */
export function noteFailure(error: unknown) {
  const message = String(error).replace(/^Error: /, "");
  const kind = problemKind(message);
  if (!kind) return;
  if (health.problem?.kind !== kind) health.problem = { kind, detail: message, since: Date.now() };
}

/** A request got through. */
export function noteSuccess() {
  if (health.problem) health.problem = null;
}

/** Whether an error message is one the Ledger notice already shows, so a card
 *  can leave it out instead of printing it again. */
export const shownByNotice = (message: string | null | undefined) => !!message && problemKind(String(message).replace(/^Error: /, "")) !== null;
