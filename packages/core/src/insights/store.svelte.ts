// What the Ledger keeps for Insights (dismissals and Experiments), loaded
// once and shared by the card and its sheets, and the requests that change
// it. A Ledger from before Insights doesn't know GET /insights; then nothing
// is dismissed and nothing is being tried.
import { ledger } from "../api";
import type { Experiment, Finding, InsightsState, Suggestion } from "./types";

class Insights {
  state = $state<InsightsState>({ dismissed: {}, experiments: [] });
  /** Whether this Ledger keeps Insights at all (false for an older one). */
  kept = $state(true);
  #loading: Promise<void> | null = null;

  /** Loads it once; `again` asks the Ledger afresh. */
  load(again = false) {
    if (!this.#loading || again) {
      this.#loading = (async () => {
        try {
          this.state = await ledger<InsightsState>("GET", "/insights");
          this.kept = true;
        } catch { this.kept = false; }
      })();
    }
    return this.#loading;
  }

  async dismiss(f: Finding) {
    this.state = { ...this.state, dismissed: await ledger("POST", "/insights/dismiss", { id: f.id, kind: f.kind, value: f.value }) };
  }

  async undismiss(id: string) {
    this.state = { ...this.state, dismissed: await ledger("POST", "/insights/undismiss", { id }) };
  }

  /** Starts an Experiment from a suggestion: the rule change and its Marker, in one request. */
  async start(s: Suggestion, finding: string): Promise<Experiment> {
    const e = await ledger<Experiment>("POST", "/experiment", { change: s.change, text: s.text, measure: s.measure, finding });
    await this.load(true);
    return e;
  }

  /** Sends a due Experiment's verdict, worked out here, to the Ledger. */
  async judge(id: number, v: { title: string; text: string; outcome: string; back: string }) {
    await ledger("POST", "/experiment/verdict", { id, ...v });
    await this.load(true);
  }

  /** Keep it, Go back, or end early. */
  async end(id: number, keep: boolean) {
    await ledger("POST", "/experiment/end", { id, keep });
    await this.load(true);
  }
}

export const insights = new Insights();
