// Arithmetic shared by the Trends cards. History arrives oldest first,
// today last; today is still going, so most cards leave it out of averages.
import type { DayTotal } from "./types";

/** The average of each run of `n` values ending at each point (shorter at the start). */
export function rolling(values: number[], n: number): number[] {
  return values.map((_, i) => {
    const run = values.slice(Math.max(0, i - n + 1), i + 1);
    return run.reduce((a, b) => a + b, 0) / run.length;
  });
}

export function median(values: number[]): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/** The value `q` of the way up the sorted values (0 to 1). */
export function quantile(values: number[], q: number): number {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b), at = (s.length - 1) * q, lo = Math.floor(at);
  return s[lo] + (s[Math.min(lo + 1, s.length - 1)] - s[lo]) * (at - lo);
}

/** Runs of goal Days in a row: their lengths and last Days, oldest first.
 *  Today counts only once its goal is met. */
export function goalRuns(history: DayTotal[]): { length: number; end: string }[] {
  const out: { length: number; end: string }[] = [];
  let run = 0;
  history.forEach((d, i) => {
    if (d.goal_met) run++;
    const last = i === history.length - 1;
    if ((!d.goal_met || last) && run) {
      out.push({ length: run, end: d.goal_met ? d.day : history[i - 1].day });
      run = 0;
    }
  });
  return out;
}

export const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const monthOf = (day: string) => MONTHS[Number(day.slice(5, 7)) - 1];
/** "10:42" from hours after midnight (10.7). */
export const clockOfHours = (h: number) => `${String(Math.floor(h) % 24).padStart(2, "0")}:${String(Math.round((h % 1) * 60) % 60).padStart(2, "0")}`;
/** Monday of the week holding `day`. */
export const mondayOf = (day: string) => {
  const d = new Date(`${day}T12:00:00Z`);
  return new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * 86_400_000).toISOString().slice(0, 10);
};
