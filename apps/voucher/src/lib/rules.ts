// Plain-language descriptions of the Ledger's settings changes.
import type { Pending, Settings } from "./types";

/** "22:00:00" → minutes after midnight. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutes after midnight → "22:00:00". */
export const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
export const hhmm = (t: string) => t.slice(0, 5);

export function describe([change]: Pending, s: Settings): string {
  const [kind, v] = Object.entries(change)[0] as [string, any];
  switch (kind) {
    case "UnlockMinutes": return `Unlock length ${s.unlock_minutes} to ${v} min`;
    case "BankLimit": return `Bank limit ${s.bank_limit} to ${v}`;
    case "DailyGoal": return `Daily goal ${s.daily_goal} to ${v}`;
    case "Curfew": return `Curfew becomes ${hhmm(v.start)} to ${hhmm(v.end)}`;
    default: return kind;
  }
}

/** The value a pending change of `kind` will set, if one is waiting. */
export function pendingValue(pending: Pending[], kind: string): any {
  const found = [...pending].reverse().find(([c]) => kind in c);
  return found ? found[0][kind] : null;
}

/** "in 10 h 18 min" until a moment. */
export function until(at: string, now = Date.now()): string {
  const mins = Math.max(0, Math.round((new Date(at).getTime() - now) / 60000));
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? `in ${h} h ${m} min` : `in ${m} min`;
}
