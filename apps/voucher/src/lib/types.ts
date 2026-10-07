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
  sources: Source[];
}

export interface Source {
  name: string;
  detail: string;
  /** 0 to 1 toward the next Voucher. */
  progress: number;
  color: string;
  /** The Ledger can't measure this source yet, so these numbers are made up. */
  sample: boolean;
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
}

/** One Day in the Ledger's `GET /history`. */
export interface DayTotal { day: string; earned: number; redeemed: number; goal_met: boolean }
