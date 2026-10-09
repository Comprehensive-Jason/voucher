// Every animation's timing and easing, in one place. CSS reads them as
// variables on the root (set in +layout.svelte: --t-quick, --t-base,
// --t-move, --t-slow, --t-emphasis, --ease-out, --ease-in); Svelte
// transitions, flips, and timers import them from here. Change a value here
// and every animation of that kind changes with it.
import { cubicIn, cubicOut } from "svelte/easing";
import { slide } from "svelte/transition";

/** Durations in ms, by what kind of change they're for. */
export const MOTION = {
  /** Small state flips: a switch, a button press. */
  quick: 150,
  /** Things appearing, leaving, or changing colour: notices, pills, crossfades, a scrim. */
  base: 250,
  /** Things moving to a new place: rows sorting, sheets and pages sliding, bars and cells filling. */
  move: 380,
  /** Slower arrivals and departures: a Voucher dropping in, a full bar fading as it's spent. */
  slow: 600,
  /** One-off flourishes: the ping ring, the flash on a filled bar. */
  emphasis: 900,
  /** The gap between neighbours moving one after another, such as Bank cells. */
  stagger: 60,
} as const;

/** Easing curves: out for things arriving or settling, in for things leaving. */
export const EASE = {
  out: "cubic-bezier(.2, .8, .2, 1)",
  in: "cubic-bezier(.4, 0, .8, .4)",
} as const;
export const easeOut = cubicOut;
export const easeIn = cubicIn;

/** Whether the person asked their device for less motion. */
export const reduced = () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/** A duration from MOTION, or 0 when the device asks for less motion. */
export const ms = (kind: keyof typeof MOTION) => (reduced() ? 0 : MOTION[kind]);

/** The CSS variables for the root element. */
export function motionVars(): string {
  const r = reduced();
  return Object.entries(MOTION).map(([k, v]) => `--t-${k}: ${r ? 1 : v}ms`).join("; ")
    + `; --ease-out: ${EASE.out}; --ease-in: ${EASE.in}`;
}

/** A notice or card appearing or being dismissed. In a column ("y") it opens
 *  out and fades in, or folds away and fades out, so the cards below follow
 *  smoothly. In a row ("x"), where its width is shared out, it fades and
 *  grows in place instead. */
export function reveal(node: Element, { axis = "y" as "x" | "y", duration = ms("base") } = {}) {
  if (axis === "x") return { duration, easing: easeOut, css: (t: number) => `opacity: ${t}; transform: scale(${0.96 + 0.04 * t})` };
  const s = slide(node, { axis, duration, easing: easeOut });
  return { ...s, css: (t: number, u: number) => `${s.css?.(t, u) ?? ""}; opacity: ${t}` };
}
