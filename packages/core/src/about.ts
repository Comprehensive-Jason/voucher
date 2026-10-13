// How a card explains itself while arranging: what it's for and how to read
// it, with colored words. Each app writes its own explanations with
// defineAbout (Voucher's are in its lib/about.ts); components/AboutText.svelte
// shows a line of one.
//
// A color, or a mark the card always draws in one color (the gold Daily goal
// line, a Marker's flag, Curfew's shading, a salmon Unlock), is written
// {hue:words}, and the explanation shows those words in that color. Hues are
// the keys of HUES; an unknown one fails type-check. Neutral outlines and
// rings aren't marked unless the text names their color ("gray", "ink").
import { swatch } from "./palette";

/** Each hue's color on the card (`mark`, its theme token) and as 13px text on
 *  --surface (`text`, at least 4.5:1). The dark ones use their -text token,
 *  a lighter tint of the same OKLCH hue: crimson (5.0:1, token 3.1:1), the
 *  danger red (5.0:1, token 4.49:1), sleep (5.0:1, token 3.0:1), and
 *  calendar (5.0:1, token 3.4:1). `sources` has no one color: the words
 *  get a band of source colors under them instead. */
export const HUES = {
  green: { mark: "var(--voucher)", text: "var(--voucher)" },
  mostly: { mark: "var(--mostly-ink)", text: "var(--mostly-ink)" },
  gold: { mark: "var(--goal)", text: "var(--goal)" },
  salmon: { mark: "var(--spend)", text: "var(--spend)" },
  crimson: { mark: "var(--worse)", text: "var(--worse-text)" },
  red: { mark: "var(--danger)", text: "var(--danger-text)" },
  marker: { mark: "var(--marker)", text: "var(--marker)" },
  sleep: { mark: "var(--sleep)", text: "var(--sleep-text)" },
  calendar: { mark: "var(--calendar)", text: "var(--calendar-text)" },
  night: { mark: "var(--night)", text: "var(--night)" },
  gray: { mark: "var(--muted)", text: "var(--muted)" },
  ink: { mark: "var(--ink)", text: "var(--ink)" },
  sources: { mark: `linear-gradient(90deg, ${swatch("Teal")}, ${swatch("Blue")}, ${swatch("Violet")}, ${swatch("Rose")}, ${swatch("Olive")})`, text: "var(--ink)" },
} as const;
export type Hue = keyof typeof HUES;

/** How the colored words look: "text" colors the words themselves; "mark"
 *  keeps them in ink on a soft wash of the color, with a solid underline in
 *  it. One switch for every card. */
export const HIGHLIGHT = "mark" as "text" | "mark";

export type About = {
  /** The question the card answers, in a sentence or two. */
  for: string;
  /** What its marks, colors, numbers, and controls mean, one short point each. */
  read: readonly string[];
};

/** A piece of explanation text: plain, or in a hue. */
export type Run = { text: string; hue?: Hue };

const RUN = /\{(\w+):([^{}]+)\}/g;

/** Splits "{gold:dashed gold line}" markup into runs. */
export function runs(text: string): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(RUN)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push(m[1] in HUES ? { text: m[2], hue: m[1] as Hue } : { text: m[2] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// Type-level check of the markup: every {key:words} must name a hue.
type Unknown<S extends string> = S extends `${string}{${infer K}:${string}}${infer Rest}` ? (K extends Hue ? never : K) | Unknown<Rest> : never;
type Checked<S> = S extends string ? ([Unknown<S>] extends [never] ? S : `Unknown hue "${Unknown<S>}"`) : S;
type CheckAll<T> = { [P in keyof T]: { for: T[P] extends { for: infer F } ? Checked<F> : never; read: T[P] extends { read: infer R extends readonly string[] } ? { [I in keyof R]: Checked<R[I]> } : never } };
/** An app's explanations, one per panel id, with their color markup checked:
 *  `defineAbout<PanelId>()({ ... })`. A missing panel or an unknown hue fails
 *  type-check; in dev, a stray brace is reported in the console too. */
export function defineAbout<Id extends string>() {
  return function checked<const T extends Record<Id, About>>(t: T & CheckAll<T>): Record<Id, About> {
    if (import.meta.env?.DEV) for (const a of Object.values<About>(t)) for (const line of [a.for, ...a.read]) {
      const left = line.replace(RUN, (m, k: string) => (k in HUES ? "" : m));
      if (/[{}]/.test(left)) console.error(`about.ts: bad color markup in "${line}"`);
    }
    return t;
  };
}
