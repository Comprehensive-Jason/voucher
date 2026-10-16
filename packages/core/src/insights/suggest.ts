// Suggestions: a rule change worth trying, framed as an Experiment, on the
// finding that calls for it. Only four rules, and only a change the rules
// allow right now:
//   - Curfew 30 minutes earlier, for late Distraction or late Distraction
//     rising, while Curfew can still start at 18:00 or later.
//   - A site on no blocklist that keeps taking Distraction time, onto the
//     switched-on blocklist that fits it. (An app can be added only where a
//     blocklist already has it switched off: Distraction time names apps,
//     and a blocklist needs the app's package.)
//   - Unlocks 5 minutes shorter, for Unlocks running into planned blocks or
//     Distraction per Unlock rising, down to 5 minutes.
//   - The Daily goal 2 higher when goal Days often went badly, or 2 lower
//     when missed Days often went well, within 1 to 30. From goal findings
//     too: 2 lower when its hit rate fell over the last 4 weeks, or when
//     meeting it goes with missing another goal (judged on that goal's
//     measure where Before and after has one); 2 higher when its hit rate
//     rose to 80% or more. Other goals get findings, never suggestions.
// None while an Experiment runs (the Ledger runs one at a time, so their
// verdicts don't muddle each other), and none for a rule with a change
// already waiting for the morning.
import type { MeasureId } from "../beforeAfter";
import { isDomain } from "../blocklists";
import type { Blocklist, Pending, Settings } from "../types";
import type { Context } from "./context";
import { hhmm, tryButton } from "./text";
import type { Finding, Suggestion } from "./types";

/** Earliest Curfew start (the Rules slider's track), and the step. */
const CURFEW_EARLIEST = 18 * 60, CURFEW_STEP = 30;
const UNLOCK_SHORTEST = 5, UNLOCK_STEP = 5;
const GOAL_LOWEST = 1, GOAL_HIGHEST = 30, GOAL_STEP = 2;

const minutesOf = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const timeOf = (m: number) => `${hhmm(m)}:00`;
const waiting = (pending: Pending[], key: string) => pending.some(([c]) => key in c);

/** Which kinds of site go on which blocklist, by words in the site and the list. */
const FITS: [RegExp, RegExp][] = [
  [/youtube|youtu\.be|twitch|vimeo|netflix|bilibili|nebula|dailymotion|crunchyroll|hulu|disney|piped|invidious/, /youtube|video|watch|stream/i],
  [/instagram|facebook|twitter|x\.com|threads|tiktok|snapchat|bsky|mastodon|rednote|xiaohongshu|weibo|pinterest|tumblr/, /instagram|social/i],
  [/reddit|news|ycombinator|lemmy|forum|substack|medium|digg|slashdot/, /reddit|news|forum/i],
  [/game|steam|chess|hoyo|genshin|epicgames|itch\.io|roblox/, /games?/i],
];

/** The switched-on blocklist a site fits, or the first switched-on one of your own. */
export function fittingList(site: string, lists: Record<string, Blocklist>): string | undefined {
  const on = Object.entries(lists).filter(([, l]) => l.on);
  for (const [sitePattern, listPattern] of FITS) {
    if (!sitePattern.test(site)) continue;
    const found = on.find(([id, l]) => listPattern.test(id) || listPattern.test(l.name));
    if (found) return found[0];
  }
  return on.find(([, l]) => !l.premade)?.[0];
}

function curfew(s: Settings, measure: MeasureId): Suggestion | null {
  const start = minutesOf(s.curfew_start), end = s.curfew_end.slice(0, 5);
  // Minutes since 18:00, so a Curfew starting after midnight still compares.
  const since = (m: number) => (m - CURFEW_EARLIEST + 1440) % 1440;
  if (since(start) < CURFEW_STEP) return null;
  const next = (start - CURFEW_STEP + 1440) % 1440;
  return {
    change: { Curfew: { start: timeOf(next), end: s.curfew_end } },
    text: `Curfew at ${hhmm(next)}`, button: tryButton(hhmm(next)),
    rule: "Curfew", was: `${hhmm(start)} to ${end}`, now: `${hhmm(next)} to ${end}`,
    tightens: true, measure, back: `Go back to ${hhmm(start)}`,
  };
}

function unlocks(s: Settings, measure: MeasureId): Suggestion | null {
  const next = s.unlock_minutes - UNLOCK_STEP;
  if (next < UNLOCK_SHORTEST) return null;
  return {
    change: { UnlockMinutes: next },
    text: `Unlocks of ${next} min`, button: tryButton(`${next} min`),
    rule: "Unlock length", was: `${s.unlock_minutes} min`, now: `${next} min`,
    tightens: true, measure, back: `Go back to ${s.unlock_minutes} min`,
  };
}

/** The Before and after measure a goal's measure is judged on, where there's one. */
const JUDGED: Record<string, MeasureId> = { asleep: "asleep", distraction: "distraction", unlocks: "unlocks", longest: "longest", vouchers: "earned" };

function goal(s: Settings, up: boolean, measure: MeasureId = "went_well"): Suggestion | null {
  const next = s.daily_goal + (up ? GOAL_STEP : -GOAL_STEP);
  if (next < GOAL_LOWEST || next > GOAL_HIGHEST) return null;
  return {
    change: { DailyGoal: next },
    text: `a Daily goal of ${next}`, button: tryButton(String(next)),
    rule: "Daily goal", was: String(s.daily_goal), now: String(next),
    tightens: up, measure, back: `Go back to a goal of ${s.daily_goal}`,
  };
}

function block(s: Settings, app: string): Suggestion | null {
  const lists = s.blocklists;
  if (isDomain(app)) {
    const list = fittingList(app, lists);
    if (!list) return null;
    return {
      change: { BlockSite: { list, site: { site: app, note: null, on: true, added: true } } },
      text: `${app} on ${lists[list].name}`, button: tryButton("blocking it"),
      rule: `Blocklist ${lists[list].name}`, was: `without ${app}`, now: `with ${app}`,
      tightens: true, measure: "distraction", back: `Unblock ${app}`,
    };
  }
  // An app switched off on a switched-on blocklist can be switched on.
  for (const [id, l] of Object.entries(lists)) {
    const off = l.on ? l.apps.find((a) => !a.on && a.label.toLowerCase() === app.toLowerCase()) : undefined;
    if (!off) continue;
    return {
      change: { BlockApp: { list: id, app: { ...off, on: true } } },
      text: `${off.label} on ${l.name}`, button: tryButton("blocking it"),
      rule: `Blocklist ${l.name}`, was: `${off.label} off`, now: `${off.label} on`,
      tightens: true, measure: "distraction", back: `Unblock ${off.label}`,
    };
  }
  return null;
}

/** A goal hit rate finding's last 4 weeks, from its picture. */
function recentRate(f: Finding): number {
  if (f.visual.kind !== "rates") return 0;
  const last = f.visual.rates.slice(-f.visual.recent).filter((r): r is number => r !== null);
  return last.length ? last.reduce((a, b) => a + b, 0) / last.length : 0;
}

/** What a Daily goal change for a conflict is judged on: the other goal's measure. */
function judgedOn(ctx: Context, f: Finding): MeasureId {
  const other = ctx.goals?.find((g) => f.goals?.includes(g.id) && !g.daily);
  return (other && JUDGED[other.measure]) ?? "went_well";
}

/** Puts a suggestion on the first finding that calls for each rule. */
export function suggest(findings: Finding[], ctx: Context): Finding[] {
  const s = ctx.settings;
  if (!s || ctx.experiments.some((e) => e.status === "running")) return findings;
  const late = ctx.days.slice(-7).some((d) => d.distraction_spans);
  const pick: [(f: Finding) => boolean, (f: Finding) => Suggestion | null, string][] = [
    [(f) => f.id === "shift:late" && f.value > 0 || f.id === "pattern:late" || f.id === "shift:distraction" && f.value > 0 && f.sentence.some((r) => r.text.includes(`after ${hhmm(minutesOf(s.curfew_start) - 60)}`)) || f.id === "cor:~late|~asleep|1" && f.pill?.tone === "worse",
      () => curfew(s, late ? "late" : "distraction"), "Curfew"],
    [(f) => f.id === "shift:per_unlock" && f.value > 0, () => unlocks(s, "per_unlock"), "UnlockMinutes"],
    [(f) => f.id === "pattern:into-planned", () => unlocks(s, "unlocked"), "UnlockMinutes"],
    [(f) => f.id === "pattern:goal-bad", () => goal(s, true), "DailyGoal"],
    [(f) => f.id === "pattern:goal-good", () => goal(s, false), "DailyGoal"],
    [(f) => f.id === "goal:shift:daily" && f.value < 0, () => goal(s, false, "earned"), "DailyGoal"],
    [(f) => f.id === "goal:shift:daily" && f.value > 0 && recentRate(f) >= 0.8, () => goal(s, true, "earned"), "DailyGoal"],
    [(f) => f.kind === "goal-pair" && f.value < 0 && !!f.goals?.includes("daily"), (f) => goal(s, false, judgedOn(ctx, f)), "DailyGoal"],
  ];
  const used = new Set<string>();
  const out = findings.map((f) => ({ ...f }));
  for (const [calls, make, key] of pick) {
    if (used.has(key) || waiting(ctx.pending, key)) continue;
    const f = out.find((x) => calls(x) && !x.suggestion);
    const suggestion = f ? make(f) : null;
    if (f && suggestion) { f.suggestion = suggestion; used.add(key); }
  }
  for (const f of out) {
    if (!f.id.startsWith("pattern:unlisted:") || f.suggestion) continue;
    const app = f.id.slice("pattern:unlisted:".length);
    if (waiting(ctx.pending, "BlockSite") || waiting(ctx.pending, "BlockApp")) continue;
    const suggestion = block(s, app);
    if (suggestion) { f.suggestion = suggestion; break; }
  }
  return out;
}
