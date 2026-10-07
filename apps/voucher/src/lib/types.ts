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
  /** Not provided by the Ledger yet; drawn so the screen is ready for it. */
  sample: {
    goalDone: number;
    goalTarget: number;
    streakDays: number;
    sources: { name: string; detail: string; progress: number; color: string }[];
  };
}

export type Mode = "locked" | "running" | "curfew" | "full" | "empty";

export function modeOf(t: Today, nowSeconds: number): Mode {
  if (t.curfewActive) return "curfew";
  if (t.unlockEndsAt !== null && t.unlockEndsAt > nowSeconds) return "running";
  if (t.bank >= t.bankLimit) return "full";
  if (t.bank === 0) return "empty";
  return "locked";
}
