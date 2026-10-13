#!/usr/bin/env node
// Applies a seed of sources and blocklists to a Ledger through its normal
// API (GET /status, POST /change), as the app would one change at a time.
//
//   VOUCHER_ACCESS_CODE_FILE=path/to/access.code \
//     node dev/apply-seed.mjs http://127.0.0.1:8787 dev/seeds/my-pc.json [--dry-run]
//
// The access code comes from VOUCHER_ACCESS_CODE or VOUCHER_ACCESS_CODE_FILE,
// never the command line. What it does:
// - Adds what the seed names and the Ledger lacks, and nothing else: it never
//   removes a member, an app, a site, a source, or a blocklist.
// - Running it twice changes nothing. It compares against the Ledger's
//   settings with its pending changes already applied, so a change still
//   waiting for the Morning boundary isn't requested again.
// - The Ledger decides when each change applies: blocking more applies at
//   once, while new sources and new members (more ways to earn) wait for the
//   Morning boundary. The report lists what was queued and until when.
//
// A seed (see dev/seeds/, which stays out of git):
//   { "sources": [{ "id", "name", "aliases"?: [old ids or names], "every",
//                   "members": [{ "member": "win:Code.exe" | "site:github.com", "label", "unsure"? }],
//                   "todo"?: [{ "member", "label", "why" }], "gaps"?: [text] }],
//     "blocklists": [{ "id", "name", "aliases"?, "apps": [{ "package", "label", "note"?, "unsure"? }],
//                      "sites": [{ "site", "note"? }] }] }
// A source or blocklist is matched by id, then by an alias, then by name. A
// source matched through an alias takes the seed's name. `todo` entries are
// placeholders and are never applied. New blocklists take the next colour the
// app would give them (LIST_COLORS in apps/voucher/src/lib/blocklists.ts);
// new sources get no colour, so the app's default applies.
import { readFileSync } from "node:fs";
import path from "node:path";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const [base, seedPath] = args.filter((a) => a !== "--dry-run");
if (!base || !seedPath) {
  console.error("usage: node dev/apply-seed.mjs <ledger-url> <seed.json> [--dry-run]");
  process.exit(2);
}
const LEDGER = (/^https?:\/\//.test(base) ? base : `http://${base}`).replace(/\/$/, "");
const CODE = process.env.VOUCHER_ACCESS_CODE
  ?? (process.env.VOUCHER_ACCESS_CODE_FILE ? readFileSync(process.env.VOUCHER_ACCESS_CODE_FILE, "utf8").trim() : undefined);
const seed = JSON.parse(readFileSync(seedPath, "utf8"));

async function ledger(method, route, body) {
  const headers = { "Content-Type": "application/json", ...(CODE ? { Authorization: `Bearer ${CODE}` } : {}) };
  const reply = await fetch(LEDGER + route, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) });
  const text = await reply.text();
  if (!reply.ok) throw new Error(`${method} ${route}: ${reply.status} ${text}`);
  return JSON.parse(text);
}

/** Members and blocked apps compare without case for programs, since
 *  Windows file names don't have one; sites are lowercase already. */
const key = (member) => (member.startsWith("win:") ? member.toLowerCase() : member);
const has = (list, member) => list.some((m) => key(m) === key(member));
const same = (a, b) => a.trim().toLowerCase() === b.trim().toLowerCase();

/** The Ledger's settings as they will be once its pending changes apply.
 *  Covers the changes that touch sources and blocklists. */
function projected(settings, pending) {
  const s = structuredClone(settings);
  for (const [change] of pending) {
    const [kind, v] = typeof change === "string" ? [change, null] : Object.entries(change)[0];
    const list = (id) => s.blocklists[id];
    switch (kind) {
      case "AddSource": s.sources[v.id] ??= v.source; break;
      case "SourceApps": if (s.sources[v.id]) Object.assign(s.sources[v.id], { packages: v.packages, labels: v.labels ?? {} }); break;
      case "RenameSource": if (s.sources[v.id]) s.sources[v.id].name = v.name; break;
      case "DeleteSource": delete s.sources[v]; break;
      case "NewBlocklist": s.blocklists[v.id] ??= v.list; break;
      case "RenameBlocklist": if (list(v.id)) list(v.id).name = v.name; break;
      case "BlocklistOn": if (list(v.id)) list(v.id).on = v.on; break;
      case "DeleteBlocklist": delete s.blocklists[v]; break;
      case "BlockApp": {
        const l = list(v.list), old = l?.apps.find((a) => a.package === v.app.package);
        if (old) old.on = v.app.on; else l?.apps.push(v.app);
        break;
      }
      case "BlockSite": {
        const l = list(v.list), old = l?.sites.find((x) => x.site === v.site.site);
        if (old) old.on = v.site.on; else l?.sites.push(v.site);
        break;
      }
      case "RemoveApp": if (list(v.list)) list(v.list).apps = list(v.list).apps.filter((a) => a.package !== v.package); break;
      case "RemoveSite": if (list(v.list)) list(v.list).sites = list(v.list).sites.filter((x) => x.site !== v.site); break;
    }
  }
  return s;
}

/** The existing entry a seed entry stands for: by id, an alias, or its name. */
function match(existing, entry) {
  if (existing[entry.id]) return { id: entry.id, viaAlias: false };
  for (const alias of entry.aliases ?? []) {
    if (existing[alias]) return { id: alias, viaAlias: true };
    const named = Object.keys(existing).find((id) => same(existing[id].name, alias));
    if (named) return { id: named, viaAlias: true };
  }
  const named = Object.keys(existing).find((id) => same(existing[id].name, entry.name));
  return named ? { id: named, viaAlias: false } : null;
}

/** The colours new blocklists take in turn, as the app's New blocklist page picks them. */
function listColors() {
  const file = path.join(import.meta.dirname, "..", "apps", "voucher", "src", "lib", "blocklists.ts");
  const found = readFileSync(file, "utf8").match(/LIST_COLORS\s*=\s*\[([^\]]*)\]/);
  const colors = found?.[1].match(/#[0-9a-fA-F]{6}/g);
  if (!colors?.length) throw new Error(`no LIST_COLORS in ${file}`);
  return colors;
}

const status = await ledger("GET", "/status");
const zone = status.settings.time_zone;
const view = projected(status.settings, status.pending ?? []);
/** Each planned change, with what it does in words. */
const plan = [];
const notes = [];

// Blocklists first: blocking more applies at once.
const colors = listColors();
const usedColors = new Set(Object.values(view.blocklists).map((l) => l.color.toLowerCase()));
for (const seedList of seed.blocklists ?? []) {
  const apps = (seedList.apps ?? []).map((a) => ({ package: a.package, label: a.label, note: a.note ?? null, on: true, added: true }));
  const sites = (seedList.sites ?? []).map((x) => ({ site: x.site, note: x.note ?? null, on: true, added: true }));
  const found = match(view.blocklists, seedList);
  for (const app of apps) {
    const elsewhere = Object.entries(view.blocklists).filter(([id, l]) => id !== found?.id && l.apps.some((a) => key(a.package) === key(app.package)));
    if (elsewhere.length) notes.push(`${app.package} is also on ${elsewhere.map(([, l]) => l.name).join(", ")}`);
  }
  if (!found) {
    const color = colors.find((c) => !usedColors.has(c.toLowerCase())) ?? colors[usedColors.size % colors.length];
    usedColors.add(color.toLowerCase());
    plan.push({ change: { NewBlocklist: { id: seedList.id, list: { name: seedList.name, color, premade: false, on: true, apps, sites } } },
      what: `new blocklist ${seedList.name} (${[...apps.map((a) => a.package), ...sites.map((x) => x.site)].join(", ")})` });
    continue;
  }
  const list = view.blocklists[found.id];
  for (const app of apps) {
    const old = list.apps.find((a) => key(a.package) === key(app.package));
    if (!old) plan.push({ change: { BlockApp: { list: found.id, app } }, what: `block ${app.package} on ${list.name}` });
    else if (!old.on) notes.push(`${app.package} is on ${list.name} but switched off; left as is`);
  }
  for (const site of sites) {
    const old = list.sites.find((x) => x.site === site.site);
    if (!old) plan.push({ change: { BlockSite: { list: found.id, site } }, what: `block ${site.site} on ${list.name}` });
    else if (!old.on) notes.push(`${site.site} is on ${list.name} but switched off; left as is`);
  }
}

// Then sources: new ones and new members are Loosenings.
for (const seedSource of seed.sources ?? []) {
  const members = seedSource.members ?? [];
  const found = match(view.sources, seedSource);
  const id = found?.id ?? seedSource.id;
  // No member belongs to two sources; the Ledger would drop it, so say so here.
  const claimed = (member) => Object.entries(view.sources).find(([other, s]) => other !== id && has(s.packages ?? [], member));
  const free = members.filter((m) => {
    const owner = claimed(m.member);
    if (owner) notes.push(`${m.member} is already in ${owner[1].name}; not added to ${seedSource.name}`);
    return !owner;
  });
  for (const t of seedSource.todo ?? []) notes.push(`TODO ${seedSource.name}: ${t.label} (${t.member}): ${t.why}`);
  for (const g of seedSource.gaps ?? []) notes.push(`Gap ${seedSource.name}: ${g}`);
  if (!found) {
    const source = { name: seedSource.name, kind: "focus", on: true, every: seedSource.every ?? 30,
      packages: free.map((m) => m.member), labels: Object.fromEntries(free.map((m) => [m.member, m.label])) };
    plan.push({ change: { AddSource: { id, source } }, what: `new source ${seedSource.name} (${source.packages.join(", ")})` });
    continue;
  }
  const source = view.sources[id];
  if (source.kind !== "focus") {
    notes.push(`${source.name} is a ${source.kind} source, not focus; members not added`);
    continue;
  }
  if (found.viaAlias && source.name !== seedSource.name) {
    plan.push({ change: { RenameSource: { id, name: seedSource.name } }, what: `rename ${source.name} to ${seedSource.name}` });
  }
  const missing = free.filter((m) => !has(source.packages ?? [], m.member));
  if (missing.length) {
    const labels = { ...(source.labels ?? {}) };
    for (const m of missing) labels[m.member] = m.label;
    plan.push({ change: { SourceApps: { id, packages: [...(source.packages ?? []), ...missing.map((m) => m.member)], labels } },
      what: `add to ${seedSource.name}: ${missing.map((m) => m.member).join(", ")}` });
  }
}

const unsure = [...(seed.sources ?? []).flatMap((s) => s.members ?? []).filter((m) => m.unsure).map((m) => `${m.member}: ${m.unsure}`),
  ...(seed.blocklists ?? []).flatMap((l) => l.apps ?? []).filter((a) => a.unsure).map((a) => `${a.package}: ${a.unsure}`)];

const local = (at) => new Date(at).toLocaleString("sv-SE", { timeZone: zone }).slice(0, 16);
console.log(`${LEDGER}: ${plan.length ? `${plan.length} change(s)${dryRun ? " planned (dry run)" : ""}` : "nothing to change"}`);
for (const step of plan) {
  if (dryRun) { console.log(`  plan    ${step.what}`); continue; }
  const effect = await ledger("POST", "/change", step.change);
  console.log(effect === "Now" ? `  now     ${step.what}` : `  queued  ${step.what}, until ${local(effect.At)}`);
}
for (const n of notes) console.log(`  note    ${n}`);
for (const u of unsure) console.log(`  unsure  ${u}`);
