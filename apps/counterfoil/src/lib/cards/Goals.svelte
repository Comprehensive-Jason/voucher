<script lang="ts">
  // How each goal is going: one row per goal, the Daily goal first. A row
  // has the goal's name and what it asks, a strip of its last 4 weeks of
  // Days (a Day goal) or 12 weeks (a week goal), gold where met, hollow
  // where missed, hatched where unknown, and dashed for the one still going;
  // then its streak, and its hit rate over the last 4 and 12 weeks as bars.
  // Tapping a row opens it in the goal editor (GoalSheet); + adds one. The
  // foot names the longest streak going.
  import TrendCard from "$core/components/TrendCard.svelte";
  import AboutText from "$core/components/AboutText.svelte";
  import Legend from "$core/components/Legend.svelte";
  import ScrollCue from "$core/components/ScrollCue.svelte";
  import { fitsSlot } from "$core/fit.svelte";
  import { evaluate, measureInfo, targetText, showValue, type Goal, type Named } from "$core/goals";
  import { goals } from "$core/goals.svelte";
  import { goalRuns } from "$core/insights/goals";
  import { reveal } from "$core/motion";
  import { styleOf } from "$core/sources";
  import { clock } from "$core/time";
  import type { DayTotal, Status } from "$core/types";
  import GoalSheet from "../GoalSheet.svelte";

  let { history, status }: { history: DayTotal[]; status: Status } = $props();
  const fit = fitsSlot();
  // Asked again with each new history (the dashboard's poll), so a goal set
  // on another device, or by the coach code, shows here too.
  $effect(() => { void history; goals.load(true, status.settings.daily_goal); });

  const named = (id: string): Named => { const s = styleOf(id); return { name: s.name, color: s.color }; };
  /** Finished periods in the strip: 4 weeks of Days, or 12 weeks. */
  const SHOWN = { day: 28, week: 12 } as const;

  const rows = $derived.by(() => {
    const reading = { timeZone: status.settings.time_zone, logFirstDay: status.log_first_day };
    const known = goals.list.flatMap((g) => { const info = measureInfo(g.measure, status.settings.sources, named); return info ? [{ g, info }] : []; });
    return known.map(({ g, info }) => {
      const r = evaluate(g, history, info, reading);
      const finished = r.periods.filter((p) => !p.current).slice(-SHOWN[g.period]);
      const current = r.periods.at(-1)?.current ? r.periods.at(-1)! : null;
      return { g, info, r, cells: [...finished, ...(current ? [current] : [])], name: goalRuns(g, info, known) };
    });
  });
  const best = $derived(rows.filter((x) => x.r.streak > 0).sort((a, b) => b.r.streak - a.r.streak)[0]);
  const unit = (g: Goal, n: number) => (g.period === "day" ? (n === 1 ? "Day" : "Days") : n === 1 ? "week" : "weeks");
  const pct = (x: { met: number; of: number } | null) => (x ? Math.round((x.met / x.of) * 100) : null);
  const when = (at: string) => clock(at, status.settings.time_zone);

  let editing = $state<Goal | "new" | null>(null);
  let scroller = $state<HTMLDivElement>();
  const keyOn = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
</script>

<TrendCard title="Goals">
  {#snippet tools()}
    <button class="iconbtn small add" aria-label="Add a goal" onclick={() => (editing = "new")}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
    </button>
  {/snippet}
  <div class="frame" class:fit>
    <ScrollCue target={scroller} />
    <div class="rows" bind:this={scroller}>
      <div class="heads" aria-hidden="true"><span></span><span></span><span>Streak</span><span>4 wk</span><span>12 wk</span></div>
      {#each rows as x (x.g.id)}
        <div class="row" role="button" tabindex="0" aria-label="Edit {x.name.map((r) => r.text).join('')}"
          onclick={() => (editing = x.g)} onkeydown={keyOn(() => (editing = x.g))} transition:reveal>
          <div class="who">
            <span class="name"><AboutText parts={x.name} /></span>
            <span class="asks">{targetText(x.g, x.info)}{#if x.g.pending}<b class="next">, then {x.g.pending.target} from {when(x.g.pending.at)}</b>{/if}</span>
          </div>
          <div class="strip" class:weeks={x.g.period === "week"} style="--n: {x.cells.length}"
            role="img" aria-label="{x.cells.filter((c) => c.cell === 'met').length} of the last {x.cells.length} {unit(x.g, x.cells.length)} met">
            {#each x.cells as c (c.key)}
              <i class="cell {c.cell}"
                title="{c.key}{c.value !== null ? `: ${showValue(x.info, c.value, { units: true })}` : ''}"></i>
            {/each}
          </div>
          <div class="streak"><b>{x.r.streak}</b><span>{unit(x.g, x.r.streak)}</span></div>
          {#each [x.r.rate4, x.r.rate12] as rate, i (i)}
            {@const p = pct(rate)}
            <div class="rate" aria-label="{i ? 'Last 12 weeks' : 'Last 4 weeks'}: {p === null ? 'unknown' : `${p}% met`}">
              <span class="bar"><i style="width: {p ?? 0}%"></i></span><span class="pct">{p === null ? "–" : `${p}%`}</span>
            </div>
          {/each}
        </div>
      {/each}
    </div>
  </div>
  <Legend items={[
    { kind: "box", color: "var(--goal)", label: "Met" },
    { kind: "frame", color: "var(--line-strong)", label: "Missed" },
    { kind: "hatch", label: "Unknown" },
    { kind: "outline", color: "var(--muted)", label: "Still going" },
  ]} />
  {#snippet foot()}
    {#if best}Longest streak going: <AboutText parts={best.name} />, <b>{best.r.streak}</b> {unit(best.g, best.r.streak)}.{:else}No goal is on a streak yet.{/if}
  {/snippet}
</TrendCard>
{#if editing}
  <GoalSheet goal={editing === "new" ? null : editing} {history} {status} onclose={() => (editing = null)} />
{/if}

<style>
  .frame { position: relative; display: flex; flex-direction: column; min-height: 0; }
  .frame.fit { flex: 1; }
  .rows { display: flex; flex-direction: column; }
  .fit .rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; margin: 0 -8px; padding: 0 8px; }
  .fit .rows::-webkit-scrollbar { display: none; }

  /* A row: who, the strip, the streak, and the two hit rates. */
  .heads, .row { display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(0, 1.5fr) 44px 58px 58px; gap: 4px 12px; align-items: center; }
  .heads { padding: 0 8px 2px; margin: 0 -8px; }
  .heads span { font: 600 9.5px var(--mono); letter-spacing: .1em; text-transform: uppercase; color: var(--faint); text-align: right; }
  .row { padding: 8px; margin: 0 -8px; border-bottom: 1px solid var(--divider); border-radius: 10px; cursor: pointer; transition: background-color var(--t-quick), var(--press); }
  .row:last-child { border-bottom-color: transparent; }
  .row:active { filter: var(--press-glow); }
  .row:focus-visible { outline: 2px solid var(--voucher); outline-offset: -2px; }
  .who { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .name { font-size: 13.5px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .asks { font-size: 11.5px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .next { font-weight: 600; color: var(--goal); }

  .strip { display: grid; grid-template-columns: repeat(var(--n), minmax(0, 1fr)); gap: 2px; height: 14px; }
  .strip.weeks { gap: 3px; }
  .cell { display: block; border-radius: 2px; transition: background-color var(--t-base); }
  .cell.met { background: var(--goal); }
  .cell.missed { box-shadow: inset 0 0 0 1.5px var(--line-strong); }
  .cell.none { background: repeating-linear-gradient(135deg, var(--hatch-key) 0 2px, transparent 2px 4px); opacity: .6; }
  .cell.open { outline: 1.5px dashed var(--muted); outline-offset: -1.5px; }

  .streak { display: flex; flex-direction: column; align-items: flex-end; line-height: 1.1; }
  .streak b { font: 700 15px var(--mono); color: var(--ink); }
  .streak span { font-size: 10px; color: var(--muted); }
  .rate { display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
  .rate .bar { width: 100%; height: 4px; background: var(--well); }
  .rate .bar i { background: var(--goal); }
  .pct { font: 600 11.5px var(--mono); color: var(--ink-soft); }
  .add { color: var(--ink-soft); }

  /* A narrow card (the phone, a one-column slot): the strip takes a line of its own. */
  @container card (max-width: 480px) {
    .heads, .row { grid-template-columns: minmax(0, 1fr) 40px 50px 50px; }
    .heads span:nth-child(2) { display: none; }
    .strip { grid-column: 1 / -1; grid-row: 2; }
  }
</style>
