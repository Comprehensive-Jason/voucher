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
