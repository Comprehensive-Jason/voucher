// The colours a source or blocklist can be drawn in: 9 hues and a grey, each
// light, medium, and deep. Every column is one OKLCH hue at matched lightness,
// so rows read as families; hues are spaced evenly around the wheel, leaving a
// gap around the Voucher green. The closest two differ by 0.054 in OKLab.
export interface Swatch { color: string; name: string }

export const PALETTE: Swatch[][] = [
  [{ color: "#76e0d6", name: "Light teal" }, { color: "#7dd9fb", name: "Light cyan" }, { color: "#aeccfe", name: "Light blue" }, { color: "#d1bfff", name: "Light violet" }, { color: "#f3b2e6", name: "Light purple" }, { color: "#ffb2bc", name: "Light rose" }, { color: "#feb896", name: "Light orange" }, { color: "#e9c57d", name: "Light amber" }, { color: "#c1d58a", name: "Light olive" }, { color: "#c8cbce", name: "Light grey" }],
  [{ color: "#05afa5", name: "Teal" }, { color: "#0ca8d1", name: "Cyan" }, { color: "#5c96fa", name: "Blue" }, { color: "#a480ee", name: "Violet" }, { color: "#d26ec1", name: "Purple" }, { color: "#e86880", name: "Rose" }, { color: "#e57433", name: "Orange" }, { color: "#c08f08", name: "Amber" }, { color: "#8ba60c", name: "Olive" }, { color: "#95999c", name: "Grey" }],
  [{ color: "#05736c", name: "Deep teal" }, { color: "#086e8a", name: "Deep cyan" }, { color: "#3561ac", name: "Deep blue" }, { color: "#6c50a3", name: "Deep violet" }, { color: "#8e4381", name: "Deep purple" }, { color: "#9f3d51", name: "Deep rose" }, { color: "#9c470f", name: "Deep orange" }, { color: "#7e5d02", name: "Deep amber" }, { color: "#5a6c04", name: "Deep olive" }, { color: "#616467", name: "Deep grey" }],
];

export const COLORS = PALETTE.flat().map((s) => s.color);
