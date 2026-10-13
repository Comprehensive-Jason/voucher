// Counterfoil's cards: every panel its dashboard can show, the default order,
// and the one arrangement of them this device keeps
// ($core/arrangement.svelte.ts). What each card is for and how to read it is
// in lib/about.ts. None yet: the first ones come over from Voucher.
import { createArrangement, type Panel } from "$core/arrangement.svelte";
import { APP } from "./app";

export type PanelId = never;

export const PANELS: Record<PanelId, Panel> = {};

const DEFAULT: PanelId[] = [];

export const arrangement = createArrangement<PanelId>({
  panels: PANELS,
  order: DEFAULT,
  app: APP,
  key: "dashboard-arrangement",
});
