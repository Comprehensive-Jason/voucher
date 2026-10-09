// A Voucher earned while Today is open plays out on its source's row in
// "Toward the next Voucher": the bar fills, the list scrolls to it, the marker
// pings, and its count turns into "+1 Voucher". The Bank counts it at that
// same moment: until then it holds the new Vouchers back, so the two land
// together instead of the Bank jumping first.
export const wins = $state({ held: 0 });
