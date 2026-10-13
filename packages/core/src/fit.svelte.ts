// On the tablet each panel sits in a slot of fixed height (thirds of a
// column) and fills it: charts redraw to the slot's shape and lists scroll
// inside. On a phone panels take their natural height. The tablet's page
// turns this on for everything inside it.
import { getContext, setContext } from "svelte";

const KEY = Symbol("fit");
/** Call from the page whose panels sit in fixed slots. */
export const fillSlots = () => setContext(KEY, true);
/** Whether this panel fills a fixed slot. */
export const fitsSlot = (): boolean => getContext<boolean>(KEY) ?? false;

/** A chart's drawing height for a box `w` by `h` on a 600-wide drawing, so
 *  the drawing keeps its text size and fills the box; `fallback` without one. */
export function drawHeight(w: number, h: number, fallback: number, min = 90): number {
  return w > 0 && h > 0 ? Math.max(min, (600 * h) / w) : fallback;
}
