// What the Today screen receives from the app's Rust side (see src-tauri/src/lib.rs).
export interface Today {
  bank: number;
  bankLimit: number;
  unlockMinutes: number;
  /** End of the running Unlock in Unix seconds, if its signature checked out. */
  unlockEndsAt: number | null;
  curfewActive: boolean;
  curfewStart: string;
  curfewEnd: string;
  /** Vouchers earned this Day, forfeited ones included. */
  goalDone: number;
  goalTarget: number;
  streakDays: number;
  sources: SourceProgress[];
}

export type SourceKind = "tasks" | "workout" | "focus";

/** One source's standing today, from the Ledger. */
export interface SourceProgress {
  id: string;
  kind: SourceKind;
  on: boolean;
  /** One Voucher per this many tasks or minutes. */
  every: number;
  /** Tasks or minutes toward the next Voucher. */
  progress: number;
  /** Vouchers earned today. */
  earned: number;
}

export type Mode = "locked" | "running" | "curfew" | "full" | "empty";

export function modeOf(t: Today, nowSeconds: number): Mode {
  if (t.curfewActive) return "curfew";
  if (t.unlockEndsAt !== null && t.unlockEndsAt > nowSeconds) return "running";
  if (t.bank >= t.bankLimit) return "full";
  if (t.bank === 0) return "empty";
  return "locked";
}

/** One line of the Ledger's log. */
export type Entry =
  | { kind: "earned"; at: string; task: string; title: string; kept: boolean }
  | { kind: "redeemed"; at: string; tickets: number; minutes: number };

/** One Day's score and log, from the Ledger's `GET /day`. */
export interface DaySummary {
  day: string;
  earned: number;
  redeemed: number;
  unlocked_minutes: number;
  goal: number;
  goal_met: boolean;
  goal_met_at: string | null;
  streak: number;
  by_source: Record<string, number>;
  /** Newest first. */
  log: Entry[];
  sources: SourceProgress[];
}

/** One Day in the Ledger's `GET /history`. */
export interface DayTotal { day: string; earned: number; redeemed: number; goal_met: boolean }

/** What the phone itself measured today, from the Android side. */
export interface DeviceUsage {
  /** Minutes in foreground per Distraction app today, most first. */
  apps: { label: string; minutes: number }[];
  /** Times a paused app was opened today, and how many of those ended without a tear. */
  blockedOpens: number;
  closedWithoutTearing: number;
}

/** The phone's protection parts, from the Android side. */
export interface Protection {
  /** Voucher is Device Owner: it can pause apps, and can't be uninstalled. */
  deviceOwner: boolean;
  /** Usage access: Focused time and Distraction minutes can be measured. */
  usageAccess: boolean;
  /** The Accessibility service that draws the blocked-app screen. */
  overlay: boolean;
}

/** A pending change as the Ledger sends it: `[change, effective_at]`. */
export type Pending = [Record<string, unknown>, string];

export interface Settings {
  time_zone: string;
  bank_limit: number;
  unlock_minutes: number;
  curfew_start: string;
  curfew_end: string;
  morning_boundary: string;
  daily_goal: number;
  sources: Record<string, { kind: SourceKind; on: boolean; every: number; packages: string[] }>;
  blocklists: Record<string, Blocklist>;
}

export interface Status {
  bank: number;
  curfew_active: boolean;
  settings: Settings;
  pending: Pending[];
  today: DaySummary;
  /** What went wrong with each polled source's last check, such as "sign-in expired". */
  source_errors: Record<string, string>;
}

export interface BlockedApp { package: string; label: string; note: string | null; on: boolean; added: boolean }
export interface BlockedSite { site: string; note: string | null; on: boolean; added: boolean }
export interface Blocklist { name: string; color: string; premade: boolean; on: boolean; apps: BlockedApp[]; sites: BlockedSite[] }
