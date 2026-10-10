// The colours a source or blocklist can be drawn in: 9 hues and a grey, each
// light, medium, and deep. Every column is one OKLCH hue at matched lightness,
// so rows read as families. Hues are spaced evenly (about 37 degrees) with two
// gaps: one around the Voucher green, and one centred on salmon, the Unlock
// colour, with rose and orange 25 degrees either side of it (30 from purple
// and amber). Lightness can't keep salmon apart, since it sits between the
// light and medium rows, so the hue gap does: every swatch is at least 0.103
// from it in OKLab. The closest two swatches differ by 0.051.
export interface Swatch { color: string; name: string }

export const PALETTE: Swatch[][] = [
  [{ color: "#76e0d6", name: "Light teal" }, { color: "#7dd9fb", name: "Light cyan" }, { color: "#aeccfe", name: "Light blue" }, { color: "#d1bfff", name: "Light violet" }, { color: "#f3b2e6", name: "Light purple" }, { color: "#ffb1c3", name: "Light rose" }, { color: "#feb98c", name: "Light orange" }, { color: "#e9c57d", name: "Light amber" }, { color: "#c1d58a", name: "Light olive" }, { color: "#c8cbce", name: "Light grey" }],
  [{ color: "#05afa5", name: "Teal" }, { color: "#0ca8d1", name: "Cyan" }, { color: "#5c96fa", name: "Blue" }, { color: "#a480ee", name: "Violet" }, { color: "#d26ec1", name: "Purple" }, { color: "#e6688d", name: "Rose" }, { color: "#e2781f", name: "Orange" }, { color: "#c08f08", name: "Amber" }, { color: "#8ba60c", name: "Olive" }, { color: "#95999c", name: "Grey" }],
  [{ color: "#05736c", name: "Deep teal" }, { color: "#086e8a", name: "Deep cyan" }, { color: "#3561ac", name: "Deep blue" }, { color: "#6c50a3", name: "Deep violet" }, { color: "#8e4381", name: "Deep purple" }, { color: "#9d3d5b", name: "Deep rose" }, { color: "#984b00", name: "Deep orange" }, { color: "#7e5d02", name: "Deep amber" }, { color: "#5a6c04", name: "Deep olive" }, { color: "#616467", name: "Deep grey" }],
];

export const COLORS = PALETTE.flat().map((s) => s.color);

/** The Unlock colour, var(--spend). */
export const SPEND = "#ff8a7a";

/** Whether a colour is too close to salmon to draw a source or blocklist in:
 *  OKLab distance under 0.1. Every swatch clears it; the old rose and
 *  orange swatches and premade colours a Ledger may still hold don't. */
export function nearSpend(color: string): boolean {
  const a = oklab(color), b = oklab(SPEND)!;
  return !!a && Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) < 0.1;
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
