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
  /** The current Day, "2026-10-07"; it starts when Curfew ends. */
  day: string;
  /** Vouchers earned this Day, forfeited ones included. */
  goalDone: number;
  goalTarget: number;
  streakDays: number;
  sources: SourceProgress[];
  /** Today's log, newest first. */
  log: Entry[];
  /** When the running Unlock's Vouchers began (Unix seconds), and how many were torn. */
  unlockStartedAt: number | null;
  unlockVouchers: number;
  /** Minutes a tear could still add before Curfew; null from older Ledgers. */
  curfewRoomMinutes: number | null;
  /** Colours chosen on Rules, by source id. */
  sourceColors: Record<string, string>;
  /** Names of the switched-on blocklists. */
  blocklists: string[];
}

export type SourceKind = "tasks" | "workout" | "focus" | "steps";

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
  /** `tickets` is the Ledger's stored name for the Vouchers torn. */
  | { kind: "redeemed"; at: string; tickets: number; minutes: number }
  /** An Enforcer stopped checking in from `at` until `until`. */
  | { kind: "gap"; at: string; device: string; until: string };

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
  /** False without usage access: minutes are unknown, opens are still counted. */
  measured: boolean;
  /** Minutes in foreground per Distraction app today, most first. */
  apps: { label: string; minutes: number }[];
  /** Times a paused app was opened today, and how many of those ended without a tear. */
  blockedOpens: number;
  closedWithoutTearing: number;
  /** Opens of each paused app today, most first. */
  attempts: { label: string; count: number }[];
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
  sources: Record<string, { kind: SourceKind; on: boolean; every: number; packages: string[]; max_heart_rate?: number; color?: string }>;
  blocklists: Record<string, Blocklist>;
  released_devices: string[];
}

export interface Status {
  bank: number;
  curfew_active: boolean;
  settings: Settings;
  pending: Pending[];
  today: DaySummary;
  /** What went wrong with each polled source's last check, such as "sign-in expired". */
  source_errors: Record<string, string>;
  /** False until first-run setup finishes; until then changes apply at once. */
  setup_complete: boolean;
  /** The first Day with any history; Trends scrolls back no further. Older Ledgers omit it. */
  first_day?: string;
  /** The oldest Day whose hour-by-hour log is kept. */
  log_first_day?: string;
}

export interface BlockedApp { package: string; label: string; note: string | null; on: boolean; added: boolean }
export interface BlockedSite { site: string; note: string | null; on: boolean; added: boolean }
export interface Blocklist { name: string; color: string; premade: boolean; on: boolean; apps: BlockedApp[]; sites: BlockedSite[] }
