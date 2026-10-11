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
// Made-up Distraction time, as a phone would measure it: the dev build's
// "today on this device" figures, and minutes per app and hour that the
// portal reports to the Ledger (POST /usage) for the Distraction time chart.
// Starts with placeholder figures.
const USAGE = path.join(DATA, "portal-usage.json");
// Apps from Jason's own blocklists, named as the blocklists name them so the
// app can colour each one by its list, and sites on them by domain, as a
// phone counts time in Brave or Chrome.
const USAGE_APPS = ["Instagram", "YouTube", "X", "rednote", "Mihon", "Reddit", "bilibili", "HoYoLAB", "Samsung Internet", "youtube.com", "reddit.com",
  // More, to make the list long enough to scroll.
  "Genshin Impact", "WoT Blitz", "Mindustry", "Plague Inc.", "After Inc.", "pixiv", "AniList", "Discord", "Grayjay", "Patreon"];
function placeholderUsage() {
  return {
    minutes: { Instagram: 14, YouTube: 8, X: 11, rednote: 6, Mihon: 9, Reddit: 4, bilibili: 5, HoYoLAB: 2, "Samsung Internet": 1, "youtube.com": 12, "reddit.com": 5,
      "Genshin Impact": 22, "WoT Blitz": 7, Mindustry: 12, "Plague Inc.": 3, "After Inc.": 2, pixiv: 5, AniList: 3, Discord: 10, Grayjay: 6, Patreon: 1 },
    opens: { Instagram: 14, YouTube: 6, X: 9, rednote: 4, Mihon: 5, Reddit: 3, bilibili: 2, HoYoLAB: 1, "Samsung Internet": 1,
      "Genshin Impact": 4, "WoT Blitz": 2, Mindustry: 3, "Plague Inc.": 1, "After Inc.": 1, pixiv: 2, AniList: 1, Discord: 5, Grayjay: 2, Patreon: 1 },
    closedWithoutTearing: 49,
  };
}
const readUsage = () => { try { return JSON.parse(readFileSync(USAGE, "utf8")); } catch { return placeholderUsage(); } };
const ZONE = process.env.VOUCHER_TIME_ZONE ?? Intl.DateTimeFormat().resolvedOptions().timeZone;
const hourNow = () => Number(new Intl.DateTimeFormat("en-US", { timeZone: ZONE, hour: "numeric", hourCycle: "h23" }).format(new Date()));
/** Each app's minutes today per clock hour: what's there, or today's totals
 *  spread from 08:00 to now (at most 60 a hour). */
function hoursOf(u) {
  if (u.hours) return u.hours;
  const now = hourNow(), from = Math.min(8, now), span = now - from + 1;
  const hours = {};
  for (const [app, total] of Object.entries(u.minutes)) {
    const h = Array(24).fill(0);
    let left = total;
    for (let i = 0; i < span && left > 0; i++) { const m = Math.min(60, Math.ceil(left / (span - i))); h[from + i] = m; left -= m; }
    hours[app] = h;
  }
  return hours;
}
/** The made-up apps that are games, which a phone would know from Android's app category. */
const GAMES = new Set(["Genshin Impact", "WoT Blitz", "Mindustry", "Plague Inc.", "After Inc."]);
/** Which switched-on blocklist each app or site is on, as a phone would say:
 *  the one naming it (a site by its domain or a parent domain), or for a
 *  game, one blocking every game. Unlisted apps and sites are left out. */
function listsFor(apps, blocklists) {
  const on = Object.entries(blocklists).filter(([, l]) => l.on);
  const out = {};
  for (const app of apps) {
    const named = on.find(([, l]) => l.apps.some((a) => a.label.toLowerCase() === app.toLowerCase())
      || l.sites.some((s) => app === s.site || app.endsWith("." + s.site)));
    const games = GAMES.has(app) ? on.find(([, l]) => l.apps.some((a) => a.package === "category:game")) : null;
    const hit = named ?? games;
    if (hit) out[app] = hit[0];
  }
  return out;
}
/** Sends today's made-up minutes to the Ledger, as a phone would. */
async function reportUsage() {
  const u = readUsage();
  u.hours = hoursOf(u);
  writeUsage(u);
  const status = await call("GET", "/status");
  // Focus stretches made up once a Day; blocked opens from the counts above.
  if (u.stretchesDay !== status.today.day) { u.stretches = fakeStretches(); u.stretchesDay = status.today.day; writeUsage(u); }
  const opens = Object.values(u.opens).reduce((a, b) => a + b, 0);
  // When each stretch started (from 08:00, about an hour and a quarter apart) and when the Distraction minutes were in use, as a newer phone sends them.
  const state = { settings: status.settings }, day = status.today.day;
  const sources = focusSources(state);
  const timed = u.stretches.map((minutes, i) => ({ start: momentOf(state, day, 8 + Math.floor((i * 75) / 60), (i * 75) % 60), minutes, source: sources[i % sources.length] ?? "reading" }))
    .filter((s) => Date.parse(s.start) + s.minutes * 60_000 <= Date.now());
  return call("POST", "/usage", { device: "portal", day, apps: u.hours, lists: listsFor(Object.keys(u.hours), status.settings.blocklists),
    stretches: timed.map((s) => s.minutes), timed_stretches: timed, distraction_spans: spansFromHours(state, day, u.hours, []).map(isoSpan),
    opens, walked: Math.min(u.closedWithoutTearing, opens) });
}
/** A Day's made-up focus stretches, in minutes. */
const fakeStretches = () => Array.from({ length: 2 + Math.floor(Math.random() * 4) }, () => 5 + Math.floor(Math.random() ** 1.5 * 70));
/** A Day's made-up blocked opens and walk-aways. */
function fakeOpens() { const opens = Math.floor(Math.random() * 12); return [opens, Math.round(opens * (0.4 + Math.random() * 0.5))]; }
/** A made-up Day of Distraction time: a few apps, mostly in the hours the Day
 *  tore Vouchers, sometimes running past what was unlocked. */
function fakeDayUsage(tearHours, unlockMinutes) {
  const apps = {};
  const add = (app, hour, m) => { (apps[app] ??= Array(24).fill(0))[hour] = Math.min(60, (apps[app]?.[hour] ?? 0) + m); };
  const pick = () => USAGE_APPS[Math.floor(Math.random() ** 2 * USAGE_APPS.length)];
  for (const h of tearHours) {
    let left = Math.round(unlockMinutes * (0.6 + Math.random() * 0.8));
    while (left > 0) { const m = Math.min(left, 2 + Math.floor(Math.random() * 8)); add(pick(), h, m); left -= m; }
  }
  // A little time outside Unlocks too, as an allowed app would show.
  if (Math.random() < 0.5) add(pick(), 8 + Math.floor(Math.random() * 13), 1 + Math.floor(Math.random() * 6));
  return apps;
}
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
  if (!ledgerRunning()) return;
  const gone = new Promise((done) => ledger.once("exit", done));
  ledger.kill("SIGTERM");
  await gone;
}

/** Whether the test Ledger process is running (not stopped from the Errors section). */
const ledgerRunning = () => !!ledger && ledger.exitCode === null && ledger.signalCode === null;

/** The test Ledger's fault switches that are on, or null if it can't say. */
async function faultsOn() {
  if (!ledgerRunning()) return null;
  try { return await call("GET", "/test/fault"); } catch { return null; }
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

/** A test Ledger skips first-run setup, so its rules apply as on a set-up
 *  device. Reading also counts readwise.io, so a source shows a site member. */
async function finishSetup() {
  const status = await call("GET", "/status");
  if (status.setup_complete) return;
  const reading = status.settings.sources.reading;
  const changes = reading && !reading.packages.includes("site:readwise.io")
    ? [{ SourceApps: { id: "reading", packages: [...reading.packages, "site:readwise.io"], labels: { ...reading.labels, "site:readwise.io": "readwise.io" } } }]
    : [];
  await call("POST", "/setup", { changes, finish: true });
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

/** Writes `days` more made-up Days into the test Ledger's saved state, going
 *  back from the oldest Day it already has, so each press makes the history
 *  longer: scores for the history grid, and log entries for the hour chart
 *  (only for the last 183 Days, which is all the Ledger keeps of its log).
 *  The Ledger only takes reports for today and yesterday, so this edits its
 *  file while it's stopped. */
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
  // Counted back from the Ledger's own Day, not the calendar date here.
  const shift = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);
  const past = Object.keys(state.days).filter((d) => d < today).sort();
  const from = past.length ? past[0] : today;
  const logFrom = shift(today, -183);
  let earliest = null;
  for (let back = 1; back <= days; back++) {
    const date = shift(from, -back);
    earliest = date;
    // A spread of quiet, ordinary, and goal-meeting Days.
    const earned = Math.random() < 0.15 ? 0 : Math.round(goal * (0.3 + Math.random() * 0.9));
    const redeemed = Math.min(earned, Math.floor(Math.random() * 5));
    state.days[date] = { earned, goal, redeemed, unlocked_minutes: redeemed * state.settings.unlock_minutes, progress: {}, reported: {} };
    const at = (hour, minute) => {
      const probe = new Date(date + "T12:00:00Z");
      const offset = zone.formatToParts(probe).find((x) => x.type === "timeZoneName").value.replace("GMT", "") || "+00:00";
      return new Date(date + "T" + String(hour).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00" + offset).toISOString();
    };
    if (date < logFrom) continue;
    for (let i = 0; i < earned; i++) {
      const k = Math.floor(Math.random() * sources.length);
      state.log.push({ kind: "earned", at: at(9 + Math.floor(Math.random() * 13), Math.floor(Math.random() * 60)),
        task: sources[k] + ":seed-" + date + "-" + i, title: titles[k % titles.length], kept: true });
    }
    const tearHours = [];
    for (let i = 0; i < redeemed; i++) {
      const hour = 12 + Math.floor(Math.random() * 9);
      tearHours.push(hour);
      state.log.push({ kind: "redeemed", at: at(hour, Math.floor(Math.random() * 60)), tickets: 1, minutes: state.settings.unlock_minutes });
    }
    state.days[date].usage = { portal: fakeDayUsage(tearHours, state.settings.unlock_minutes) };
    state.days[date].usage_lists = listsFor(Object.keys(state.days[date].usage.portal), state.settings.blocklists);
    state.days[date].stretches = { portal: fakeStretches() };
    state.days[date].blocked = { portal: fakeOpens() };
  }
  state.log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
  if (earliest && Date.parse(state.started_at) > Date.parse(earliest + "T00:00:00Z")) state.started_at = earliest + "T00:00:00Z";
  writeFileSync(file, JSON.stringify(state));
  startLedger();
  await untilUp();
}

/** Gives every past Day in the kept log that has no Distraction time some,
 *  around the hours its log shows Vouchers torn. Edits the saved state while
 *  the Ledger is stopped, like seedHistory. */
async function backfillUsage() {
  const today = (await call("GET", "/status")).today.day;
  await stopLedger();
  const file = path.join(DATA, "state.json");
  const state = JSON.parse(readFileSync(file, "utf8"));
  const hourIn = (iso) => Number(new Intl.DateTimeFormat("en-US", { timeZone: state.settings.time_zone, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  const dayOf = (iso) => { const h = hourIn(iso); const local = new Intl.DateTimeFormat("en-CA", { timeZone: state.settings.time_zone }).format(new Date(iso)); return h < 6 ? new Date(Date.parse(local + "T12:00:00Z") - 86400_000).toISOString().slice(0, 10) : local; };
  const tears = {};
  for (const e of state.log) if (e.kind === "redeemed") (tears[dayOf(e.at)] ??= []).push(hourIn(e.at));
  const logFrom = new Date(Date.parse(today + "T12:00:00Z") - 183 * 86400_000).toISOString().slice(0, 10);
  let filled = 0;
  for (const [date, score] of Object.entries(state.days)) {
    // Days filled before the blocklists were sent get them now.
    if (score.usage?.portal && !score.usage_lists) score.usage_lists = listsFor(Object.keys(score.usage.portal), state.settings.blocklists);
    // And focus stretches and blocked opens, which came later still.
    if (date < today && date >= logFrom && !score.stretches) score.stretches = { portal: fakeStretches() };
    if (date < today && date >= logFrom && !score.blocked) score.blocked = { portal: fakeOpens() };
    if (date >= today || date < logFrom || (score.usage && Object.keys(score.usage).length)) continue;
    score.usage = { portal: fakeDayUsage(tears[date] ?? [], state.settings.unlock_minutes) };
    score.usage_lists = listsFor(Object.keys(score.usage.portal), state.settings.blocklists);
    filled++;
  }
  writeFileSync(file, JSON.stringify(state));
  startLedger();
  await untilUp();
  await reportUsage();
  return filled;
}

// ---- Past Days ----
// Everything the Trends cards read for a past Day, set by hand on a chosen
// Day or sprinkled at random: goal and missed Days, streaks, Markers, the
// Curfew question's answers, Why now? reasons, focus stretches, blocked opens,
// silences, and Distraction time. The Ledger only takes reports for today and
// yesterday, so like seedHistory these edit its saved state while it's stopped.

const shiftDay = (day, n) => new Date(Date.parse(day + "T12:00:00Z") + n * 86400_000).toISOString().slice(0, 10);

/** The moment `hour:minute` on a Day, in the Ledger's zone: a Day runs 06:00 to 06:00, so 01:00 is the next calendar date. */
function momentOf(state, day, hour, minute = 0) {
  const date = hour < 6 ? shiftDay(day, 1) : day;
  const zone = Intl.DateTimeFormat("en-US", { timeZone: state.settings.time_zone, timeZoneName: "longOffset" });
  const offset = zone.formatToParts(new Date(date + "T12:00:00Z")).find((x) => x.type === "timeZoneName").value.replace("GMT", "") || "+00:00";
  return new Date(date + "T" + String(hour % 24).padStart(2, "0") + ":" + String(minute).padStart(2, "0") + ":00" + offset).toISOString();
}

/** The Day a moment belongs to, in the Ledger's zone. */
function dayOfMoment(state, iso) {
  const tz = state.settings.time_zone;
  const h = Number(new Intl.DateTimeFormat("en-US", { timeZone: tz, hour: "numeric", hourCycle: "h23" }).format(new Date(iso)));
  const local = new Intl.DateTimeFormat("en-CA", { timeZone: tz }).format(new Date(iso));
  return h < 6 ? shiftDay(local, -1) : local;
}

/** Stops the Ledger, lets `change` edit its saved state, and starts it again. */
async function editState(change) {
  const today = (await call("GET", "/status")).today.day;
  await stopLedger();
  const file = path.join(DATA, "state.json");
  const state = JSON.parse(readFileSync(file, "utf8"));
  state.markers ??= []; state.verdicts ??= {}; state.reasons ??= [];
  let message;
  try { message = change(state, today); }
  finally {
    state.log.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    state.markers.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    state.reasons.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));
    writeFileSync(file, JSON.stringify(state));
    startLedger();
    await untilUp();
  }
  return message;
}

const scoreOf = (state, day) => (state.days[day] ??= { earned: 0, goal: state.settings.daily_goal, redeemed: 0, unlocked_minutes: 0, progress: {}, reported: {} });

/** Replaces a Day's earnings with `n` made-up ones, spread over its waking hours. */
function setEarned(state, day, n) {
  const sources = Object.entries(state.settings.sources).filter(([, s]) => s.on).flatMap(([id, s]) => (s.kind === "tasks" ? [...s.packages, ...s.packages] : [id]));
  const titles = ["Problem set", "Weekly review", "Reply to email", "Lecture notes", "Bike ride", "Flashcards", "Chapter"];
  state.log = state.log.filter((e) => !(e.kind === "earned" && dayOfMoment(state, e.at) === day));
  for (let i = 0; i < n; i++) {
    const k = Math.floor(Math.random() * sources.length);
    state.log.push({ kind: "earned", at: momentOf(state, day, 7 + Math.floor(Math.random() * 15), Math.floor(Math.random() * 60)),
      task: sources[k] + ":past-" + day + "-" + i + "-" + Math.random().toString(36).slice(2, 6), title: titles[k % titles.length], kept: true });
  }
  scoreOf(state, day).earned = n;
}
const goalOf = (state, day) => scoreOf(state, day).goal || state.settings.daily_goal;
const goalDay = (state, day) => setEarned(state, day, goalOf(state, day) + Math.floor(Math.random() * 4));
const missDay = (state, day) => setEarned(state, day, Math.floor(goalOf(state, day) * (0.2 + Math.random() * 0.5)));

/** A tear at `hour` on a Day, with its Unlock minutes, and optionally why. */
function addTear(state, day, hour, reason) {
  const at = momentOf(state, day, hour, Math.floor(Math.random() * 60));
  state.log.push({ kind: "redeemed", at, tickets: 1, minutes: state.settings.unlock_minutes });
  const score = scoreOf(state, day);
  score.redeemed = (score.redeemed ?? 0) + 1;
  score.unlocked_minutes = (score.unlocked_minutes ?? 0) + state.settings.unlock_minutes;
  if (reason) state.reasons.push({ at, reason: reason.toLowerCase() });
}

/** The phone silent from `from` for `hours` on a Day: its silent minutes, and a Gap in the log. */
function addSilence(state, day, from, hours) {
  const silent = ((scoreOf(state, day).silent ??= {}).phone ??= Array(24).fill(0));
  for (let h = from; h < from + hours; h++) silent[h % 24] = 60;
  state.log.push({ kind: "gap", at: momentOf(state, day, from), device: "phone", until: momentOf(state, day, Math.min(from + hours, 29)) });
}

const REASONS = ["bored", "avoiding a task", "tired", "anxious", "urgent", "habit"];
const MARKERS = ["New term starts", "Dose up", "Exam week", "Moved desks", "Sick", "Trip home", "Started a new routine", "Deadline crunch"];
const pickOne = (list) => list[Math.floor(Math.random() * list.length)];

function pastChange(input) {
  const day = input.day;
  return (state, today) => {
    if (input.op !== "random" && input.op !== "breaks" && (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || day > today)) throw new Error("pick a Day up to today");
    switch (input.op) {
      case "goal": goalDay(state, day); return day + " is a goal Day";
      case "miss": missDay(state, day); return day + " missed its goal";
      case "streak": {
        const n = Math.max(1, Math.min(120, Number(input.n) || 5));
        for (let i = 0; i < n; i++) goalDay(state, shiftDay(day, -i));
        missDay(state, shiftDay(day, -n));
        return "A " + n + "-Day streak ending " + day + " (the Day before it missed)";
      }
      case "marker": {
        const text = String(input.text || pickOne(MARKERS)).slice(0, 200);
        state.markers.push({ at: momentOf(state, day, Number(input.hour ?? 9), Number(input.minute ?? 0)), text, rule: !!input.rule });
        return "Marker on " + day + ": " + text;
      }
      case "verdict":
        if (input.verdict) state.verdicts[day] = input.verdict; else delete state.verdicts[day];
        return day + ": " + (input.verdict ?? "answer cleared");
      case "reason": addTear(state, day, Number(input.hour ?? 14), input.reason || pickOne(REASONS)); return "An Unlock on " + day + " at " + (input.hour ?? 14) + ":xx, " + (input.reason || "a random reason");
      case "stretches": {
        const list = String(input.list || "").split(/[ ,]+/).map(Number).filter((m) => m > 0 && m <= 1440);
        (scoreOf(state, day).stretches ??= {}).portal = list.length ? list : fakeStretches();
        return "Focus stretches on " + day + ": " + scoreOf(state, day).stretches.portal.join(", ") + " min";
      }
      case "stretches-all": {
        // Every Day the log keeps: 3 to 10 stretches, typically longer toward
        // today, so Focus stretches has a trend to show at every range.
        const from = shiftDay(today, -183);
        let n = 0;
        for (let d = from; d <= today; d = shiftDay(d, 1)) {
          const t = (Date.parse(d) - Date.parse(from)) / (Date.parse(today) - Date.parse(from) || 1);
          const typical = 18 + 30 * t;
          const list = Array.from({ length: 3 + Math.floor(Math.random() * 8) }, () => Math.max(3, Math.round(typical * Math.exp((Math.random() - 0.5) * 1.6))));
          (scoreOf(state, d).stretches ??= {}).portal = list;
          n++;
        }
        return "Focus stretches on " + n + " Days, typically about 18 min six months ago and 48 min now";
      }
      case "breaks": return fillBreaks(state, today);
      case "opens": {
        const opens = Math.max(0, Number(input.opens) || 0), walked = Math.min(opens, Math.max(0, Number(input.walked) || 0));
        (scoreOf(state, day).blocked ??= {}).portal = [opens, walked];
        return day + ": " + opens + " blocked opens, " + walked + " walked away";
      }
      case "silence": addSilence(state, day, Number(input.from ?? 14), Math.max(1, Number(input.hours) || 2)); return "Phone silent on " + day + " from " + (input.from ?? 14) + ":00 for " + (input.hours || 2) + " h";
      case "usage": {
        const score = scoreOf(state, day);
        score.usage = { portal: fakeDayUsage([], state.settings.unlock_minutes) };
        score.usage_lists = listsFor(Object.keys(score.usage.portal), state.settings.blocklists);
        return "Distraction time made up for " + day;
      }
      case "random": return sprinkle(state, today, Math.max(7, Math.min(365, Number(input.days) || 60)));
      default: throw new Error("unknown change " + input.op);
    }
  };
}

/** A believable mix over the last `days` Days: a few Markers, most nights
 *  answered (agreeing with the goal, mostly), a reason on most tears, a few
 *  silent afternoons, and stretches and opens where a Day has none. */
function sprinkle(state, today, days) {
  let marks = 0, answers = 0, reasons = 0, silences = 0;
  for (let back = 1; back <= days; back++) {
    const day = shiftDay(today, -back);
    const score = scoreOf(state, day);
    const met = score.earned >= (score.goal || state.settings.daily_goal);
    if (Math.random() < 0.85) {
      const r = Math.random();
      state.verdicts[day] = met ? (r < 0.65 ? "yes" : r < 0.9 ? "mostly" : "no") : (r < 0.15 ? "yes" : r < 0.5 ? "mostly" : "no");
      answers++;
    }
    for (const e of state.log) {
      if (e.kind === "redeemed" && dayOfMoment(state, e.at) === day && Math.random() < 0.75 && !state.reasons.some((x) => x.at === e.at)) {
        state.reasons.push({ at: e.at, reason: pickOne(REASONS) }); reasons++;
      }
    }
    if (!state.log.some((e) => e.kind === "redeemed" && dayOfMoment(state, e.at) === day) && Math.random() < 0.5) { addTear(state, day, 10 + Math.floor(Math.random() * 11), pickOne(REASONS)); reasons++; }
    if (Math.random() < 0.08) { addSilence(state, day, 9 + Math.floor(Math.random() * 10), 1 + Math.floor(Math.random() * 3)); silences++; }
    if (!score.stretches || !Object.keys(score.stretches).length) score.stretches = { portal: fakeStretches() };
    if (!score.blocked || !Object.keys(score.blocked).length) score.blocked = { portal: fakeOpens() };
  }
  const texts = [...MARKERS].sort(() => Math.random() - 0.5);
  for (let i = 0; i < Math.min(texts.length, Math.max(2, Math.round(days / 25))); i++) {
    const back = 3 + Math.floor(Math.random() * (days - 3));
    state.markers.push({ at: momentOf(state, shiftDay(today, -back), 8 + Math.floor(Math.random() * 12), Math.floor(Math.random() * 60)), text: texts[i], rule: false });
    marks++;
  }
  return "Over " + days + " Days: " + marks + " Markers, " + answers + " Curfew answers, " + reasons + " reasons, " + silences + " silences";
}

// ---- Breaks before focus stretches ----
// For What goes with a good Day's "Focus stretch length": when each focus
// stretch started, and when Distraction was in use, as a newer phone sends
// them (the Ledger works the Unlocks out from its log). Each hour's made-up
// Distraction minutes become one span, inside that hour's Unlock when it has
// one; on about three Days in ten some Distraction runs on after 22:00. About
// half the stretches that aren't the Day's longest start 5 to 35 minutes
// after an Unlock and run shorter, so the card has something to find; the
// rest start where the hour before is clear. Lengths stay in step.

const BREAK_P = 0.5, BREAK_SHORT = 0.6, LATE_P = 0.3;
const MINUTE = 60_000;
const isoSpan = ([a, b]) => [new Date(a).toISOString(), new Date(b).toISOString()];
/** The switched-on Focused time sources' ids. */
const focusSources = (state) => Object.entries(state.settings.sources).filter(([, s]) => s.kind === "focus" && s.on).map(([id]) => id);
/** A Day's Unlocks, [from, to] in epoch milliseconds, from the log's tears: a tear stacked onto a running Unlock continues it, as the Ledger works them out. */
function unlocksOf(state, day) {
  const tears = state.log.filter((e) => e.kind === "redeemed" && e.minutes > 0).map((e) => [Date.parse(e.at), e.minutes]).sort((a, b) => a[0] - b[0]);
  const out = [];
  let until = 0;
  for (const [at, minutes] of tears) {
    const from = Math.max(at, until), to = from + minutes * MINUTE;
    until = to;
    if (dayOfMoment(state, new Date(from).toISOString()) !== day) continue;
    const last = out.at(-1);
    if (last && last[1] >= from) last[1] = to; else out.push([from, to]);
  }
  return out;
}
/** Each clock hour's Distraction minutes (every app's, at most 60) as one span: inside the hour's Unlock if one runs then, else at a random spot in the hour; merged. */
function spansFromHours(state, day, apps, unlocks) {
  const hours = Array(24).fill(0);
  for (const h of Object.values(apps)) h.forEach((m, i) => (hours[i] = Math.min(60, hours[i] + m)));
  const spans = [];
  hours.forEach((m, h) => {
    if (!m) return;
    const hourStart = Date.parse(momentOf(state, day, h)), hourEnd = hourStart + 60 * MINUTE;
    const u = unlocks.find(([a, b]) => a < hourEnd && b > hourStart);
    const from = u ? Math.min(Math.max(u[0], hourStart), hourEnd - m * MINUTE) : hourStart + Math.floor(Math.random() * (61 - m)) * MINUTE;
    spans.push([from, Math.min(from + m * MINUTE, Date.now())]);
  });
  spans.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const [a, b] of spans) { const last = merged.at(-1); if (last && a <= last[1]) last[1] = Math.max(last[1], b); else if (b > a) merged.push([a, b]); }
  return merged;
}
/** Gives one past Day's portal stretches their starts and sources, and its portal Distraction minutes their spans. */
function placeBreaks(state, day) {
  const score = scoreOf(state, day);
  const unlocks = unlocksOf(state, day);
  const usage = score.usage?.portal;
  let spans = [];
  if (usage) {
    if (Math.random() < LATE_P) {
      const app = Object.keys(usage)[0] ?? "YouTube";
      const h = (usage[app] ??= Array(24).fill(0));
      h[22] = Math.min(60, h[22] + 20 + Math.floor(Math.random() * 20));
      score.usage_lists = { ...listsFor(Object.keys(usage), state.settings.blocklists), ...score.usage_lists };
    }
    spans = spansFromHours(state, day, usage, unlocks);
    (score.distraction_spans ??= {}).portal = spans.map(isoSpan);
  }
  const breaks = [...unlocks, ...spans];
  const near = (t) => breaks.some(([a, b]) => Math.min(b, t) - Math.max(a, t - 60 * MINUTE) > 0);
  const lengths = [...(score.stretches?.portal ?? fakeStretches())];
  const top = lengths.indexOf(Math.max(...lengths));
  const sources = focusSources(state);
  const placed = [], timed = [];
  const dayStart = Date.parse(momentOf(state, day, 6)), dayEnd = Date.parse(momentOf(state, shiftDay(day, 1), 6));
  lengths.forEach((m, i) => {
    let start = -1;
    if (i !== top && unlocks.length && Math.random() < BREAK_P) {
      start = unlocks[i % unlocks.length][1] + (5 + Math.floor(Math.random() * 30)) * MINUTE;
      lengths[i] = m = Math.max(3, Math.round(m * BREAK_SHORT));
    } else {
      const from = Math.floor(Math.random() * 56);
      for (let k = 0; start < 0 && k < 56; k++) {
        const t = dayStart + (60 + ((from + k) % 56) * 15) * MINUTE;
        if (!near(t) && !placed.some(([a, b]) => t < b && a < t + m * MINUTE)) start = t;
      }
    }
    if (start < 0 || start + m * MINUTE > dayEnd) return;
    placed.push([start, start + m * MINUTE]);
    timed.push({ start: new Date(start).toISOString(), minutes: m, source: sources[i % sources.length] ?? "reading" });
  });
  timed.sort((a, b) => a.start.localeCompare(b.start));
  (score.stretches ??= {}).portal = timed.map((s) => s.minutes);
  (score.timed_stretches ??= {}).portal = timed;
  return { stretches: timed.length, spans: spans.length };
}
/** Every past Day the log keeps that the Ledger has. */
function fillBreaks(state, today) {
  let days = 0, spanDays = 0;
  for (let d = shiftDay(today, -183); d < today; d = shiftDay(d, 1)) {
    if (!state.days[d]) continue;
    const r = placeBreaks(state, d);
    days++;
    if (r.spans) spanDays++;
  }
  return "Stretch starts on " + days + " Days, Distraction spans on the " + spanDays + " with made-up Distraction time; about half the shorter stretches follow an Unlock";
}
/** The Days whose portal Distraction spans hold at least 15 minutes after 22:00. */
function lateDays(state) {
  const out = new Set();
  for (const [day, score] of Object.entries(state.days)) {
    const from = Date.parse(momentOf(state, day, 22)), to = Date.parse(momentOf(state, shiftDay(day, 1), 6));
    const late = (score.distraction_spans?.portal ?? []).reduce((t, [a, b]) => t + Math.max(0, Math.min(Date.parse(b), to) - Math.max(Date.parse(a), from)), 0);
    if (late >= 15 * MINUTE) out.add(day);
  }
  return out;
}

// ---- Sleep, calendar load, and energy ----
// Made-up months of all three for the Trends cards. Sleep goes in through the
// Ledger's own POST /sleep (as a phone with a watch would send it) for most
// nights; about one night in six has no session but device use either side of
// it (activity moments edited into the saved state), so the Ledger estimates
// it. Nights run later and longer at the weekend. Calendar events go in
// through POST /calendars and /calendar from a "portal" device, which becomes
// the reporting device; weekdays carry most meetings. Energy answers (edited
// in, since the Ledger takes them only for the last week) loosely follow the
// night before.

const PORTAL_CALENDARS = [
  { account: "portal@example.com", name: "Classes", color: "#0b8043" },
  { account: "portal@example.com", name: "Work", color: "#4285f4" },
  { account: "lab@example.edu", name: "Lab meetings", color: "#8e24aa" },
];
const rand = (lo, hi) => lo + Math.random() * (hi - lo);
/** 0 Sunday to 6 Saturday. */
const weekdayOf = (day) => new Date(day + "T12:00:00Z").getUTCDay();
/** The moment `minutes` after midnight starting `date`, in the Ledger's zone (may run into the next date). */
function at(state, date, minutes) {
  const day = minutes >= 1440 ? shiftDay(date, 1) : date;
  const m = minutes % 1440;
  // momentOf counts hours before 06:00 as the next date, so ask from the Day before.
  return m < 360 ? momentOf(state, shiftDay(day, -1), Math.floor(m / 60), m % 60) : momentOf(state, day, Math.floor(m / 60), m % 60);
}
/** A moment's local date and minutes after midnight, in the Ledger's zone. */
function localOf(state, iso) {
  const tz = state.settings.time_zone;
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", hourCycle: "h23" })
    .formatToParts(new Date(iso)).map((p) => [p.type, p.value]));
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minute: Number(parts.hour) * 60 + Number(parts.minute) };
}
/** One night ending on `day`'s morning: bed and wake in minutes after the evening's midnight, and whether it's estimated. Late Distraction the evening before puts bed about two hours later. */
function planNight(day, late = false) {
  const weekend = [0, 6].includes(weekdayOf(day));
  const bed = 1440 + (weekend ? 45 : -20) + Math.round(rand(-45, 45)) + (late ? Math.round(rand(110, 150)) : 0);
  const wake = 1440 + (weekend ? 560 : 450) + Math.round(rand(-35, 35));
  return { bed, wake, estimated: Math.random() < 0.16 };
}
/** The Days from `days` back to today, oldest first. */
const span = (today, days) => Array.from({ length: days + 1 }, (_, i) => shiftDay(today, i - days));

async function fillSleep(days) {
  const status = await call("GET", "/status");
  const today = status.today.day, state = { settings: status.settings };
  const sessions = [], estimated = [];
  let nights = [];
  // Use either side of each estimated night: a few moments before bed and after waking.
  await editState((st) => {
    const late = lateDays(st);
    nights = span(today, days).map((day) => ({ day, ...planNight(day, late.has(shiftDay(day, -1))) }));
    for (const n of nights) {
      const bedtime = at(state, shiftDay(n.day, -1), n.bed), wake = at(state, shiftDay(n.day, -1), n.wake);
      if (Date.parse(wake) > Date.now()) continue;
      if (n.estimated) { estimated.push({ bedtime, wake }); continue; }
      const length = n.wake - n.bed;
      sessions.push({ start: bedtime, end: wake, asleep: Math.round(length * rand(0.84, 0.95)), stages: Math.random() < 0.9, origin: "Samsung Health" });
    }
    st.activity ??= {};
    for (const e of estimated) {
      for (const [iso, offsets] of [[e.bedtime, [-50, -25, 0]], [e.wake, [0, 15, 40]]]) {
        for (const off of offsets) {
          const { date, minute } = localOf(st, new Date(Date.parse(iso) + off * 60_000).toISOString());
          const list = (st.activity[date] ??= []);
          if (!list.includes(minute)) list.push(minute);
          list.sort((a, b) => a - b);
        }
      }
    }
  });
  const since = at(state, shiftDay(today, -days - 1), 12 * 60);
  await call("POST", "/sleep", { device: "portal-phone", since, sessions });
  return "Sleep on " + nights.length + " nights: " + sessions.length + " from Health Connect, " + estimated.length + " left to estimate from device use";
}

async function fillCalendar(days) {
  days = Math.min(days, 183);
  const status = await call("GET", "/status");
  const today = status.today.day, state = { settings: status.settings };
  await call("POST", "/calendars", { device: "portal", calendars: PORTAL_CALENDARS });
  const events = [];
  let meetings = 0;
  for (const day of span(today, days)) {
    const wd = weekdayOf(day);
    const n = wd === 0 || wd === 6 ? (Math.random() < 0.35 ? 1 : 0) : 2 + Math.floor(Math.random() * 5);
    for (let i = 0; i < n; i++) {
      const start = (wd === 0 || wd === 6 ? 11 * 60 : 9 * 60) + Math.floor(Math.random() * (wd === 0 || wd === 6 ? 8 : 17)) * 30;
      const length = [30, 50, 60, 60, 90][Math.floor(Math.random() * 5)];
      events.push([at(state, day, start), at(state, day, start + length)]);
      meetings++;
    }
  }
  const reply = await call("POST", "/calendar", { device: "portal", from: shiftDay(today, -days), to: today, events });
  return "Calendar on " + reply.days + " Days: " + meetings + " meetings, from a \"portal\" device that now reports calendars";
}

/** Energy answers on about four Days in five, higher after a longer night and lower on a busy Day. */
function fillEnergy(days) {
  return editState((state, today) => {
    state.energy ??= {};
    const sessions = (state.sleep?.["portal-phone"] ?? []);
    let n = 0;
    for (const day of span(today, days)) {
      if (Math.random() < 0.2) { delete state.energy[day]; continue; }
      const night = sessions.find((s) => localOf(state, s.end).date === day);
      const rested = night ? (night.asleep - 420) / 70 : rand(-0.6, 0.6);
      // A busy calendar (four hours or more) wears it down.
      const busy = (state.calendar?.[day]?.busy_minutes ?? 0) >= 240 ? 1.2 : 0;
      state.energy[day] = Math.max(1, Math.min(5, Math.round(3 + rested - busy + rand(-1.1, 1.1))));
      n++;
    }
    return "Energy answered on " + n + " Days";
  });
}

async function clearMeasures(days) {
  const status = await call("GET", "/status");
  const state = { settings: status.settings };
  await call("POST", "/sleep", { device: "portal-phone", since: at(state, shiftDay(status.today.day, -366), 12 * 60), sessions: [] });
  // An empty choice clears the calendar load the Ledger keeps.
  await call("POST", "/calendars", { device: "portal", calendars: [] }).catch(() => {});
  await editState((st, today) => { st.activity = {}; for (const day of span(today, days)) delete st.energy?.[day]; });
  return "Sleep, calendar, and energy cleared";
}

async function measures(input) {
  const days = Math.max(7, Math.min(365, Number(input.days) || 120));
  switch (input.op) {
    case "sleep": return fillSleep(days);
    case "calendar": return fillCalendar(days);
    case "energy": return fillEnergy(days);
    case "all": return [await fillSleep(days), await fillCalendar(days), await fillEnergy(days)].join(". ");
    case "clear": return clearMeasures(days);
    default: throw new Error("unknown op " + input.op);
  }
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
      else if (input.clear) writeUsage({ minutes: {}, opens: {}, closedWithoutTearing: 0, hours: {} });
      else {
        if (input.app && input.minutes) {
          u.minutes[input.app] = (u.minutes[input.app] ?? 0) + Number(input.minutes);
          // This hour's minutes for the Ledger's chart, at most 60.
          u.hours = hoursOf(u);
          const h = (u.hours[input.app] ??= Array(24).fill(0));
          h[hourNow()] = Math.min(60, h[hourNow()] + Number(input.minutes));
        }
        if (input.app && input.open) u.opens[input.app] = (u.opens[input.app] ?? 0) + 1;
        if (input.closed) u.closedWithoutTearing += 1;
        writeUsage(u);
      }
      await reportUsage().catch(() => {});
      return send(res, 200, "application/json", JSON.stringify(usageReply()));
    }
    if (req.method === "POST" && req.url === "/api/minutes") return send(res, 200, "application/json", JSON.stringify(await addMinutes(input.source, Number(input.add))));
    if (req.method === "POST" && req.url === "/api/credit") return send(res, 200, "application/json", JSON.stringify(await call("POST", `/test/credit?count=${Number(input.count) || 1}`)));
    if (req.method === "POST" && req.url === "/api/task") return send(res, 200, "application/json", JSON.stringify(await call("POST", "/test/complete", { source: input.source, title: input.title })));
    if (req.method === "POST" && req.url === "/api/grace") return send(res, 200, "application/json", JSON.stringify(await call("POST", "/test/grace")));
    if (req.method === "POST" && req.url === "/api/usage-history") return send(res, 200, "application/json", JSON.stringify({ filled: await backfillUsage() }));
    if (req.method === "POST" && req.url === "/api/history") { await seedHistory(Number(input.days) || 28); return send(res, 200, "application/json", "{}"); }
    if (req.method === "POST" && req.url === "/api/measures") return send(res, 200, "application/json", JSON.stringify({ message: await measures(input) }));
    if (req.method === "POST" && req.url === "/api/past") return send(res, 200, "application/json", JSON.stringify({ message: await editState(pastChange(input)) }));
    // The Errors section: fault switches, and stopping or starting the Ledger.
    if (req.method === "GET" && req.url === "/api/faults") return send(res, 200, "application/json", JSON.stringify({ running: ledgerRunning(), faults: await faultsOn() }));
    if (req.method === "POST" && req.url === "/api/fault") {
      await call("POST", "/test/fault?mode=" + encodeURIComponent(input.mode) + "&on=" + (input.on ? 1 : 0));
      return send(res, 200, "application/json", JSON.stringify({ running: ledgerRunning(), faults: await faultsOn() }));
    }
    if (req.method === "POST" && req.url === "/api/ledger") {
      if (input.run && !ledgerRunning()) { startLedger(); await untilUp(); }
      if (!input.run) await stopLedger();
      return send(res, 200, "application/json", JSON.stringify({ running: ledgerRunning(), faults: await faultsOn() }));
    }
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
  .past { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 12px; }
  .past .src label { display: flex; align-items: center; gap: 8px; font-size: 13px; color: var(--muted); }
  .past input[type=number] { flex: 0 0 72px; }
  .past select { min-height: 40px; border-radius: 10px; border: 1px solid var(--line); background: var(--bg); color: var(--ink); padding: 0 10px; font: 14px var(--font); }
  .pick { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .pick input[type=date] { flex: 0 0 auto; }
  .on-now { color: var(--gold); }
  button[aria-pressed=true] { background: var(--gold); border-color: var(--gold); color: #1d1300; }
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
  <h2>Errors</h2>
  <span class="note">Makes the test Ledger misbehave so each error notice in the app shows up. Faults reset whenever the test Ledger restarts (Stop and Start, Past Days edits, a fresh Ledger).</span>
  <div class="grid" id="errors"></div>
  <h2>Past Days</h2>
  <span class="note">For the Trends cards: pick a Day, then add to it. Each change restarts the test Ledger for a moment.</span>
  <div class="pick"><input type="date" id="pday" aria-label="Day"><button data-pshift="-1">‹ Day before</button><button data-pshift="1">Day after ›</button>
    <label class="note"><input type="number" id="rdays" value="60" min="7" max="365" aria-label="Days back"> Days back</label><button class="go" data-past="random">Sprinkle random data</button></div>
  <div class="past">
    <div class="src"><span class="name">Goal and streaks</span>
      <div class="buttons"><button data-past="goal">Goal Day</button><button data-past="miss">Missed Day</button></div>
      <div class="row"><input type="number" id="streakn" value="5" min="1" max="120" aria-label="Streak length"><button data-past="streak">Streak this long, ending here</button></div></div>
    <div class="src"><span class="name">Marker</span>
      <div class="row"><input id="mtext" type="text" autocomplete="off" data-protonpass-ignore="true" data-1p-ignore="true" data-lpignore="true" data-bwignore="true" data-form-type="other" placeholder="New term starts" aria-label="Marker text"><input type="number" id="mhour" value="9" min="6" max="29" aria-label="Hour"></div>
      <div class="buttons"><button data-past="marker">Add Marker</button><label><input type="checkbox" id="mrule"> as a rule change</label></div></div>
    <div class="src"><span class="name">Curfew question</span>
      <div class="buttons"><button data-past="verdict" data-v="yes">Yes</button><button data-past="verdict" data-v="mostly">Mostly</button><button data-past="verdict" data-v="no">No</button><button data-past="verdict" data-v="">Clear</button></div></div>
    <div class="src"><span class="name">Unlock, with why</span>
      <div class="row"><select id="reason" aria-label="Reason"><option>Bored</option><option>Avoiding a task</option><option>Tired</option><option>Anxious</option><option>Urgent</option><option>Habit</option></select><input type="number" id="rhour" value="14" min="6" max="29" aria-label="Hour"><button data-past="reason">Add</button></div></div>
    <div class="src"><span class="name">Focus stretches</span>
      <div class="row"><input id="slist" type="text" autocomplete="off" data-form-type="other" placeholder="25, 40, 90 (blank: random)" aria-label="Stretch minutes"><button data-past="stretches">Set</button><button data-past="stretches-all" title="Every Day the log keeps, longer toward today">Fill every Day</button></div>
      <div class="row"><button data-past="breaks" title="Every past Day the log keeps: when each stretch started, and Distraction spans from its made-up minutes">Breaks before stretches</button><span class="detail">For Focus stretch length. Fill Distraction time first.</span></div></div>
    <div class="src"><span class="name">Blocked opens</span>
      <div class="row"><label>opens <input type="number" id="opens" value="8" min="0"></label><label>walked away <input type="number" id="walked" value="5" min="0"></label><button data-past="opens">Set</button></div></div>
    <div class="src"><span class="name">Phone silent</span>
      <div class="row"><label>from <input type="number" id="sfrom" value="14" min="6" max="29"></label><label>hours <input type="number" id="shours" value="2" min="1" max="12"></label><button data-past="silence">Add</button></div></div>
    <div class="src"><span class="name">Distraction time</span>
      <div class="buttons"><button data-past="usage">Make up this Day's</button></div></div>
    <div class="src"><span class="name">Sleep, calendar, and energy</span>
      <span class="detail">Fills the Days back set above (calendar: at most 183). Sleep runs later at the weekend and after late Distraction (from Breaks before stretches), about one night in six estimated; meetings mostly on weekdays; energy follows sleep and drops on busy Days.</span>
      <div class="buttons"><button class="go" data-measures="all">Fill every Day</button><button data-measures="sleep">Sleep</button><button data-measures="calendar">Calendar</button><button data-measures="energy">Energy</button><button class="danger" data-measures="clear">Clear</button></div></div>
  </div>
  <div class="buttons"><button id="history">Add 4 more weeks of made-up history</button><button id="usagehistory">Fill in Distraction time for past Days</button><button id="grace">Start a 2-day grace period</button><button class="danger" id="reset">Fresh test Ledger: empty Bank, empty Day</button></div>
</div>
<script>
// Defaults for sources with no colour chosen; names come from the Ledger.
const COLORS = { tasks: "#289ffb", obsidian: "#b57ae2", workout: "#e2781f", reading: "#c1d58a", anki: "#f4b3ec", steps: "#05afa5" };
const SERVICES = { todoist: "Todoist", clickup: "ClickUp" };
let NAMES = {};
const USAGE_APPS = ${JSON.stringify(USAGE_APPS)};
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

// Each fault the test Ledger can switch on: what the app shows, and how.
const FAULTS = [
  ["unauthorized", "Access code needed notice", "Every request answers 401"],
  ["garbled", "Ledger out of step notice", "/status and /day answer with a body that isn't JSON"],
  ["refuse-changes", "A Rules change refused", "Rules changes answer 400"],
  ["refuse-tear", "A tear refused", "Tearing a Voucher answers 409"],
  ["fail-marker", "A Marker that didn't save", "Adding a Marker answers 500"],
  ["fail-export", "Export failed", "Both exports answer 500"],
  ["token", "Tasks not counting notice", "Todoist and ClickUp report \"sign-in expired\""],
];
let ERRORS = { running: true, faults: [] };

function renderErrors(e) {
  ERRORS = e;
  const on = e.faults || [];
  const cards = FAULTS.map(([mode, shows, how]) => {
    const isOn = on.includes(mode);
    return '<div class="src' + (e.running ? '' : ' off') + '"><div class="top"><span class="name">' + shows + '</span><span class="detail' + (isOn ? ' on-now' : '') + '">' + (isOn ? 'on' : 'off') + '</span></div>'
      + '<span class="detail">' + how + '</span>'
      + '<div class="buttons"><button data-fault="' + mode + '" aria-pressed="' + isOn + '"' + (e.running ? '' : ' disabled') + '>' + (isOn ? 'Turn off' : 'Turn on') + '</button></div></div>';
  });
  cards.push('<div class="src"><div class="top"><span class="name">Ledger unreachable notice</span><span class="detail' + (e.running ? '' : ' on-now') + '">' + (e.running ? 'running' : 'stopped') + '</span></div>'
    + '<span class="detail">Stops the test Ledger process; Start brings it back with every fault off</span>'
    + '<div class="buttons"><button class="danger" data-ledger="stop"' + (e.running ? '' : ' disabled') + '>Stop Ledger</button><button class="go" data-ledger="start"' + (e.running ? ' disabled' : '') + '>Start Ledger</button></div></div>');
  $("errors").innerHTML = cards.join("");
}

/** Why the portal can't read the Ledger's status, when the Errors section caused it. */
function blockedBy(e) {
  if (!e.running) return "stopped";
  const on = e.faults || [];
  if (on.includes("unauthorized")) return "answering 401";
  if (on.includes("garbled")) return "answering garbled";
  return null;
}
const faultsText = (e) => (e.faults && e.faults.length ? "Faults on: " + e.faults.join(", ") : "No faults on");

function renderUsage(u) {
  const minutes = Object.fromEntries(u.apps.map((a) => [a.label, a.minutes]));
  const opens = Object.fromEntries(u.attempts.map((a) => [a.label, a.count]));
  const apps = USAGE_APPS.map((app) => '<div class="src"><div class="top"><span class="name">' + app + '</span><span class="detail">' + (minutes[app] ?? 0) + ' min · ' + (opens[app] ?? 0) + ' blocked opens</span></div>'
    + '<div class="buttons"><button data-uapp="' + app + '" data-umin="5">+5 min</button><button data-uapp="' + app + '" data-umin="15">+15 min</button><button data-uapp="' + app + '" data-uopen="1">+1 blocked open</button></div></div>').join("");
  const all = '<div class="src"><div class="top"><span class="name">All Distractions</span><span class="detail">' + u.blockedOpens + ' blocked opens · ' + u.closedWithoutTearing + ' left without unlocking</span></div>'
    + '<div class="buttons"><button data-uclosed="1">+1 left without unlocking</button><button data-ureset="1">Placeholder figures</button><button data-uclear="1" class="danger">Clear all</button></div></div>';
  $("usage").innerHTML = apps + all;
}

async function refresh() {
  if (busy) return;
  try { renderErrors(await api("GET", "/api/faults")); } catch (e) { toast("Can't reach the portal: " + (e.message || e), true); return; }
  try { render(await api("GET", "/api/status")); renderUsage(await api("GET", "/api/usage")); }
  catch (e) {
    // A fault or a stopped Ledger blocks the portal's reads too; say so in place of the figures.
    const why = blockedBy(ERRORS);
    if (why) { $("facts").innerHTML = fact("Test Ledger", why); renderUsage(await api("GET", "/api/usage").catch(() => ({ apps: [], attempts: [], blockedOpens: 0, closedWithoutTearing: 0 }))); }
    else toast("Can't reach the test Ledger: " + (e.message || e), true);
  }
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
  if (b.dataset.uclosed) act(() => api("POST", "/api/usage", { closed: true }), () => "One more left without unlocking");
  if (b.dataset.ureset) act(() => api("POST", "/api/usage", { reset: true }), () => "Placeholder Distraction time back");
  if (b.dataset.uclear) act(() => api("POST", "/api/usage", { clear: true }), () => "Distraction time cleared");
  if (b.dataset.credit) act(() => api("POST", "/api/credit", { count: Number(b.dataset.credit) }), (c) => "+" + c.kept + " in the Bank" + (c.forfeited ? ", " + c.forfeited + " over the limit" : ""));
  if (b.dataset.pshift) { const d = new Date($("pday").value + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(b.dataset.pshift)); $("pday").value = d.toISOString().slice(0, 10); }
  if (b.dataset.past) {
    const op = b.dataset.past, day = $("pday").value;
    const extra = { goal: {}, miss: {}, streak: { n: $("streakn").value }, marker: { text: $("mtext").value.trim(), hour: $("mhour").value, rule: $("mrule").checked },
      verdict: { verdict: b.dataset.v || null }, reason: { reason: $("reason").value, hour: $("rhour").value }, stretches: { list: $("slist").value },
      opens: { opens: $("opens").value, walked: $("walked").value }, silence: { from: $("sfrom").value, hours: $("shours").value }, usage: {}, breaks: {}, random: { days: $("rdays").value } }[op];
    if (op === "marker") $("mtext").value = "";
    act(() => api("POST", "/api/past", { op, day, ...extra }), (r) => r.message);
  }
  if (b.dataset.measures) act(() => api("POST", "/api/measures", { op: b.dataset.measures, days: $("rdays").value }), (r) => r.message);
  if (b.id === "history") act(() => api("POST", "/api/history", { days: 28 }), () => "Added 4 more weeks of made-up Days, before the oldest");
  if (b.id === "usagehistory") act(() => api("POST", "/api/usage-history"), (c) => "Distraction time made up for " + c.filled + " past Days");
  if (b.id === "grace") act(() => api("POST", "/api/grace"), () => "Grace period on: changes apply at once for 2 days");
  if (b.dataset.fault) {
    const mode = b.dataset.fault, on = b.getAttribute("aria-pressed") !== "true";
    act(() => api("POST", "/api/fault", { mode, on }), (e) => FAULTS.find((f) => f[0] === mode)[1] + (on ? ": fault on. " : ": fault off. ") + faultsText(e));
  }
  if (b.dataset.ledger) act(() => api("POST", "/api/ledger", { run: b.dataset.ledger === "start" }), (e) => e.running ? "Test Ledger started, every fault off" : "Test Ledger stopped: the app should say it can't reach it");
  if (b.id === "reset") act(() => api("POST", "/api/reset"), () => "Fresh test Ledger: Bank and Day emptied");
});
$("pday").value = new Date(Date.now() - 86400_000).toLocaleDateString("en-CA");
refresh();
setInterval(refresh, 2000);
</script></body></html>`;

startLedger();
await untilUp();
await finishSetup();
await reportUsage().catch((e) => console.error("couldn't report today's Distraction time:", e.message));
server.listen(PORT, () => {
  console.log(`test Ledger at ${LEDGER} (data in ${DATA}; access code in access.code)`);
  console.log(`portal at http://0.0.0.0:${PORT}`);
});
const quit = async () => { await stopLedger(); process.exit(0); };
process.on("SIGINT", quit);
process.on("SIGTERM", quit);
