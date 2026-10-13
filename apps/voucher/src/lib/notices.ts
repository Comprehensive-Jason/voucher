import { goto } from "$app/navigation";

// Where Rules shows its page-wide notices (Protection off, looser rules
// waiting for the morning, the grace period). true: in the page header, above
// every column (beside the title on the tablet, under the tabs on the phone).
// false: at the top of the Limits column, as before 2026-10-08.
export const NOTICES_IN_HEADER = true;

/** What Voucher's Ledger notice ($core/components/LedgerNotice.svelte) says
 *  and where it reconnects. */
export const LEDGER_NOTICE = {
  app: "Voucher",
  unreachable: "You can't Unlock until it's back, and numbers here may be out of date.",
  reconnect: () => goto("/setup"),
};
