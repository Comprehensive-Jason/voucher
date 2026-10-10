// Curfew's hours, for charts that shade them. A Day runs from 06:00 to
// 06:00, and Vouchers earned during Curfew still count, so hourly charts show
// all 24 hours with Curfew's in the night colour. The pages set these from
// the Ledger's settings.
export const curfew = $state({ start: 22, end: 6 });

/** Sets Curfew's hours from the Ledger's "22:00:00"-style times. */
export function setCurfew(start: string | undefined, end: string | undefined) {
  if (start) curfew.start = Number(start.slice(0, 2)) + Number(start.slice(3, 5)) / 60;
  if (end) curfew.end = Number(end.slice(0, 2)) + Number(end.slice(3, 5)) / 60;
}

/** Whether most of clock hour `h` (0 to 23) falls in Curfew. */
export function inCurfew(h: number): boolean {
  const mid = h + 0.5;
  return curfew.start > curfew.end ? mid >= curfew.start || mid < curfew.end : mid >= curfew.start && mid < curfew.end;
}
