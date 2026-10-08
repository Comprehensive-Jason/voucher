// Plain-language descriptions of the Ledger's settings changes.
import type { Pending, Settings } from "./types";
import { styleOf } from "./sources";

/** "22:00:00" → minutes after midnight. */
export const minutesOf = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
/** Minutes after midnight → "22:00:00". */
export const timeOf = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}:00`;
export const hhmm = (t: string) => t.slice(0, 5);

/** A source as Rules names it ("Reading", "Tasks"), never its id. */
const sourceName = (id: string) => styleOf(id).name;
/** "45 min", "2 tasks", "15 zone min", "2,000 steps": a source's rate, with its unit. */
function rateOf(id: string, every: number, s: Settings): string {
  switch (s.sources[id]?.kind) {
    case "tasks": return every === 1 ? "task" : `${every} tasks`;
    case "workout": return `${every} zone min`;
    case "steps": return `${every.toLocaleString("en-US")} steps`;
    default: return `${every} min`;
  }
}

export function describe([change]: Pending, s: Settings): string {
  const [kind, v] = Object.entries(change)[0] as [string, any];
  switch (kind) {
    case "UnlockMinutes": return `Unlock length ${s.unlock_minutes} to ${v} min`;
    case "BankLimit": return `Bank limit ${s.bank_limit} to ${v}`;
    case "DailyGoal": return `Daily goal ${s.daily_goal} to ${v}`;
    case "Curfew": return `Curfew becomes ${hhmm(v.start)} to ${hhmm(v.end)}`;
    case "Source": return v.on
      ? (s.sources[v.id]?.on ? `${sourceName(v.id)}: 1 Voucher per ${rateOf(v.id, v.every, s)}` : `${sourceName(v.id)} on, 1 Voucher per ${rateOf(v.id, v.every, s)}`)
      : `${sourceName(v.id)} off`;
    case "AddSource": return `New source: ${v.source.name || sourceName(v.id)}`;
    case "RenameSource": return `Rename ${sourceName(v.id)} to ${v.name}`;
    case "DeleteSource": return `Delete ${sourceName(v)}`;
    case "SourceApps": {
      // Only adding waits, so name what is being added.
      const had = s.sources[v.id]?.packages ?? [];
      const added = (v.packages as string[]).filter((p) => !had.includes(p)).map((p) => v.labels?.[p] ?? p.replace(/^win:/, ""));
      return added.length ? `${sourceName(v.id)} adds ${added.join(", ")}` : `${sourceName(v.id)} counts ${v.packages.length} app${v.packages.length === 1 ? "" : "s"}`;
    }
    case "MaxHeartRate": return `Maximum heart rate ${v}`;
    case "BlocklistOn": return `${s.blocklists[v.id]?.name ?? v.id} blocklist off`;
    case "BlockApp": return `${v.app.label} off in ${s.blocklists[v.list]?.name ?? v.list}`;
    case "BlockSite": return `${v.site.site} off in ${s.blocklists[v.list]?.name ?? v.list}`;
    case "RemoveApp": return `Remove ${v.package.replace(/^win:/, "")} from ${s.blocklists[v.list]?.name ?? v.list}`;
    case "RemoveSite": return `Remove ${v.site} from ${s.blocklists[v.list]?.name ?? v.list}`;
    case "ResetBlocklist": return `Reset ${s.blocklists[v]?.name ?? v}`;
    case "DeleteBlocklist": return `Delete ${s.blocklists[v]?.name ?? v}`;
    case "ReleaseDevice": return `Release ${v}`;
    case "SourceColor": return `${sourceName(v.id)} colour`;
    case "BlocklistColor": return `${s.blocklists[v.id]?.name ?? v.id} colour`;
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
