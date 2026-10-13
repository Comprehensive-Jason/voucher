#!/usr/bin/env node
// Checks that packages/core imports only its own files and its own
// dependencies, so it works the same in every app that compiles it:
//   - relative imports must stay inside packages/core/src;
//   - no $lib, $app, or $core (an app's aliases; inside core, use a relative path);
//   - a bare import must be one of core's dependencies (packages/core/package.json).
// Run by core's `npm run check`. Exits 1 and lists every bad import.
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

const root = path.join(import.meta.dirname, "..", "packages", "core");
const src = path.join(root, "src");
const pkg = JSON.parse(readFileSync(path.join(root, "package.json"), "utf8"));
const allowed = new Set(Object.keys({ ...pkg.dependencies, ...pkg.peerDependencies }));

const files = [];
(function walk(dir) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p);
    else if (/\.(ts|js|svelte|css)$/.test(e.name)) files.push(p);
  }
})(src);

// import ... from "x", import "x", import("x"), export ... from "x", new URL("x", import.meta.url), @import "x"
const SPECIFIERS = [
  /\bfrom\s*["']([^"']+)["']/g,
  /\bimport\s*["']([^"']+)["']/g,
  /\bimport\(\s*["']([^"']+)["']/g,
  /\bnew URL\(\s*["']([^"']+)["']\s*,\s*import\.meta\.url/g,
  /@import\s+["']([^"']+)["']/g,
];
/** The package a bare specifier names: "@scope/name" or "name". */
const packageOf = (spec) => spec.split("/").slice(0, spec.startsWith("@") ? 2 : 1).join("/");

const bad = [];
for (const file of files) {
  const text = readFileSync(file, "utf8");
  const where = path.relative(path.join(root, "..", ".."), file);
  for (const re of SPECIFIERS) {
    for (const m of text.matchAll(re)) {
      const spec = m[1];
      if (spec.startsWith("$")) bad.push(`${where}: ${spec} (an app's alias; core imports its own files relatively)`);
      else if (spec.startsWith(".")) {
        const to = path.resolve(path.dirname(file), spec);
        if (!to.startsWith(src + path.sep)) bad.push(`${where}: ${spec} (outside packages/core/src)`);
      } else if (!allowed.has(packageOf(spec))) bad.push(`${where}: ${spec} (not one of core's dependencies)`);
    }
  }
}

if (bad.length) {
  console.error(`packages/core imports what it mustn't:\n  ${bad.join("\n  ")}`);
  process.exit(1);
}
console.log(`packages/core imports: ${files.length} files checked, all inside core or its dependencies.`);
