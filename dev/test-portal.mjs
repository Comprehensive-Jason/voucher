#!/usr/bin/env node
// Test portal: runs a throwaway Ledger and serves a page of controls that move
// its sources' progress (finish a task, add focused or zone minutes), so you
// can watch the app react. Never point it at a real Ledger's data folder.
//
//   cargo build --release -p voucher-ledger
//   PORTAL_LEDGER=192.168.1.16:8797 node dev/test-portal.mjs
//
// Then open http://<this machine>:8798 and connect the app to the Ledger
// address it prints. To have a dev build show the portal's made-up
// Distraction time, put VITE_TEST_PORTAL=http://<this machine>:8798 in
// apps/voucher/.env.development.local. Settings, all optional:
//   PORTAL_DATA        the test Ledger's data folder (default dev/test-ledger)
//   PORTAL_LEDGER      where the test Ledger listens (default 127.0.0.1:8797);
//                      use a network address so a phone or tablet can reach it
//   PORTAL_PORT        this page's port (default 8798)
//   PORTAL_LEDGER_BIN  the Ledger binary (default target/release/voucher-ledger)
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";

const here = import.meta.dirname;
const DATA = path.resolve(process.env.PORTAL_DATA ?? path.join(here, "test-ledger"));
const LISTEN = process.env.PORTAL_LEDGER ?? "127.0.0.1:8797";
const PORT = Number(process.env.PORTAL_PORT ?? 8798);
const BIN = process.env.PORTAL_LEDGER_BIN ?? path.join(here, "..", "target", "release", "voucher-ledger");
const LEDGER = `http://${LISTEN}`;
// Minutes reported so far per Day and source. A device reports running totals,
// and the Ledger ignores a total that doesn't grow, so the portal keeps them.
const TOTALS = path.join(DATA, "portal-totals.json");
// Made-up Distraction time for a dev build to show (it's measured on the
// device, so the Ledger never has it). Starts with placeholder figures.
const USAGE = path.join(DATA, "portal-usage.json");
function placeholderUsage() {
  return { minutes: { Instagram: 14, YouTube: 8, Reddit: 4, Chess: 6, Firefox: 2 }, opens: { Instagram: 14, YouTube: 6, Reddit: 3, Chess: 2, Firefox: 1 }, closedWithoutTearing: 21 };
}
const readUsage = () => { try { return JSON.parse(readFileSync(USAGE, "utf8")); } catch { return placeholderUsage(); } };
const writeUsage = (u) => writeFileSync(USAGE, JSON.stringify(u));
/** The shape the app's deviceUsage() returns. */
function usageReply() {
  const u = readUsage();
  const byMost = (o) => Object.entries(o).filter(([, n]) => n > 0).sort((a, b) => b[1] - a[1]);
  const blockedOpens = Object.values(u.opens).reduce((a, b) => a + b, 0);
  return {
    measured: true,
    apps: byMost(u.minutes).map(([label, minutes]) => ({ label, minutes })),
    blockedOpens, closedWithoutTearing: Math.min(u.closedWithoutTearing, blockedOpens),
    attempts: byMost(u.opens).map(([label, count]) => ({ label, count })),
  };
}

mkdirSync(DATA, { recursive: true });
let ledger = null;

function startLedger() {
  ledger = spawn(BIN, [], {
    env: { ...process.env, VOUCHER_DATA_DIR: DATA, VOUCHER_LISTEN: LISTEN, VOUCHER_TEST_TASKS: "1" },
    stdio: ["ignore", "inherit", "inherit"],
  });
  ledger.on("exit", (code, signal) => { if (signal !== "SIGTERM") console.error(`test Ledger stopped (${code ?? signal})`); });
}

async function stopLedger() {
  if (!ledger || ledger.exitCode !== null) return;
  const gone = new Promise((done) => ledger.once("exit", done));
  ledger.kill("SIGTERM");
  await gone;
}

const accessCode = () => (existsSync(path.join(DATA, "access.code")) ? readFileSync(path.join(DATA, "access.code"), "utf8").trim() : "");

async function call(method, route, body) {
  const response = await fetch(LEDGER + route, {
    method,
    headers: { Authorization: `Bearer ${accessCode()}`, "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const text = await response.text();
  if (!response.ok) throw new Error(`${route}: ${response.status} ${text}`);
  return JSON.parse(text);
}

async function untilUp() {
  for (let i = 0; i < 50; i++) {
    try { await fetch(LEDGER + "/key"); return; } catch { await new Promise((r) => setTimeout(r, 100)); }
  }
  throw new Error("the test Ledger didn't start");
}

/** A test Ledger skips first-run setup, so its rules apply as on a set-up device. */
async function finishSetup() {
  const status = await call("GET", "/status");
  if (!status.setup_complete) await call("POST", "/setup", { changes: [], finish: true });
}

const readTotals = () => { try { return JSON.parse(readFileSync(TOTALS, "utf8")); } catch { return {}; } };
const writeTotals = (t) => writeFileSync(TOTALS, JSON.stringify(t));

async function addMinutes(source, add) {
  const status = await call("GET", "/status");
  const day = status.today.day;
  const totals = readTotals();
  const key = `${day}/${source}`;
  totals[key] = (totals[key] ?? 0) + add;
  writeTotals(totals);
  return call("POST", "/report", { device: "portal", source, day, minutes: totals[key] });
}

async function reset() {
  await stopLedger();
  // Keep the signing key and access code, so connected devices stay connected.
  rmSync(path.join(DATA, "state.json"), { force: true });
  rmSync(TOTALS, { force: true });
  startLedger();
  await untilUp();
  await finishSetup();
}

/** Writes made-up past Days into the test Ledger's saved state: scores for
 *  the history grid and log entries for the hour chart. The Ledger only takes
 *  reports for today and yesterday, so this edits its file while it's stopped. */
async function seedHistory(days) {
  const today = (await call("GET", "/status")).today.day;
  await stopLedger();
  const file = path.join(DATA, "state.json");
  const state = JSON.parse(readFileSync(file, "utf8"));
  const zone = Intl.DateTimeFormat("en-US", { timeZone: state.settings.time_zone, timeZoneName: "longOffset" });
  // Earnings name a task's service (todoist:…), or any other source's id.
  const sources = Object.entries(state.settings.sources).flatMap(([id, s]) => (s.kind === "tasks" ? [...s.packages, ...s.packages] : [id]));
  const titles = ["Problem set", "Weekly review", "Reply to email", "Lecture notes", "Bike ride", "Flashcards", "Chapter"];
  const goal = state.settings.daily_goal;
  let earliest = null;
  for (let back = days; back >= 1; back--) {
    // Counted back from the Ledger's own Day, not the calendar date here.
    const date = new Date(Date.parse(today + "T12:00:00Z") - back * 86400_000).toISOString().slice(0, 10);
    if (state.days[date]) continue;
    earliest ??= date;
    // A spread of quiet, ordinary, and goal-meeting Days.
    const earned = Math.random() < 0.15 ? 0 : Math.round(goal * (0.3 + Math.random() * 0.9));
    const redeemed = Math.min(earned, Math.floor(Math.random() * 5));
    state.days[date] = { earned, goal, redeemed, unlocked_minutes: redeemed * state.settings.unlock_minutes, progress: {}, reported: {} };
    const at = (hour, minute) => {
      const probe = new Date(date + "T12:00:00Z");
      const offset = zone.formatToParts(probe).find((x) => x.type === "timeZoneName").value.replace("GMT", "") || "+00:00";
      return new Date(date + "T" + String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00" + offset).toISOString();
    };
    for (let i = 0; i < earned; i++) {
      const k = Math.floor(Math.random() * sources.length);
      state.log.push({ kind: "earned", at: at(9 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60)),
        task: sources[k] + ":seed-" + date + "-" + i, title: titles[k % titles.length], kept: true });
    }
    for (let i = 0; i < redeemed; i++) {
      state.log.push({ kind: "redeemed", at: at(12 + Math.floor(Math.random() * 9), Math.floor(Math.random() * 60)), tickets: 1, minutes: state.settings.unlock_minutes });
    }
  }
  state.log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (earliest && Date.parse(state.started_at) > Date.parse(earliest + "T00:00:00Z")) state.started_at = earliest + "T00:00:00Z";
  writeFileSync(file, JSON.stringify(state));
  startLedger();
  await untilUp();
}

const send = (res, status, type, body) => { res.writeHead(status, { "Content-Type": type, "Cache-Control": "no-store" }); res.end(body); };

const server = createServer(async (req, res) => {
  try {
    let body = "";
    for await (const chunk of req) body += chunk;
    const input = body ? JSON.parse(body) : {};
    if (req.method === "GET" && req.url === "/") return send(res, 200, "text/html; charset=utf-8", PAGE);
    if (req.method === "GET" && req.url === "/api/status") return send(res, 200, "application/json", JSON.stringify(await call("GET", "/status")));
    // Read by the app itself, from another origin.
    if (req.method === "GET" && req.url === "/api/usage") { res.setHeader("Access-Control-Allow-Origin", "*"); return send(res, 200, "application/json", JSON.stringify(usageReply())); }
    if (req.method === "POST" && req.url === "/api/usage") {
      const u = readUsage();
      if (input.reset) writeUsage(placeholderUsage());
      else if (input.clear) writeUsage({ minutes: {}, opens: {}, closedWithoutTearing: 0 });
      else {
        if (input.app && input.minutes) u.minutes[input.app] = (u.minutes[input.app] ?? 0) + Number(input.minutes);
        if (input.app && input.open) u.opens[input.app] = (u.opens[input.app] ?? 0) + 1;
        if (input.closed) u.closedWithoutTearing += 1;
        writeUsage(u);
      }
      return send(res, 200, "application/json", JSON.stringify(usageReply()));
    }
    if (req.method === "POST" && req.url === "/api/minutes") return send(res, 200, "application/json", JSON.stringify(await addMinutes(input.source, Number(input.add))));
    if (req.method === "POST" && req.url === "/api/credit") return send(res, 200, "application/json", JSON.stringify(await call("POST", `/test/credit?count=${Number(input.count) || 1}`)));
    if (req.method === "POST" && req.url === "/api/task") return send(res, 200, "application/json", JSON.stringify(await call("POST", "/test/complete", { source: input.source, title: input.title })));
    if (req.method === "POST" && req.url === "/api/history") { await seedHistory(Number(input.days) || 28); return send(res, 200, "application/json", "{}"); }
    if (req.method === "POST" && req.url === "/api/reset") { await reset(); return send(res, 200, "application/json", "{}"); }
    send(res, 404, "text/plain", "not found");
  } catch (e) {
    send(res, 500, "application/json", JSON.stringify({ message: String(e.message ?? e) }));
  }
});

const PAGE = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Voucher Test Portal</title>
<style>
  :root { color-scheme: dark; --bg: #0e0f11; --card: #16181b; --line: #2a2e33; --ink: #f2f2f0; --muted: #a3a8ad; --green: #3ddc84; --gold: #ffb547;
    --font: system-ui, -apple-system, "Segoe UI", sans-serif; --mono: ui-monospace, "JetBrains Mono", Menlo, monospace; }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.4 var(--font); }
  .wrap { max-width: 980px; margin: 0 auto; padding-block: 24px 48px; padding-inline: 16px; display: flex; flex-direction: column; gap: 18px; }
  header { display: flex; flex-wrap: wrap; align-items: baseline; justify-content: space-between; gap: 8px 16px; }
  h1 { margin: 0; font-size: 22px; }
  .note { color: var(--muted); font-size: 13px; }
  .facts { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 10px; }
  .fact { background: var(--card); border: 1px solid var(--line); border-radius: 14px; padding: 12px 14px; }
  .fact b { display: block; font: 700 20px var(--mono); }
  .fact span { color: var(--muted); font-size: 12px; text-transform: uppercase; letter-spacing: .1em; }
  .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 12px; }
  .src { background: var(--card); border: 1px solid var(--line); border-radius: 16px; padding: 14px; display: flex; flex-direction: column; gap: 10px; }
  .top { display: flex; justify-content: space-between; gap: 8px; align-items: baseline; }
  .name { font-weight: 700; display: flex; align-items: center; gap: 8px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; }
  .detail { font: 13px var(--mono); color: var(--muted); }
  .bar { height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; }
  .buttons { display: flex; flex-wrap: wrap; gap: 8px; }
  button { min-height: 40px; padding: 0 14px; border-radius: 10px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 600 14px var(--font); cursor: pointer; }
  button:hover { border-color: var(--green); }
  button:focus-visible, input:focus-visible { outline: 2px solid var(--green); outline-offset: 2px; }
  button.go { background: var(--green); border-color: var(--green); color: #07170d; }
  button.danger { color: var(--gold); }
  /* The task-title boxes are marked as not-a-login (autocomplete off, plus
     data-protonpass-ignore and the other managers' equivalents), or password
     managers offer to fill them. */
  input { min-height: 40px; flex: 1; min-width: 0; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); padding: 0 12px; font: 14px var(--font); }
  .row { display: flex; gap: 8px; }
  .off { opacity: .5; }
  #toast { min-height: 20px; font-size: 13px; color: var(--green); }
  h2 { margin: 12px 0 0; font-size: 17px; }
  #toast.bad { color: var(--gold); }
</style></head>
<body><div class="wrap">
  <header>
    <h1>Voucher Test Portal</h1>
    <span class="note">Changes a throwaway test Ledger, never your real one. Progress only goes up, as on a real device.</span>
  </header>
  <div class="facts" id="facts"></div>
  <div id="toast" role="status"></div>
  <div class="buttons"><button data-credit="1">+1 Voucher to the Bank</button><button data-credit="5">+5 Vouchers</button><span class="note">Straight into the Bank: no task, no Log entry, nothing in the hour chart.</span></div>
  <div class="grid" id="sources"></div>
  <h2>Distraction time on this device (made up)</h2>
  <span class="note">What a dev build shows under "In Distractions today" and on the blocked-app screen, instead of what Android measures.</span>
  <div class="grid" id="usage"></div>
  <div class="buttons"><button id="history">Add 4 weeks of made-up history</button><button class="danger" id="reset">Fresh test Ledger: empty Bank, empty Day</button></div>
</div>
<script>
// Defaults for sources with no colour chosen; names come from the Ledger.
const COLORS = { tasks: "#5b9cff", obsidian: "#b08cff", workout: "#ff8a5c", reading: "#ffd166", anki: "#ff6fa8", steps: "#05afa5" };
const SERVICES = { todoist: "Todoist", clickup: "ClickUp" };
let NAMES = {};
const TITLES = ["Problem set 4", "Reply to the landlord", "Weekly review", "Draft the budget", "Read chapter 6", "Water the plants", "Lab report figures", "Email the adviser"];
const $ = (id) => document.getElementById(id);
let busy = false;

async function api(method, route, body) {
  const r = await fetch(route, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const data = await r.json();
  if (!r.ok) throw new Error(data.message || r.status);
  return data;
}
function toast(text, bad) { const t = $("toast"); t.textContent = text; t.className = bad ? "bad" : ""; }

async function act(fn, done) {
  if (busy) return; busy = true;
  try { const out = await fn(); toast(done(out)); } catch (e) { toast(String(e.message || e), true); }
  busy = false; refresh();
}
const earnedText = (c) => c.kept || c.forfeited ? "+" + c.kept + " Voucher" + (c.kept === 1 ? "" : "s") + (c.forfeited ? ", " + c.forfeited + " lost to a full Bank" : "") : "no Voucher yet";

const hm = (t) => t.slice(0, 5);
const ORDER = ["tasks", "obsidian", "workout", "steps", "reading", "anki"];
const rank = (id) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);

function fact(label, value) { return '<div class="fact"><span>' + label + '</span><b>' + value + '</b></div>'; }

function render(s) {
  const t = s.today, now = Date.now() / 1000;
  const unlock = s.unlock && s.unlock.ends_at && Date.parse(s.unlock.ends_at) / 1000 > now
    ? Math.ceil((Date.parse(s.unlock.ends_at) / 1000 - now) / 60) + " min left" : "none";
  $("facts").innerHTML = fact("Bank", s.bank + " / " + s.settings.bank_limit) + fact("Today's goal", t.earned + " / " + t.goal)
    + fact("Unlock", unlock) + fact("Curfew", s.curfew_active ? "on now" : hm(s.settings.curfew_start) + " to " + hm(s.settings.curfew_end));
  const cards = [];
  NAMES = Object.fromEntries(t.sources.map((src) => [src.id, src.name || src.id]));
  for (const src of [...t.sources].sort((a, b) => rank(a.id) - rank(b.id) || a.name.localeCompare(b.name))) {
    const color = src.color || COLORS[src.id] || "#9aa0a6";
    const name = NAMES[src.id];
    if (src.kind === "tasks") {
      // One field and button per service in the group, so the Log can name it.
      const services = s.settings.sources[src.id].packages;
      cards.push('<div class="src' + (src.on ? '' : ' off') + '"><div class="top"><span class="name"><i class="dot" style="background:' + color + '"></i>' + name + '</span>'
        + '<span class="detail">' + (src.every === 1 ? "+1 each" : src.progress + " / " + src.every) + ' · ' + src.earned + ' today</span></div>'
        + services.map((svc) => '<div class="row"><input id="title-' + svc + '" type="text" name="task-title-' + svc + '" autocomplete="off" data-protonpass-ignore="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" spellcheck="false" placeholder="' + TITLES[Math.floor(Math.random() * TITLES.length)] + '" aria-label="' + (SERVICES[svc] || svc) + ' task title">'
          + '<button class="go" data-task="' + svc + '">Finish in ' + (SERVICES[svc] || svc) + '</button></div>').join("") + '</div>');
    } else {
      const unit = src.kind === "workout" ? "zone min" : src.kind === "steps" ? "steps" : "min";
      const steps = src.kind === "workout" ? [1, 5, 10, 15] : src.kind === "steps" ? [100, 500, 1000, 2000] : [1, 5, 15, 30];
      cards.push('<div class="src' + (src.on ? '' : ' off') + '"><div class="top"><span class="name"><i class="dot" style="background:' + color + '"></i>' + name + '</span>'
        + '<span class="detail">' + src.progress + ' / ' + src.every + ' ' + unit + ' · ' + src.earned + ' today</span></div>'
        + '<div class="bar"><i style="width:' + Math.min(100, src.progress / src.every * 100) + '%;background:' + color + '"></i></div>'
        + '<div class="buttons">' + steps.map((n) => '<button data-src="' + src.id + '" data-add="' + n + '">+' + n + ' ' + unit + '</button>').join("") + '</div></div>');
    }
  }
  // Keep what's typed in the task fields, and where the cursor is, across redraws.
  const typed = {};
  document.querySelectorAll("#sources input").forEach((i) => (typed[i.id] = i.value));
  const focused = document.activeElement && document.activeElement.id;
  $("sources").innerHTML = cards.join("");
  for (const [id, value] of Object.entries(typed)) { const i = $(id); if (i) i.value = value; }
  if (focused && $(focused)) $(focused).focus();
}

function renderUsage(u) {
  const minutes = Object.fromEntries(u.apps.map((a) => [a.label, a.minutes]));
  const opens = Object.fromEntries(u.attempts.map((a) => [a.label, a.count]));
  const apps = ["Instagram", "YouTube", "Reddit", "Chess", "Firefox"].map((app) => '<div class="src"><div class="top"><span class="name">' + app + '</span><span class="detail">' + (minutes[app] ?? 0) + ' min · ' + (opens[app] ?? 0) + ' blocked opens</span></div>'
    + '<div class="buttons"><button data-uapp="' + app + '" data-umin="5">+5 min</button><button data-uapp="' + app + '" data-umin="15">+15 min</button><button data-uapp="' + app + '" data-uopen="1">+1 blocked open</button></div></div>').join("");
  const all = '<div class="src"><div class="top"><span class="name">All Distractions</span><span class="detail">' + u.blockedOpens + ' blocked opens · ' + u.closedWithoutTearing + ' closed without tearing</span></div>'
    + '<div class="buttons"><button data-uclosed="1">+1 closed without tearing</button><button data-ureset="1">Placeholder figures</button><button data-uclear="1" class="danger">Clear all</button></div></div>';
  $("usage").innerHTML = apps + all;
}

async function refresh() {
  if (busy) return;
  try { render(await api("GET", "/api/status")); renderUsage(await api("GET", "/api/usage")); } catch (e) { toast("Can't reach the test Ledger: " + (e.message || e), true); }
}

document.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  if (b.dataset.add) act(() => api("POST", "/api/minutes", { source: b.dataset.src, add: Number(b.dataset.add) }), (c) => NAMES[b.dataset.src] + " +" + b.dataset.add + ": " + earnedText(c));
  if (b.dataset.task) {
    const input = $("title-" + b.dataset.task);
    const title = input.value.trim() || input.placeholder;
    input.value = "";
    act(() => api("POST", "/api/task", { source: b.dataset.task, title }), (c) => "Finished “" + title + "”: " + earnedText(c));
  }
  if (b.dataset.uapp && b.dataset.umin) act(() => api("POST", "/api/usage", { app: b.dataset.uapp, minutes: Number(b.dataset.umin) }), () => b.dataset.uapp + " +" + b.dataset.umin + " min");
  if (b.dataset.uapp && b.dataset.uopen) act(() => api("POST", "/api/usage", { app: b.dataset.uapp, open: true }), () => b.dataset.uapp + ": one more blocked open");
  if (b.dataset.uclosed) act(() => api("POST", "/api/usage", { closed: true }), () => "One more closed without tearing");
  if (b.dataset.ureset) act(() => api("POST", "/api/usage", { reset: true }), () => "Placeholder Distraction time back");
  if (b.dataset.uclear) act(() => api("POST", "/api/usage", { clear: true }), () => "Distraction time cleared");
  if (b.dataset.credit) act(() => api("POST", "/api/credit", { count: Number(b.dataset.credit) }), (c) => "+" + c.kept + " in the Bank" + (c.forfeited ? ", " + c.forfeited + " over the limit" : ""));
  if (b.id === "history") act(() => api("POST", "/api/history", { days: 28 }), () => "Added made-up Days for the last 4 weeks");
  if (b.id === "reset") act(() => api("POST", "/api/reset"), () => "Fresh test Ledger: Bank and Day emptied");
});
refresh();
setInterval(refresh, 2000);
</script></body></html>`;

startLedger();
await untilUp();
await finishSetup();
server.listen(PORT, () => {
  console.log(`test Ledger at ${LEDGER} (data in ${DATA}; access code in access.code)`);
  console.log(`portal at http://0.0.0.0:${PORT}`);
});
const quit = async () => { await stopLedger(); process.exit(0); };
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
