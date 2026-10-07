<script lang="ts">
  // Trends: today's earnings hour by hour, twelve weeks of Days, and time
  // spent in Distractions today.
  import { onMount } from "svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import { SOURCES, sourceOf } from "$lib/sources";
  import { hourOf } from "$lib/time";
  import type { DaySummary, DayTotal, DeviceUsage } from "$lib/types";

  const FIRST_HOUR = 6;
  const HOURS = 18; // 06 to 23; anything after midnight joins the last column
  const CHART = 84; // px

  let today = $state<DaySummary | null>(null);
  let timeZone = $state("UTC");
  let history = $state<DayTotal[]>([]);
  let usage = $state<DeviceUsage | null>(null);
  let error = $state<string | null>(null);

  const columns = $derived.by(() => {
    const cols = Array.from({ length: HOURS }, () => ({ blocks: [] as string[], redeemed: false }));
    for (const e of [...(today?.log ?? [])].reverse()) {
      const h = hourOf(e.at, timeZone);
      const col = h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
      if (e.kind === "earned") cols[col].blocks.push(sourceOf(e.task).color);
      else cols[col].redeemed = true;
    }
    return cols;
  });
  // Blocks are 22 px until a busy hour needs them smaller to fit.
  const block = $derived.by(() => {
    const most = Math.max(1, ...columns.map((c) => c.blocks.length));
    return Math.min(22, (CHART - (most - 1) * 2) / most);
  });

  // Twelve weeks, a column per week from Monday; days still to come stay blank.
  const cells = $derived.by(() => {
    const out: { level: number; future: boolean; day?: string }[] = [];
    for (const d of history) {
      const goal = today?.goal ?? 16;
      const level = d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3));
      out.push({ level, future: false, day: d.day });
    }
    while (out.length % 7) out.push({ level: 0, future: true });
    return out;
  });

  const usedMinutes = $derived(usage ? usage.apps.reduce((n, a) => n + a.minutes, 0) : 0);
  const APP_COLORS = ["#e5609b", "#ff6b5b", "#ff8a3d", "#c9cdd1"];

  onMount(async () => {
    try {
      const status = await ledger<{ today: DaySummary; settings: { time_zone: string } }>("GET", "/status");
      today = status.today;
      timeZone = status.settings.time_zone;
      // Days since Monday (0 to 6), so the grid's rows are weekdays.
      const weekday = (new Date(`${today.day}T12:00:00Z`).getUTCDay() + 6) % 7;
      history = await ledger<DayTotal[]>("GET", `/history?days=${77 + weekday + 1}`);
      usage = await deviceUsage();
      error = null;
    } catch (e) {
      error = String(e);
    }
  });
</script>

<main>
  <header>
    <h1>Trends</h1>
    {#if today && today.streak > 0}
      <div class="streak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
        {today.streak} day streak
      </div>
    {/if}
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if today}
    <section class="card">
      <div class="head"><span class="cap">Today, by hour</span><span class="cap earn">+{today.earned} · −{today.redeemed}</span></div>
      <div class="chart" style="height: {CHART}px">
        {#each columns as c}
          <div class="col">
            {#each c.blocks as color}<div class="block" style="height: {block}px; background: {color}"></div>{/each}
          </div>
        {/each}
      </div>
      <div class="dots">
        {#each columns as c}<div><i class:on={c.redeemed}></i></div>{/each}
      </div>
      <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
      <div class="legend">
        {#each Object.values(SOURCES) as s}<span><i style="background: {s.color}"></i>{s.short}</span>{/each}
        <span><i class="round"></i>Redeemed (dot)</span>
      </div>
    </section>

    <section class="card">
      <div class="cap">Vouchers earned, 12 weeks</div>
      <div class="heat">
        {#each cells as c}<div class="h h{c.level}" class:future={c.future} title={c.day}></div>{/each}
      </div>
      <div class="heatkey">
        <span class="scale">Fewer<i class="h"></i><i class="h h1"></i><i class="h h2"></i><i class="h h3"></i><i class="h h4"></i>More</span>
        <span>Brightest: {today.goal}+, goal met</span>
      </div>
    </section>

    <section class="card">
      <div class="head">
        <span class="cap">In Distractions today</span>
        <span class="cap spend">{usage ? `${usedMinutes} of ${today.unlocked_minutes} min` : ""}</span>
      </div>
      {#if usage}
        {#each usage.apps.slice(0, 4) as a, i}
          <div class="app">
            <div class="name">{a.label}</div>
            <div class="bar"><i style="width: {(a.minutes / Math.max(1, usage.apps[0].minutes)) * 100}%; background: {APP_COLORS[i]}"></i></div>
            <div class="mono min">{a.minutes} min</div>
          </div>
        {:else}
          <div class="note">No time in Distractions today.</div>
        {/each}
        <div class="note">{usage.blockedOpens} blocked opens, {usage.closedWithoutTearing} closed without tearing</div>
      {:else}
        <div class="note">Needs usage access on this phone. Turn it on in Rules, under Protection.</div>
      {/if}
    </section>
  {/if}
</main>

<style>
  main { padding: calc(22px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .streak { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--goal-bg); color: var(--goal); font-size: 13px; font-weight: 700; }
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; }
  .earn { color: var(--voucher); }
  .spend { color: var(--goal); }
  .chart { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; align-items: end; border-bottom: 1px solid #3a3f45; }
  .col { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; height: 100%; }
  .block { border-radius: 3px; }
  .dots { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; }
  .dots i.on { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  .legend { display: flex; column-gap: 12px; row-gap: 6px; flex-wrap: wrap; font-size: 12px; color: #c9cdd1; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; }
  .legend i.round { border-radius: 50%; background: var(--ink); }
  .heat { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(7, auto); grid-auto-flow: column; gap: 4px; }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: #3ddc84; }
  .h.future { background: transparent; }
  .heatkey { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
  .scale { display: flex; align-items: center; gap: 4px; }
  .scale i { width: 12px; display: inline-block; }
  .app { display: grid; grid-template-columns: 84px minmax(0, 1fr) 48px; gap: 10px; align-items: center; }
  .name { font-size: 13px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .min { font-size: 12px; text-align: right; color: var(--muted); }
  .note { font-size: 12px; color: var(--muted); }
  .error { color: var(--goal); }
</style>
