// The Today screen's live state, shared by the phone screen and the tablet's
// first column: the Ledger's latest answer, a one-second clock for the Unlock
// countdown, and a poll every 30 seconds.
import { today, tear } from "$core/api";
import { modeOf, type Today } from "$core/types";
import { actionFailed } from "$core/toast.svelte";

/** How often to ask the Ledger again. A dev build asks every few seconds, so
 *  changes made while testing show up almost at once. */
export const POLL_MS = import.meta.env.DEV ? 3_000 : 30_000;

/** The last answer any screen showed, so a screen opened again (back from
 *  Rules, say) starts from it instead of blank while it asks again. */
let lastData: Today | null = null;

export class Live {
  data = $state<Today | null>(lastData);
  error = $state<string | null>(null);
  now = $state(Math.floor(Date.now() / 1000));
  mode = $derived(this.data ? modeOf(this.data, this.now) : "locked");
  /** The Unlock end we've already refreshed for, so it happens once. */
  #refreshedFor: number | null = null;

  // Requests can overlap (a slow answer, then the next poll), and answers can
  // come back out of order. An older answer arriving late would set the
  // screen back: a source that just earned would earn again a moment later,
  // replaying its fill and drop. So each answer is numbered by when it was
  // asked, and one asked before the answer on screen is dropped.
  #asked = 0;
  #shown = 0;

  refresh = async () => {
    const n = ++this.#asked;
    try {
      const data = await today();
      if (n < this.#shown) return;
      this.#shown = n; this.data = lastData = data; this.error = null;
    } catch (e) { if (n >= this.#shown) this.error = String(e); }
  };

  /** Tears `count` Vouchers off; true if the Ledger took it. One it turns
   *  down says so by the stack, as a short message ($core/toast.svelte.ts);
   *  connection trouble is the Ledger notice's, and stays in `error`. */
  tear = async (count: number): Promise<boolean> => {
    try {
      const data = await tear(count);
      // A tear's answer is the newest there is: polls still on their way were
      // asked before it landed, so they're dropped.
      this.#shown = ++this.#asked; this.data = lastData = data; this.error = null;
      this.tornAt = Date.now();
      return true;
    } catch (e) {
      if (!actionFailed(e, "Couldn't tear: the Ledger said no.")) this.error = String(e);
      return false;
    }
  };
  /** When this screen last unlocked, for the "Why now?" chips (0: not yet). */
  tornAt = $state(0);

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
