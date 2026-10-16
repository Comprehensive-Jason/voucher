// The goals the Ledger keeps (GET /goals), loaded once and shared by the
// Goals card, its editor, and Insights, and the requests that change them.
// The Daily goal changes through POST /change like any rule, so a lower one
// waits for the next Day and leaves a rule Marker; the other goals through
// POST /goal and /goal/remove, at once. A Ledger from before goals doesn't
// know GET /goals; then the list is the Daily goal alone, from the settings.
import { ledger } from "./api";
import { DAILY, type Goal, type NewGoal } from "./goals";

/** The Daily goal as a goal, from the `daily_goal` setting. */
export const dailyGoal = (target: number): Goal => ({ id: DAILY, measure: "vouchers", direction: "at_least", target, period: "day", daily: true, pending: null });

/** When a change takes effect, as POST /change answers: now, or at a moment. */
export type Effect = "Now" | { At: string };

class Goals {
  list = $state<Goal[]>([]);
  /** Whether this Ledger keeps goals at all (false for an older one). */
  kept = $state(true);
  #loading: Promise<void> | null = null;

  /** Loads them once; `again` asks the Ledger afresh. `daily` is the
   *  setting, for a Ledger that doesn't keep goals. */
  load(again = false, daily?: number) {
    if (!this.#loading || again) {
      this.#loading = (async () => {
        try {
          this.list = await ledger<Goal[]>("GET", "/goals");
          this.kept = true;
        } catch {
          this.kept = false;
          if (daily !== undefined) this.list = [dailyGoal(daily)];
        }
      })();
    }
    return this.#loading;
  }

  /** Adds a goal, or edits one with its id. Not the Daily goal: see `setDaily`. */
  async save(g: NewGoal) {
    this.list = await ledger<Goal[]>("POST", "/goal", g);
  }

  async remove(id: string) {
    this.list = await ledger<Goal[]>("POST", "/goal/remove", { id });
  }

  /** Moves the Daily goal, as Rules does: it always starts with the next Day. */
  async setDaily(target: number): Promise<Effect> {
    const effect = await ledger<Effect>("POST", "/change", { DailyGoal: target });
    await this.load(true);
    return effect;
  }
}

export const goals = new Goals();
