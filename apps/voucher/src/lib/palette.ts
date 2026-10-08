// The colours a source or blocklist can be drawn in: thirty picked so the
// closest two still differ clearly (a smallest OKLab difference of 0.113),
// spanning dark to light and grey to vivid. Nothing neon, nothing near the
// Voucher green, and nothing too dark to see on the app's surfaces. Rows run
// light to dark; each row runs around the colour wheel, greys last. Made by
// a max-min search over OKLCH (see the git log for the method).
export interface Swatch { color: string; name: string }

export const PALETTE: Swatch[][] = [
  [{ color: "#fea845", name: "Light amber" }, { color: "#e1df5d", name: "Light olive" }, { color: "#b0ba56", name: "Olive 1" }, { color: "#38f7db", name: "Light teal" }, { color: "#01d3f8", name: "Light sky" }, { color: "#acb8fe", name: "Light indigo" }, { color: "#df8ee7", name: "Magenta 1" }, { color: "#fec0f7", name: "Light magenta" }, { color: "#cfa5a9", name: "Muted red" }, { color: "#c2d7ce", name: "Light cool grey" }],
  [{ color: "#d38147", name: "Orange" }, { color: "#8b9347", name: "Olive 2" }, { color: "#188d7c", name: "Deep teal 1" }, { color: "#46b3a8", name: "Teal" }, { color: "#069ce4", name: "Blue" }, { color: "#9587ef", name: "Indigo" }, { color: "#b05baa", name: "Magenta 2" }, { color: "#ea7290", name: "Red" }, { color: "#bb475d", name: "Deep red" }, { color: "#908999", name: "Grey" }],
  [{ color: "#853901", name: "Deep orange" }, { color: "#a46305", name: "Deep amber" }, { color: "#5d6312", name: "Deep olive" }, { color: "#0c6567", name: "Deep teal 2" }, { color: "#0276ae", name: "Deep blue 1" }, { color: "#264ba4", name: "Deep blue 2" }, { color: "#6d5cbf", name: "Deep indigo" }, { color: "#6e328d", name: "Deep violet" }, { color: "#76596e", name: "Deep muted magenta" }, { color: "#8f204f", name: "Deep rose" }],
];

export const COLORS = PALETTE.flat().map((s) => s.color);
