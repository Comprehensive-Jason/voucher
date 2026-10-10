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
// app can colour each one by its list.
const USAGE_APPS = ["Instagram", "YouTube", "X", "rednote", "Mihon", "Reddit", "bilibili", "HoYoLAB", "Samsung Internet",
  // More, to make the list long enough to scroll.
  "Genshin Impact", "WoT Blitz", "Mindustry", "Plague Inc.", "After Inc.", "pixiv", "AniList", "Discord", "Grayjay", "Patreon"];
function placeholderUsage() {
  return {
    minutes: { Instagram: 14, YouTube: 8, X: 11, rednote: 6, Mihon: 9, Reddit: 4, bilibili: 5, HoYoLAB: 2, "Samsung Internet": 1,
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
/** Which switched-on blocklist each app is on, as a phone would say: the one
 *  naming it, or for a game, one blocking every game. Unlisted apps are left out. */
function listsFor(apps, blocklists) {
  const on = Object.entries(blocklists).filter(([, l]) => l.on);
  const out = {};
  for (const app of apps) {
    const named = on.find(([, l]) => l.apps.some((a) => a.label.toLowerCase() === app.toLowerCase()));
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
  return call("POST", "/usage", { device: "portal", day: status.today.day, apps: u.hours, lists: listsFor(Object.keys(u.hours), status.settings.blocklists),
    stretches: u.stretches, opens, walked: Math.min(u.closedWithoutTearing, opens) });
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
    if (input.op !== "random" && (!/^\d{4}-\d{2}-\d{2}$/.test(day ?? "") || day > today)) throw new Error("pick a Day up to today");
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
    if (req.method === "POST" && req.url === "/api/past") return send(res, 200, "application/json", JSON.stringify({ message: await editState(pastChange(input)) }));
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
      <div class="row"><input id="slist" type="text" autocomplete="off" data-form-type="other" placeholder="25, 40, 90 (blank: random)" aria-label="Stretch minutes"><button data-past="stretches">Set</button></div></div>
    <div class="src"><span class="name">Blocked opens</span>
      <div class="row"><label>opens <input type="number" id="opens" value="8" min="0"></label><label>walked away <input type="number" id="walked" value="5" min="0"></label><button data-past="opens">Set</button></div></div>
    <div class="src"><span class="name">Phone silent</span>
      <div class="row"><label>from <input type="number" id="sfrom" value="14" min="6" max="29"></label><label>hours <input type="number" id="shours" value="2" min="1" max="12"></label><button data-past="silence">Add</button></div></div>
    <div class="src"><span class="name">Distraction time</span>
      <div class="buttons"><button data-past="usage">Make up this Day's</button></div></div>
  </div>
  <div class="buttons"><button id="history">Add 4 more weeks of made-up history</button><button id="usagehistory">Fill in Distraction time for past Days</button><button id="grace">Start a 2-day grace period</button><button class="danger" id="reset">Fresh test Ledger: empty Bank, empty Day</button></div>
</div>
<script>
// Defaults for sources with no colour chosen; names come from the Ledger.
const COLORS = { tasks: "#5b9cff", obsidian: "#b08cff", workout: "#e2781f", reading: "#c1d58a", anki: "#f3b2e6", steps: "#05afa5" };
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
  if (b.dataset.uclosed) act(() => api("POST", "/api/usage", { closed: true }), () => "One more left without unlocking");
  if (b.dataset.ureset) act(() => api("POST", "/api/usage", { reset: true }), () => "Placeholder Distraction time back");
  if (b.dataset.uclear) act(() => api("POST", "/api/usage", { clear: true }), () => "Distraction time cleared");
  if (b.dataset.credit) act(() => api("POST", "/api/credit", { count: Number(b.dataset.credit) }), (c) => "+" + c.kept + " in the Bank" + (c.forfeited ? ", " + c.forfeited + " over the limit" : ""));
  if (b.dataset.pshift) { const d = new Date($("pday").value + "T12:00:00Z"); d.setUTCDate(d.getUTCDate() + Number(b.dataset.pshift)); $("pday").value = d.toISOString().slice(0, 10); }
  if (b.dataset.past) {
    const op = b.dataset.past, day = $("pday").value;
    const extra = { goal: {}, miss: {}, streak: { n: $("streakn").value }, marker: { text: $("mtext").value.trim(), hour: $("mhour").value, rule: $("mrule").checked },
      verdict: { verdict: b.dataset.v || null }, reason: { reason: $("reason").value, hour: $("rhour").value }, stretches: { list: $("slist").value },
      opens: { opens: $("opens").value, walked: $("walked").value }, silence: { from: $("sfrom").value, hours: $("shours").value }, usage: {}, random: { days: $("rdays").value } }[op];
    if (op === "marker") $("mtext").value = "";
    act(() => api("POST", "/api/past", { op, day, ...extra }), (r) => r.message);
  }
  if (b.id === "history") act(() => api("POST", "/api/history", { days: 28 }), () => "Added 4 more weeks of made-up Days, before the oldest");
  if (b.id === "usagehistory") act(() => api("POST", "/api/usage-history"), (c) => "Distraction time made up for " + c.filled + " past Days");
  if (b.id === "grace") act(() => api("POST", "/api/grace"), () => "Grace period on: changes apply at once for 2 days");
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
