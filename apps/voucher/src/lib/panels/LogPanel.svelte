<script lang="ts">
  // The Log: one Day's earnings and Redemptions, newest first, with the moment
  // the Daily goal was met marked in place. Arrows step through past Days.
  // `compact` is the tablet's side card: one line per entry, no totals.
  import { onMount } from "svelte";
  import { ledger } from "../api";
  import { POLL_MS } from "../live.svelte";
  import { sourceOf } from "../sources";
  import { clock, dayLabel, shiftDay } from "../time";
  import type { DaySummary } from "../types";

  let { compact = false }: { compact?: boolean } = $props();

  /** The Ledger keeps a month of entries; older Days have totals only. */
  const OLDEST = 30;

  let today = $state<string | null>(null);
  let timeZone = $state("UTC");
  let back = $state(0);
  let shown = $state<DaySummary | null>(null);
  let before = $state<DaySummary | null>(null);
  let error = $state<string | null>(null);

  const day = $derived(today ? shiftDay(today, -back) : null);

  type Row = { time: string; title: string; source: string; color: string; value: string; tone: "earn" | "spend" | "lost" | "goal" };
  const rows = $derived.by((): Row[] => {
    if (!shown) return [];
    const out: Row[] = [];
    for (const e of shown.log) {
      if (shown.goal_met_at && e.at === shown.goal_met_at && e.kind === "earned") {
        // The milestone sits just above the earning that met the goal.
        out.push({ time: clock(e.at, timeZone), title: "Daily goal met", source: `Streak: ${shown.streak} ${shown.streak === 1 ? "day" : "days"}`, color: "var(--goal)", value: "", tone: "goal" });
      }
      if (e.kind === "earned") {
        const s = sourceOf(e.task);
        // The compact card has no source line, so Focused time names its app.
        const title = compact && s.name !== "Tasks" && !e.task.startsWith("todoist") && !e.task.startsWith("clickup")
          ? `${s.name}, ${e.title}` : e.title || "A task";
        out.push({ time: clock(e.at, timeZone), title, source: e.kept ? s.name : `${s.name} · Bank full, lost`,
          color: s.color, value: e.kept ? "+1" : "+0", tone: e.kept ? "earn" : "lost" });
      } else if (e.kind === "gap") {
        const mins = Math.round((new Date(e.until).getTime() - new Date(e.at).getTime()) / 60000);
        out.push({ time: clock(e.at, timeZone), title: `Voucher was off for ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`,
          source: e.device, color: "#ff8a7a", value: "", tone: "lost" });
      } else {
        out.push({ time: clock(e.at, timeZone), title: `Redeemed ${e.tickets}, ${e.minutes} min`, source: "All distractions",
          color: "var(--ink)", value: `−${e.tickets}`, tone: "spend" });
      }
    }
    return out;
  });

  async function load() {
    try {
      // Asked every time, so the Log moves on when a new Day starts.
      const status = await ledger<{ today: DaySummary; settings: { time_zone: string } }>("GET", "/status");
      today = status.today.day;
      timeZone = status.settings.time_zone;
      const d = day!;
      [shown, before] = await Promise.all([
        ledger<DaySummary>("GET", `/day?date=${d}`),
        ledger<DaySummary>("GET", `/day?date=${shiftDay(d, -1)}`),
      ]);
      error = null;
    } catch (e) {
      error = String(e);
    }
  }

  function step(by: number) {
    back = Math.min(OLDEST, Math.max(0, back + by));
    load();
  }

  // Today's Log keeps itself current; a past Day doesn't change.
  onMount(() => {
    load();
    const timer = setInterval(() => { if (back === 0) load(); }, POLL_MS);
    return () => clearInterval(timer);
  });
</script>

<div class="log" class:compact>
  <header>
    {#if compact}<span class="cap">Log</span>{:else}<h1>Log</h1>{/if}
    <div class="switcher">
      <button class="day" aria-label="Previous day" disabled={back >= OLDEST} onclick={() => step(1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div class="cap label">{day && today ? dayLabel(day, today) : ""}</div>
      <button class="day" aria-label="Next day" disabled={back === 0} onclick={() => step(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if shown}
    {#if !compact}
    <div class="totals">
      <div><div class="cap">Earned</div><div class="mono big earn">+{shown.earned}</div></div>
      <div><div class="cap">Redeemed</div><div class="mono big spend">−{shown.redeemed}</div></div>
      <div><div class="cap">Unlocked</div><div class="mono big">{shown.unlocked_minutes} min</div></div>
    </div>
    {/if}

    <div class="rows">
      {#each rows as r}
        <div class="row">
          <span class="mono time">{r.time}</span>
          <span class="dot" style="background: {r.color}"></span>
          <span class="what">
            <span class="title" class:goal={r.tone === "goal"}>{r.title}</span>
            {#if !compact}<span class="src">{r.source}</span>{/if}
          </span>
          <span class="mono value {r.tone}">{r.value}</span>
        </div>
      {:else}
        <p class="empty">{shown.earned > 0 ? "Only this Day's totals are kept now." : "Nothing earned or torn this Day."}</p>
      {/each}
    </div>

    {#if before && day && today && !compact}
      <footer>
        <span>{dayLabel(shiftDay(day, -1), today)}: {before.earned} earned, {before.redeemed} redeemed</span>
        <span class="mono" class:met={before.goal_met}>{before.goal_met ? "goal met" : "goal missed"}</span>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .log { display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .switcher { display: flex; align-items: center; }
  .label { color: var(--ink); min-width: 92px; text-align: center; }
  .day { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--muted); }
  .day:disabled { opacity: .35; }
  .totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .totals > div { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .totals > div + div { border-left: 1px solid var(--line); }
  .big { font-size: 24px; font-weight: 700; line-height: 1; }
  .earn { color: var(--voucher); }
  .spend { color: var(--goal); }
  .rows { display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 44px 10px minmax(0, 1fr) auto; gap: 10px; align-items: center; height: 43px; border-bottom: 1px solid var(--divider); }
  .time { font-size: 12px; color: var(--muted); }
  .dot { width: 8px; height: 8px; border-radius: 50%; }
  .what { min-width: 0; }
  .title { display: block; font-size: 14px; font-weight: 500; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title.goal { color: var(--goal); }
  .src { display: block; font-size: 12px; line-height: 1.25; color: var(--muted); }
  .value { font-size: 14px; font-weight: 700; }
  .value.lost { color: var(--muted); }
  .empty { color: var(--muted); font-size: 14px; }
  footer { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); }
  footer .met { color: var(--goal); }
  .error { color: var(--goal); }
  .compact { gap: 2px; }
  .compact header { margin: -10px -12px 0 0; }
  .compact .label { min-width: 0; }
  .compact .row { height: auto; padding: 9px 0; grid-template-columns: 44px 10px minmax(0, 1fr) 28px; }
  .compact .title { font-size: 13px; font-weight: 400; line-height: 1.3; white-space: normal; }
  .compact .value { font-size: 13px; font-weight: 500; text-align: right; }
</style>
