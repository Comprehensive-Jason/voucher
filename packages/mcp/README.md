# Counterfoil MCP server

A stdio [MCP](https://modelcontextprotocol.io) server that lets an AI assistant (Claude Code, OpenCode) read your Ledger the way Counterfoil does, and set goals. It runs on the machine the assistant runs on and reaches the Ledger over Tailscale with the Ledger's **coach code**.

It can:

- **Read:** Days in a date range, one Day in detail, goals with their hit rates, the current Insights findings, Markers, Experiments, Activity sources, and blocklists (names only).
- **Write:** add, change, and remove goals, including the Daily goal.

It can't: change any rule but the Daily goal, Redeem or Unlock, answer the Curfew question, check in, or report anything for a device. The Ledger enforces the same: the coach code gets 403 for anything else.

## The tools

| Tool | What it answers or does |
|---|---|
| `list_days` | Each Day's totals from `from` to `to` (default today), oldest first: `vouchers`, `daily_goal`, `daily_goal_met`, `vouchers_by_source`, `vouchers_spent`, `unlocks`, `unlocked_min`, `distraction_min`, `distraction_by_app_min`, `focus_min`, `longest_stretch_min`, `blocked_opens`, `walked_away`, `sleep` (`asleep_min`, `bedtime`, `wake`, `source`), `calendar` (`events`, `busy_min`), `curfew_answer`, and `planned` (`blocks`, `min`, `done`, `distraction_min`). `null` means unknown, not zero. Up to 400 Days back. |
| `get_day` | One Day's totals plus its log (Vouchers with source and task title, Unlocks, Gaps), Markers, Unlock reasons, streak, and when the goal was met. |
| `list_goals` | Every goal, the Daily goal first: measure, direction, target, period, what it asks in words, streak, hit rate over the last 4 and 12 weeks, the current Day or week, and the last 12 periods. |
| `get_insights` | Insights' findings, ranked, as Counterfoil shows them, goal findings included. `confidence` is Low, Medium, or High. |
| `list_markers` | Markers, optionally between two dates. |
| `list_experiments` | Every Experiment and its verdict. |
| `list_sources` | The Activity sources and their Earning rates. |
| `list_blocklists` | The blocklists by name, and whether each is on. |
| `create_goal` | Adds a goal. |
| `update_goal` | Changes a goal; with id `daily`, moves the Daily goal. |
| `delete_goal` | Removes a goal (never the Daily goal). |

Goal measures are the ones `/history` carries: `vouchers`, `source:<id>` (a source's Vouchers; `source:tasks` counts finished Todoist and ClickUp tasks at 1 per task), `source_days:<id>` (Days a source earned, weekly only), `focus`, `longest`, `distraction`, `unlocks`, `asleep`, `bedtime`, and `wake` (clock times as `"HH:MM"`).

**The Daily goal changes through the Ledger's `POST /change`, like everywhere else.** A new target never applies today: it starts with the next Day at 06:00, so lowering it (a loosening) waits until 06:00 like every loosening, and the change shows in Voucher's Waiting changes and as a rule Marker. Every write tool's description says so, so the assistant can tell you.

### Where the findings come from

`get_insights` and `list_goals` run core's own code (`packages/core/src/insights` and `goals.ts`) here in Node, so an assistant sees the same hit rates and findings as the Goals and Insights cards. The build compiles core's source into `dist/server.js`, running Svelte's compiler over core's `.svelte.ts` modules for the server, where `$state` is a plain value. The Ledger itself only keeps the history; it never works out findings.

## Install

Node 22 or later. From the repository's root:

```sh
npm ci
npm run mcp:build      # writes packages/mcp/dist/server.js
```

Rebuild after pulling changes to `packages/core` or `packages/mcp`.

## The coach code

On the Ledger's machine, ask for one by creating an empty file in its data folder and restarting it:

```sh
touch /path/to/voucher-data/access.coach.code
# restart the Ledger; it fills the file with a fresh code and logs it once
```

Or set `VOUCHER_COACH_CODE` in the Ledger's environment. Copy the code to the machine the assistant runs on, into a file only you can read:

```sh
install -m 600 /dev/null ~/.config/counterfoil/coach.code   # then paste the code into it
```

Keep the Ledger's own access code out of this server: the coach code is enough for everything it does.

## Environment

| Variable | What |
|---|---|
| `COUNTERFOIL_LEDGER_URL` | The Ledger's address over Tailscale, such as `http://100.64.0.1:8787`. Required. |
| `COUNTERFOIL_CODE_FILE` | A file holding the coach code. Preferred over `COUNTERFOIL_CODE`, so the code stays out of config files. |
| `COUNTERFOIL_CODE` | The coach code itself, if you'd rather. |

## Add it to Claude Code

```sh
claude mcp add counterfoil --scope user \
  -e COUNTERFOIL_LEDGER_URL=http://100.64.0.1:8787 \
  -e COUNTERFOIL_CODE_FILE=$HOME/.config/counterfoil/coach.code \
  -- node /path/to/voucher/packages/mcp/dist/server.js
```

On Windows, give `node` the full path to `dist\server.js` and the code file, such as `C:\Users\you\...\coach.code`.

## Add it to OpenCode

In `opencode.json` (or the global `~/.config/opencode/opencode.json`):

```json
{
  "mcp": {
    "counterfoil": {
      "type": "local",
      "command": ["node", "/path/to/voucher/packages/mcp/dist/server.js"],
      "enabled": true,
      "environment": {
        "COUNTERFOIL_LEDGER_URL": "http://100.64.0.1:8787",
        "COUNTERFOIL_CODE_FILE": "/home/you/.config/counterfoil/coach.code"
      }
    }
  }
}
```

### With rulesync

If your MCP servers are generated by rulesync, add the server to its MCP source file instead of the tools' own configs, then regenerate. In rulesync's `mcpServers` form:

```json
{
  "mcpServers": {
    "counterfoil": {
      "type": "stdio",
      "command": "node",
      "args": ["/path/to/voucher/packages/mcp/dist/server.js"],
      "env": {
        "COUNTERFOIL_LEDGER_URL": "http://100.64.0.1:8787",
        "COUNTERFOIL_CODE_FILE": "/home/you/.config/counterfoil/coach.code"
      }
    }
  }
}
```

Match the shape of the entries already in that file if they differ.

## Test it

Against a **test** Ledger only: the test adds, changes, and removes a goal, and moves the Daily goal and back (which leaves a Daily goal change waiting for the next Day).

```sh
MCP_TEST_LEDGER=http://127.0.0.1:8890 MCP_TEST_CODE_FILE=/path/to/test-data/access.coach.code \
  npm run mcp:test
```

It builds the server, spawns it over stdio as an assistant would, lists the tools, checks every write tool's Daily goal warning, calls every tool, and checks the refusals.

To poke at it by hand with the MCP Inspector's command line:

```sh
npx @modelcontextprotocol/inspector@0.17.5 --cli \
  -e COUNTERFOIL_LEDGER_URL=http://127.0.0.1:8890 -e COUNTERFOIL_CODE_FILE=/path/to/access.coach.code \
  node packages/mcp/dist/server.js --method tools/call --tool-name list_goals
```
