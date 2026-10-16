#!/usr/bin/env node
// Spawns the built server (dist/server.js) over stdio, as Claude Code or
// OpenCode would, and calls every tool against a TEST Ledger: it adds,
// changes, and removes a goal, and moves the Daily goal and back. Never
// point it at a real Ledger.
//
//   MCP_TEST_LEDGER=http://127.0.0.1:8890 MCP_TEST_CODE_FILE=path/to/access.coach.code \
//     npm test -w packages/mcp
//
// Checks: the tool list and that each write tool says loosening the Daily
// goal waits until 06:00; every read tool answers JSON; a goal round trip;
// the Daily goal through /change (waiting for the next Day); and refusals
// (removing the Daily goal, a bad measure, a clock time where a number goes).
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";

const url = process.env.MCP_TEST_LEDGER, codeFile = process.env.MCP_TEST_CODE_FILE;
if (!url || !codeFile) {
  console.error("Set MCP_TEST_LEDGER and MCP_TEST_CODE_FILE to a test Ledger and its coach code file.");
  process.exit(2);
}
const server = fileURLToPath(new URL("../dist/server.js", import.meta.url));
const transport = new StdioClientTransport({
  command: process.execPath, args: [server],
  env: { PATH: process.env.PATH ?? "", COUNTERFOIL_LEDGER_URL: url, COUNTERFOIL_CODE_FILE: codeFile },
  stderr: "inherit",
});
const client = new Client({ name: "counterfoil-smoke", version: "0.1.0" });
await client.connect(transport);

let failures = 0;
async function check(name, fn) {
  try { await fn(); console.log(`ok   ${name}`); } catch (e) { failures++; console.log(`FAIL ${name}: ${e.message}`); }
}
/** Calls a tool and parses its JSON, or returns its error text with `error: true`. */
async function call(name, args = {}) {
  const r = await client.callTool({ name, arguments: args });
  const text = r.content?.[0]?.text ?? "";
  return r.isError ? { error: true, text } : JSON.parse(text);
}

const { tools } = await client.listTools();
const names = tools.map((t) => t.name).sort();
await check("lists exactly the eleven tools", () => assert.deepEqual(names, [
  "create_goal", "delete_goal", "get_day", "get_insights", "list_blocklists", "list_days", "list_experiments", "list_goals", "list_markers", "list_sources", "update_goal",
]));
await check("every write tool says loosening the Daily goal waits until 06:00", () => {
  for (const t of tools.filter((t) => !t.annotations?.readOnlyHint)) assert.match(t.description, /loosening \(lowering\) it waits until 06:00/, t.name);
});
await check("read tools are marked read-only", () => {
  for (const t of tools.filter((t) => t.name.startsWith("list_") || t.name.startsWith("get_"))) assert.equal(t.annotations?.readOnlyHint, true, t.name);
});

const today = new Date().toISOString().slice(0, 10);
const weekAgo = new Date(Date.now() - 7 * 86_400_000).toISOString().slice(0, 10);
await check("list_days", async () => {
  const r = await call("list_days", { from: weekAgo });
  assert.ok(r.days.length >= 7, "a week of Days");
  assert.ok("vouchers" in r.days[0] && "daily_goal_met" in r.days[0]);
});
await check("get_day", async () => {
  const r = await call("get_day", { date: weekAgo });
  assert.equal(r.day, weekAgo);
  assert.ok(Array.isArray(r.log));
});
await check("list_sources and list_blocklists (names only)", async () => {
  const s = await call("list_sources");
  assert.ok(s.sources.some((x) => x.id === "tasks" && x.earns));
  const b = await call("list_blocklists");
  assert.ok(b.blocklists.length > 0);
  for (const l of b.blocklists) assert.deepEqual(Object.keys(l).sort(), ["id", "name", "on"]);
});
await check("list_markers and list_experiments", async () => {
  assert.ok(Array.isArray((await call("list_markers")).markers));
  assert.ok(Array.isArray((await call("list_experiments")).experiments));
});
await check("get_insights", async () => {
  const r = await call("get_insights", { limit: 5 });
  assert.ok(Array.isArray(r.findings));
  for (const f of r.findings) assert.ok(f.id && f.says);
});

const before = await call("list_goals");
const daily = before.goals.find((g) => g.id === "daily");
await check("list_goals starts with the Daily goal", () => {
  assert.equal(before.goals[0].id, "daily");
  assert.ok("hit_rate_4_weeks" in daily && Array.isArray(daily.last_12));
});

let made;
await check("create_goal, then update_goal, then delete_goal", async () => {
  const c = await call("create_goal", { measure: "bedtime", direction: "at_most", target: "23:30", period: "day" });
  made = c.goals.find((g) => g.measure === "bedtime" && g.direction === "at_most" && g.period === "day");
  assert.ok(made, "the new goal is listed");
  assert.equal(made.target, "23:30");
  const u = await call("update_goal", { id: made.id, target: "23:00" });
  assert.equal(u.goals.find((g) => g.id === made.id).target, "23:00");
  const d = await call("delete_goal", { id: made.id });
  assert.ok(!d.goals.some((g) => g.id === made.id));
  made = null;
});
await check("update_goal moves the Daily goal through /change, from the next Day", async () => {
  const r = await call("update_goal", { id: "daily", target: daily.target + 1 });
  assert.ok(r.daily_goal.starts, "says when it starts");
  const now = r.goals.find((g) => g.id === "daily");
  assert.equal(now.target, daily.target, "today's target is unchanged");
  assert.equal(now.pending?.target, daily.target + 1);
  // Back again: the newer request replaces the one waiting.
  const back = await call("update_goal", { id: "daily", target: daily.target });
  assert.equal(back.goals.find((g) => g.id === "daily").pending?.target, daily.target);
});
await check("refusals", async () => {
  assert.equal((await call("delete_goal", { id: "daily" })).error, true);
  assert.equal((await call("update_goal", { id: "daily", period: "week" })).error, true);
  assert.equal((await call("create_goal", { measure: "mood", direction: "at_least", target: 3, period: "day" })).error, true);
  assert.equal((await call("create_goal", { measure: "focus", direction: "at_least", target: "01:30", period: "day" })).error, true);
  assert.equal((await call("create_goal", { measure: "vouchers", direction: "at_least", target: 9, period: "day" })).error, true, "the Daily goal's twin");
});

if (made) await call("delete_goal", { id: made.id });
await client.close();
console.log(failures ? `${failures} failed` : `all passed (${today})`);
process.exit(failures ? 1 : 0);
