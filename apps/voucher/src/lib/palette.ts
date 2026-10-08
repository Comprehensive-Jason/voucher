// The colours a source or blocklist can be drawn in: eleven hues, each light,
// medium, and deep, tuned to read on the app's dark surfaces. The Voucher
// green itself is left out so nothing is mistaken for a Voucher.
export const PALETTE: { hue: string; tones: [string, string, string] }[] = [
  { hue: "Red", tones: ["#ff9a8f", "#ff6b5b", "#d94a3d"] },
  { hue: "Orange", tones: ["#ffb27a", "#ff8a5c", "#e0662f"] },
  { hue: "Amber", tones: ["#ffd27f", "#f0b03f", "#c98a1e"] },
  { hue: "Yellow", tones: ["#ffe38a", "#ffd166", "#d9b13d"] },
  { hue: "Lime", tones: ["#c6ef7d", "#9be36d", "#6fbf45"] },
  { hue: "Teal", tones: ["#7fe6d2", "#3fcdb4", "#24a08a"] },
  { hue: "Sky", tones: ["#9adfff", "#7fd1ff", "#3fa9e0"] },
  { hue: "Blue", tones: ["#9cc2ff", "#5b9cff", "#3a74e0"] },
  { hue: "Indigo", tones: ["#b3bcff", "#7d8cff", "#5a63e0"] },
  { hue: "Violet", tones: ["#d2bdff", "#b08cff", "#8a5fe8"] },
  { hue: "Pink", tones: ["#ffb3d4", "#ff6fa8", "#e5609b"] },
];

export const COLORS = PALETTE.flatMap((p) => p.tones);
