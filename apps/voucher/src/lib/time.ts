// Dates and times for display. The Ledger sends moments in UTC; they are shown
// on the Ledger's clock (its time zone), in 24-hour time.

/** "2026-10-07" shifted by `days`. */
export function shiftDay(day: string, days: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** "15:20" for a moment, on `timeZone`'s clock. */
export function clock(at: string, timeZone: string): string {
  return new Intl.DateTimeFormat("en-GB", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone })
    .format(new Date(at));
}

/** The hour (0 to 23) of a moment on `timeZone`'s clock. */
export function hourOf(at: string, timeZone: string): number {
  return Number(clock(at, timeZone).slice(0, 2));
}

/** "Today", "Yesterday", "Two days ago", or the date with its weekday. */
export function dayLabel(day: string, today: string): string {
  if (day === today) return "Today";
  if (day === shiftDay(today, -1)) return "Yesterday";
  if (day === shiftDay(today, -2)) return "Two days ago";
  const weekday = new Date(`${day}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", timeZone: "UTC" });
  return `${weekday} ${day}`;
}

/** Days to fetch so twelve week-columns start on a Monday and end with `today`. */
export function twelveWeeks(today: string): number {
  const weekday = (new Date(`${today}T12:00:00Z`).getUTCDay() + 6) % 7;
  return 77 + weekday + 1;
}
