// A Voucher earned while Today is open plays out on its source's row in
// "Toward the next Voucher": the bar fills, the list scrolls to it, the marker
// pings, and its count turns into "+1 Voucher". The Bank counts it at that
// same moment: until then it holds the new Vouchers back, so the two land
// together instead of the Bank jumping first.
export const wins = $state({
  /** Vouchers the Ledger has counted that the Bank isn't showing yet. */
  held: 0,
  /** Rows saying "+1 Voucher" right now: the Bank's count is green as long as any do. */
  lit: 0,
});

/** How long a row says "+1 Voucher", and the Bank's count stays green with it. */
export const WIN_HOLD_MS = 2400;
