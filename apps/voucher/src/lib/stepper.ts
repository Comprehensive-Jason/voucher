// What a dated card's switcher shows and does for the shared Day: one Day,
// week, month, or year back or forward, never past today or before the card's
// oldest Day. CardHead draws it.
import { periodLabel, shiftDay } from "./time";

export type Unit = "day" | "week" | "month" | "year";
/** A dated card's Day, today, how far back it goes, what one step is, and what to do with the Day it moves to. */
export type DateProps = { day: string; today: string; oldest?: string; unit?: Unit; onpick: (day: string) => void };

const isDay = (d: string) => /^\d{4}-\d{2}-\d{2}$/.test(d);

/** The same day of the month `n` months away, kept inside that month. */
function shiftMonth(d: string, n: number) {
  const [y, m, dd] = d.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  first.setUTCDate(Math.min(dd, last));
  return first.toISOString().slice(0, 10);
}

/** The switcher's label, arrows, and steps, plus the Today button; null until the card has its Days. */
export function stepper({ day, today, oldest, unit = "day", onpick }: DateProps) {
  if (!isDay(day) || !isDay(today)) return null;
  const step = (n: number) => {
    const next = unit === "day" ? shiftDay(day, n) : unit === "week" ? shiftDay(day, 7 * n) : shiftMonth(day, unit === "year" ? 12 * n : n);
    return next > today ? today : next;
  };
  const label = periodLabel(unit, day, today);
  const current = label === "Today" || label === "This week" || label === "This month" || label === "This year";
  const atStart = !!oldest && isDay(oldest) && (unit === "day" ? day <= oldest : periodLabel(unit, oldest, today) === label);
  return {
    nav: { label, back: !atStart, forward: !current, onback: () => onpick(step(-1)), onforward: () => onpick(step(1)) },
    today: { show: day !== today, onclick: () => onpick(today) },
  };
}
