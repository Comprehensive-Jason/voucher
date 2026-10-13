// Short messages at the spot. When something the user just did doesn't go
// through (a change the Ledger turned down, a tear, a Marker, an export), a
// small danger-toned bubble says so beside what they tapped, then fades after
// a few seconds; a tap dismisses it sooner. One shows at a time: a new one
// replaces it. components/Toast.svelte draws it, mounted once in the layout.
// Connection trouble is never a toast: the Ledger notice already says it
// (lib/health.svelte.ts), so `actionFailed` leaves those to it.
import { shownByNotice } from "./health.svelte";

export type Flash = {
  id: number;
  text: string;
  /** An optional caps line above the text. */
  cap?: string;
  /** The raw error, for the bubble's tooltip. */
  detail?: string;
  /** What it points at, or null for the bottom-centre spot above the tab bar. */
  anchor: Element | null;
};

export const toast = $state<{ current: Flash | null }>({ current: null });

/** A tap counts as "what was just tapped" for this long: a Ledger answer
 *  can take a moment, but a message shouldn't land by something tapped
 *  minutes ago. */
const RECENT_TAP_MS = 15_000;
let lastTap: { el: Element; at: number } | null = null;
if (typeof window !== "undefined") {
  // Capture, so a control that stops the event still counts.
  window.addEventListener("pointerdown", (e) => {
    // The control tapped (a card, a chip, a switch), not the word inside it.
    if (e.target instanceof Element) lastTap = { el: e.target.closest("button, a, input, select, textarea, label, [role=slider], [role=button]") ?? e.target, at: Date.now() };
  }, { capture: true });
}

/** Where a message points: the element given, else the one just tapped (or
 *  focused, for a keyboard), if it's still on screen. */
function anchorFor(given?: Element | null): Element | null {
  const onScreen = (el: Element | null | undefined): el is Element => {
    if (!el?.isConnected) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom > 0 && r.top < innerHeight;
  };
  if (onScreen(given)) return given;
  if (lastTap && Date.now() - lastTap.at < RECENT_TAP_MS && onScreen(lastTap.el)) return lastTap.el;
  const focused = document.activeElement;
  if (focused && focused !== document.body && onScreen(focused)) return focused;
  return null;
}

let next = 0;
/** Shows a short message by `anchor` (or what was just tapped). */
export function flash(text: string, anchor?: Element | null, options: { cap?: string; detail?: string } = {}) {
  if (typeof document === "undefined") return;
  toast.current = { id: ++next, text, anchor: anchorFor(anchor), ...options };
}

/** Takes the message down (a tap on it, or its time ran out). */
export function dismiss(id?: number) {
  if (!id || toast.current?.id === id) toast.current = null;
}

/** An action failed: a short message at the spot, so a tap always gets an
 *  answer. Connection trouble says so plainly (the Ledger notice, where one
 *  is in view, says the rest); anything else says `text`. Returns true. */
export function actionFailed(error: unknown, text: string, anchor?: Element | null): boolean {
  const detail = String(error).replace(/^Error: /, "");
  flash(shownByNotice(detail) ? "Can't reach the Ledger right now. Try again when it's back." : text, anchor, { detail });
  return true;
}
