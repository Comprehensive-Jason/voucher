// What each of Counterfoil's cards is for and how to read it, shown inside
// the card while arranging. One entry per panel in lib/cards.ts' PANELS; the
// hues and the {hue:words} markup are in $core/about.ts.
import type { PanelId } from "./cards";
import { defineAbout } from "$core/about";

export const ABOUT = defineAbout<PanelId>()({});
