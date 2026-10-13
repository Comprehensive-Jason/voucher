// The colors a source or blocklist can be drawn in: 8 hues and a grey, each
// light, medium, and deep. Every row is one OKLCH band: light at lightness
// 86% and chroma about 0.09, medium at 68% and 0.16, deep at 57% and 0.10,
// with each swatch tuned within its band to stay clear. The columns keep
// their hues (188, 224, 248, 309, 334, 4, 54, 121), spread as evenly as the
// free arcs allow, since the semantic colors own the reds, gold's hue,
// green, and the violets. Two tiers of clearance, in ΔE2000: at least 15
// from the hard set (Voucher green, gold, salmon, crimson, danger, and the
// Activity steps), which share shapes with sources; at least 12 from the
// soft set (Marker, sleep, Curfew, calendar, Mostly), which always draw as
// flags, bands, or thin lines. Light purple and Pale rose sit 13.5 and 13.2
// from the Marker, and Deep blue 14.9 from Curfew. Every swatch reads at
// 3:1 on --raised. dev/palette-test.mjs checks all of this.
export interface Swatch { color: string; name: string }

export const PALETTE: Swatch[][] = [
  [{ color: "#76e0d6", name: "Light teal" }, { color: "#7dd9fb", name: "Light cyan" }, { color: "#acd6ff", name: "Light blue" }, { color: "#f698fe", name: "Light orchid" }, { color: "#f4b3ec", name: "Light purple" }, { color: "#f1c5e0", name: "Pale rose" }, { color: "#e3cbb1", name: "Pale orange" }, { color: "#c1d58a", name: "Light olive" }, { color: "#c8cbce", name: "Light grey" }],
  [{ color: "#05afa5", name: "Teal" }, { color: "#0ca8d1", name: "Cyan" }, { color: "#289ffb", name: "Blue" }, { color: "#b57ae2", name: "Violet" }, { color: "#d26ec1", name: "Purple" }, { color: "#e6688d", name: "Rose" }, { color: "#e2781f", name: "Orange" }, { color: "#8ba60c", name: "Olive" }, { color: "#95999c", name: "Grey" }],
  [{ color: "#088988", name: "Deep teal" }, { color: "#1284a0", name: "Deep cyan" }, { color: "#3c7cb5", name: "Deep blue" }, { color: "#8169a9", name: "Deep violet" }, { color: "#9b6090", name: "Deep purple" }, { color: "#966973", name: "Deep rose" }, { color: "#a5663a", name: "Deep orange" }, { color: "#737f34", name: "Deep olive" }, { color: "#75787b", name: "Deep grey" }],
];

export const COLORS = PALETTE.flat().map((s) => s.color);

export type SwatchName =
  | "Light teal" | "Light cyan" | "Light blue" | "Light orchid" | "Light purple" | "Pale rose" | "Pale orange" | "Light olive" | "Light grey"
  | "Teal" | "Cyan" | "Blue" | "Violet" | "Purple" | "Rose" | "Orange" | "Olive" | "Grey"
  | "Deep teal" | "Deep cyan" | "Deep blue" | "Deep violet" | "Deep purple" | "Deep rose" | "Deep orange" | "Deep olive" | "Deep grey";

const BY_NAME = new Map(PALETTE.flat().map((s) => [s.name, s.color]));

/** A swatch's color by name, so data files name swatches instead of copying hexes. */
export function swatch(name: SwatchName): string {
  const color = BY_NAME.get(name);
  if (!color) throw new Error(`No swatch named ${name}`);
  return color;
}

/** A lettered app tile's color when its icon can't be read: a deep swatch
 *  by the key's hash, so the same app keeps the same tile. */
export function tileTint(key: string): string {
  const deep = PALETTE[2];
  return deep[[...key].reduce((n, c) => n + c.charCodeAt(0), 0) % deep.length].color;
}

/** Old colors a Ledger may still hold, and the swatch each became: the
 *  swatches that moved in the 2026-10 retheme (Dusty violet became Light
 *  orchid, Light blue left the Marker's hue, and the deep row lifted to
 *  read on a box), and the off-palette blocklist defaults that snapped onto
 *  the palette (the premade Games list had Curfew's own indigo). Keys are
 *  lowercase. The Ledger, VoucherColors.kt, and the test portal mirror this map. */
export const LEGACY: Record<string, string> = {
  "#aeccfe": "#acd6ff", "#9890d0": "#f698fe",
  "#05736c": "#088988", "#086e8a": "#1284a0", "#015189": "#3c7cb5", "#7a5589": "#8169a9", "#8e4381": "#9b6090",
  "#874c69": "#966973", "#984b00": "#a5663a", "#5a6c04": "#737f34", "#616467": "#75787b",
  "#e5609b": "#e6688d", "#5bc8ff": "#7dd9fb", "#9be36d": "#c1d58a", "#c3a6ff": "#b57ae2", "#7d8cff": "#d26ec1",
};

/** A saved color as it shows now: the swatch an old one became, or itself. */
export function current(color: string): string;
export function current(color: string | null | undefined): string | null | undefined;
export function current(color: string | null | undefined): string | null | undefined {
  return color ? LEGACY[color.trim().toLowerCase()] ?? color : color;
}

/** The Unlock colour, var(--spend). */
export const SPEND = "#ffa09c";

/** The Daily goal colour, var(--goal). */
export const GOAL = "#ffb547";

/** Whether a colour is too close to salmon to draw a source or blocklist in:
 *  OKLab distance under 0.1. Every swatch clears it; the old rose and
 *  orange swatches and premade colours a Ledger may still hold don't. */
export function nearSpend(color: string): boolean {
  const a = oklab(color), b = oklab(SPEND)!;
  return !!a && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.1;
}

/** Whether a colour is too close to gold, the Daily goal: OKLab distance
 *  under 0.1, or gold's own hue (within 15 degrees) at any lightness, since
 *  a darker or paler gold still reads as gold. Every swatch clears it; the
 *  old amber swatches and the old Workout, Reading, and Moon+ defaults don't. */
export function nearGoal(color: string): boolean {
  const a = oklab(color), b = oklab(GOAL)!;
  if (!a) return false;
  if (Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.1) return true;
  const hue = (c: [number, number, number]) => (Math.atan2(c[2], c[1]) * 180) / Math.PI;
  const turn = Math.abs(((hue(a) - hue(b) + 540) % 360) - 180);
  return turn < 15 && Math.hypot(a[1], a[2]) >= 0.08;
}

function oklab(hex: string): [number, number, number] | null {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  const lin = (c: number) => { c /= 255; return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4; };
  const [r, g, bl] = [lin(n >> 16), lin((n >> 8) & 255), lin(n & 255)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * bl);
  const mm = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * bl);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * bl);
  return [
    0.2104542553 * l + 0.793617785 * mm - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * mm + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * mm - 0.808675766 * s,
  ];
}
