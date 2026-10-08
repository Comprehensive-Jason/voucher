// The Today screen's live state, shared by the phone screen and the tablet's
// first column: the Ledger's latest answer, a one-second clock for the Unlock
// countdown, and a poll every 30 seconds.
import { today, tear } from "./api";
import { modeOf, type Today } from "./types";

/** How often to ask the Ledger again. A dev build asks every few seconds, so
 *  changes made while testing show up almost at once. */
export const POLL_MS = import.meta.env.DEV ? 3_000 : 30_000;

export class Live {
  data = $state<Today | null>(null);
  error = $state<string | null>(null);
  now = $state(Math.floor(Date.now() / 1000));
  mode = $derived(this.data ? modeOf(this.data, this.now) : "locked");
  /** The Unlock end we've already refreshed for, so it happens once. */
  #refreshedFor: number | null = null;

  refresh = async () => {
    try { this.data = await today(); this.error = null; } catch (e) { this.error = String(e); }
  };

  tear = async (count: number) => {
    try { this.data = await tear(count); this.error = null; } catch (e) { this.error = String(e); }
  };

  /** Starts the clock and the poll; returns the function that stops them. */
  start(): () => void {
    this.refresh();
    const tick = setInterval(() => {
      this.now = Math.floor(Date.now() / 1000);
      const end = this.data?.unlockEndsAt;
      // Ask the Ledger again as soon as an Unlock runs out, even if a tick was late.
      if (end && this.now >= end && this.#refreshedFor !== end) {
        this.#refreshedFor = end;
        this.refresh();
      }
    }, 1000);
    const poll = setInterval(this.refresh, POLL_MS);
    return () => { clearInterval(tick); clearInterval(poll); };
  }
}
