#!/usr/bin/env node
// Checks the color system's rules (apps/voucher/src/lib/theme.css and
// palette.ts), since the repo has no JS test runner:
//   - every swatch reads at 3:1 on --raised, and sits in its row's OKLCH
//     lightness band;
//   - every swatch is at least 15 ΔE2000 from the hard set (Voucher green,
//     gold, salmon, crimson, danger, and the Activity steps), which share
//     shapes with sources;
//   - every swatch is at least 12 from the soft set (Marker, sleep, Curfew,
//     calendar, Mostly), which draw as flags, bands, or thin lines, and at
//     least 15 except the pairs listed in SOFT_EXCEPTIONS;
//   - every -text token reads at 4.5:1 on --raised and on its own wash;
//   - LEGACY maps old colors onto current swatches, and its mirrors (the
//     Ledger, VoucherColors.kt, the test portal) and VoucherColors.kt's
//     tokens agree with the app.
// Run: node dev/palette-test.mjs. Exits 1 on any failure.
import { readFileSync } from "node:fs";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

// ---- Color math: sRGB, OKLab, CIELAB, CIEDE2000, WCAG contrast ----
const lin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const delin = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const rgb = (hex) => { const n = parseInt(hex.slice(1), 16); return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255]; };
const hexOf = (c) => "#" + c.map((v) => Math.round(Math.min(1, Math.max(0, v)) * 255).toString(16).padStart(2, "0")).join("");
function oklab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
function fromOklab([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3, m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3, s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return hexOf([4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s].map((v) => delin(Math.min(1, Math.max(0, v)))));
}
/** color-mix(in oklab, a p, b) */
const mixOklab = (a, b, p) => { const x = oklab(a), y = oklab(b); return fromOklab(x.map((v, i) => v * p + y[i] * (1 - p))); };
/** color-mix(in srgb, a p, b) */
const mixSrgb = (a, b, p) => { const x = rgb(a), y = rgb(b); return hexOf(x.map((v, i) => v * p + y[i] * (1 - p))); };
function lab(hex) {
  const [r, g, b] = rgb(hex).map(lin);
  const X = (0.4124564 * r + 0.3575761 * g + 0.1804375 * b) / 0.95047, Y = 0.2126729 * r + 0.7151522 * g + 0.072175 * b, Z = (0.0193339 * r + 0.119192 * g + 0.9503041 * b) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  return [116 * f(Y) - 16, 500 * (f(X) - f(Y)), 200 * (f(Y) - f(Z))];
}
function de2000(h1, h2) {
  const [L1, a1, b1] = lab(h1), [L2, a2, b2] = lab(h2), rad = Math.PI / 180;
  const C1 = Math.hypot(a1, b1), C2 = Math.hypot(a2, b2), Cb = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Cb ** 7 / (Cb ** 7 + 25 ** 7)));
  const a1p = (1 + G) * a1, a2p = (1 + G) * a2, C1p = Math.hypot(a1p, b1), C2p = Math.hypot(a2p, b2);
  const hp = (a, b) => (a === 0 && b === 0 ? 0 : (Math.atan2(b, a) / rad + 360) % 360);
  const h1p = hp(a1p, b1), h2p = hp(a2p, b2);
  const dL = L2 - L1, dC = C2p - C1p;
  let dh = 0; if (C1p * C2p !== 0) { dh = h2p - h1p; if (dh > 180) dh -= 360; else if (dh < -180) dh += 360; }
  const dH = 2 * Math.sqrt(C1p * C2p) * Math.sin((dh / 2) * rad);
  const Lb = (L1 + L2) / 2, Cbp = (C1p + C2p) / 2;
  let hb = h1p + h2p; if (C1p * C2p !== 0) { hb = Math.abs(h1p - h2p) > 180 ? (h1p + h2p + (h1p + h2p < 360 ? 360 : -360)) / 2 : (h1p + h2p) / 2; }
  const T = 1 - 0.17 * Math.cos((hb - 30) * rad) + 0.24 * Math.cos(2 * hb * rad) + 0.32 * Math.cos((3 * hb + 6) * rad) - 0.2 * Math.cos((4 * hb - 63) * rad);
  const dTh = 30 * Math.exp(-(((hb - 275) / 25) ** 2)), RC = 2 * Math.sqrt(Cbp ** 7 / (Cbp ** 7 + 25 ** 7));
  const SL = 1 + (0.015 * (Lb - 50) ** 2) / Math.sqrt(20 + (Lb - 50) ** 2), SC = 1 + 0.045 * Cbp, SH = 1 + 0.015 * Cbp * T, RT = -Math.sin(2 * dTh * rad) * RC;
  return Math.sqrt((dL / SL) ** 2 + (dC / SC) ** 2 + (dH / SH) ** 2 + RT * (dC / SC) * (dH / SH));
}
const lum = (hex) => { const [r, g, b] = rgb(hex).map(lin); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
const contrast = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };

// ---- What the app declares ----
const theme = read("apps/voucher/src/lib/theme.css");
const T = {};
for (const [, name, hex] of theme.matchAll(/^\s*--([a-z0-9-]+):\s*(#[0-9a-f]{6});/gim)) T[name] = hex.toLowerCase();
const need = (name) => { if (!T[name]) throw new Error(`theme.css has no hex for --${name}`); return T[name]; };
const ground = need("ground"), surface = need("surface"), raised = need("raised"), well = need("well");
const voucher = need("voucher");
const wash = (hex) => mixOklab(hex, ground, 0.15);

const paletteTs = read("apps/voucher/src/lib/palette.ts");
const rows = [...paletteTs.slice(paletteTs.indexOf("export const PALETTE"), paletteTs.indexOf("export const COLORS")).matchAll(/^\s*\[(.*)\],?$/gm)]
  .map(([, row]) => [...row.matchAll(/color: "(#[0-9a-f]{6})", name: "([^"]+)"/gi)].map(([, color, name]) => ({ color: color.toLowerCase(), name })));
const legacyOf = (text, re) => Object.fromEntries([...text.matchAll(re)].map(([, a, b]) => [a.toLowerCase(), b.toLowerCase()]));
const legacyBlock = paletteTs.slice(paletteTs.indexOf("export const LEGACY"), paletteTs.indexOf("};", paletteTs.indexOf("export const LEGACY")));
const LEGACY = legacyOf(legacyBlock, /"(#[0-9a-f]{6})": "(#[0-9a-f]{6})"/gi);

const HARD = {
  "Voucher green": voucher, "Goal gold": need("goal"), "Unlock salmon": need("spend"), "Worse crimson": need("worse"), "Danger red": need("danger"),
  "Activity step 1": mixOklab(voucher, well, 0.32), "Activity step 2": mixOklab(voucher, well, 0.64),
};
const SOFT = { Marker: need("marker"), Sleep: need("sleep"), Curfew: need("night"), Calendar: need("calendar"), Mostly: mixSrgb(voucher, surface, 0.5) };
/** Swatches that aim for 15 from a soft color and settle for 12, with why. */
const SOFT_EXCEPTIONS = {
  "Light purple/Marker": "Anki's default; closer to 15 turns it gray",
  "Pale rose/Marker": "a light pink; closer to 15 turns it gray",
  "Light blue/Marker": "stepped off the Marker's hue, from 11.2 to 14.8",
  "Deep blue/Curfew": "Curfew always draws as a band, never a bar",
};
const BANDS = [["light", 0.86, 0.06], ["medium", 0.68, 0.03], ["deep", 0.57, 0.03]];
const TEXT = ["voucher", "goal", "spend", "worse", "danger", "marker", "sleep", "calendar", "night"];

let failures = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { failures++; console.log("FAIL " + msg); } };
const f1 = (n) => n.toFixed(1), f2 = (n) => n.toFixed(2);

// ---- Swatches ----
ok(rows.length === 3 && rows.every((r) => r.length === 9), `palette.ts has 3 rows of 9 swatches (found ${rows.map((r) => r.length).join(", ")})`);
const notes = [];
let worstBox = Infinity, worstHard = Infinity, worstSoft = Infinity;
rows.forEach((row, i) => {
  const [band, L0, tol] = BANDS[i];
  for (const s of row) {
    const box = contrast(s.color, raised);
    worstBox = Math.min(worstBox, box);
    ok(box >= 3, `${s.name} ${s.color} is ${f2(box)}:1 on --raised, under 3:1`);
    const L = oklab(s.color)[0];
    ok(Math.abs(L - L0) <= tol, `${s.name} ${s.color} has OKLCH lightness ${f2(L)}, outside the ${band} band ${L0} ± ${tol}`);
    for (const [name, hex] of Object.entries(HARD)) {
      const d = de2000(s.color, hex);
      worstHard = Math.min(worstHard, d);
      ok(d >= 15, `${s.name} ${s.color} is ${f1(d)} ΔE00 from ${name}, under 15`);
    }
    for (const [name, hex] of Object.entries(SOFT)) {
      const d = de2000(s.color, hex);
      worstSoft = Math.min(worstSoft, d);
      ok(d >= 12, `${s.name} ${s.color} is ${f1(d)} ΔE00 from ${name}, under 12`);
      if (d < 15) {
        const key = `${s.name}/${name}`;
        ok(key in SOFT_EXCEPTIONS, `${s.name} ${s.color} is ${f1(d)} ΔE00 from ${name}, under 15 and not a listed exception`);
        if (key in SOFT_EXCEPTIONS) notes.push(`${key} ${f1(d)} (${SOFT_EXCEPTIONS[key]})`);
      }
    }
  }
});

// ---- Text tokens ----
let worstText = Infinity;
for (const base of TEXT) {
  const text = T[`${base}-text`] ?? need(base); // "--x-text: var(--x)" means the base passes as text
  const w = wash(need(base));
  const onBox = contrast(text, raised), onWash = contrast(text, w);
  worstText = Math.min(worstText, onBox, onWash);
  ok(onBox >= 4.5, `--${base}-text ${text} is ${f2(onBox)}:1 on --raised, under 4.5:1`);
  ok(onWash >= 4.5, `--${base}-text ${text} is ${f2(onWash)}:1 on its wash ${w}, under 4.5:1`);
}

// ---- LEGACY and its mirrors ----
const swatches = new Set(rows.flat().map((s) => s.color));
for (const [from, to] of Object.entries(LEGACY)) {
  ok(swatches.has(to), `LEGACY maps ${from} to ${to}, which isn't a swatch`);
  ok(!swatches.has(from), `LEGACY maps ${from}, which is still a swatch`);
}
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());
const android = "apps/voucher/src-tauri/gen/android/app/src/main/java/io/github/comprehensivejason/voucher/VoucherColors.kt";
const kotlin = read(android);
const mirrors = {
  "crates/voucher-ledger/src/lib.rs": legacyOf(read("crates/voucher-ledger/src/lib.rs"), /\("(#[0-9a-f]{6})", "(#[0-9a-f]{6})"\)/gi),
  [android]: legacyOf(kotlin, /"(#[0-9a-f]{6})" to "(#[0-9a-f]{6})"/gi),
  "dev/test-portal.mjs": legacyOf(read("dev/test-portal.mjs").split("const LEGACY")[1].split("};")[0], /"(#[0-9a-f]{6})": "(#[0-9a-f]{6})"/gi),
};
for (const [file, map] of Object.entries(mirrors)) ok(same(map, LEGACY), `${file}'s LEGACY differs from palette.ts`);
let mirrored = 0;
for (const [, value, token] of kotlin.matchAll(/= 0xFF([0-9A-F]{6})\.toInt\(\)\s*\/\/ --([a-z0-9-]+)(, resolved)?/g)) {
  mirrored++;
  const want = token === "voucher-wash" ? wash(voucher) : T[token];
  ok(want === "#" + value.toLowerCase(), `VoucherColors.kt has #${value.toLowerCase()} for --${token}, theme.css ${want}`);
}
ok(mirrored >= 15, `VoucherColors.kt mirrors ${mirrored} tokens; expected at least 15`);

console.log(`Swatches: worst ${f2(worstBox)}:1 on --raised; nearest hard ${f1(worstHard)} ΔE00; nearest soft ${f1(worstSoft)} ΔE00.`);
console.log(`Text tokens: worst ${f2(worstText)}:1.`);
if (notes.length) console.log("Soft pairs under 15, as listed: " + notes.join("; ") + ".");
console.log(`${checks - failures} of ${checks} checks passed.`);
process.exit(failures ? 1 : 0);
