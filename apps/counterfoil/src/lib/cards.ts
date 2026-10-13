// Counterfoil's cards: every panel its dashboard can show, the default order,
// and the one arrangement of them this device keeps
// ($core/arrangement.svelte.ts). What each card is for and how to read it is
// in lib/about.ts.
import { createArrangement, type Panel } from "$core/arrangement.svelte";
import { APP } from "./app";

export type PanelId = "sleep" | "calendar" | "gooddays";

export const PANELS: Record<PanelId, Panel> = {
  sleep: { name: "Sleep", min: 1, max: 3, size: 1, options: [{
    kind: "chips", id: "columns", label: "Beside each night",
    choices: [{ id: "verdict", label: "Curfew answer" }, { id: "vouchers", label: "Vouchers" }, { id: "distraction", label: "Distraction" }],
    start: (size) => (size === 1 ? ["verdict"] : ["verdict", "vouchers", "distraction"]),
    most: (size) => (size === 1 ? 2 : 3),
  }] },
  calendar: { name: "Calendar load", min: 1, max: 1, size: 1 },
  gooddays: { name: "What goes with a good Day", min: 1, max: 3, size: 2 },
};

const DEFAULT: PanelId[] = ["sleep", "calendar", "gooddays"];

export const arrangement = createArrangement<PanelId>({
  panels: PANELS,
  order: DEFAULT,
  app: APP,
  key: "dashboard-arrangement",
});
