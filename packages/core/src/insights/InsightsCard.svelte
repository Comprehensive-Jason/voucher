<script lang="ts">
  // Insights: what the history turned up, every kind of finding in one list
  // like the Log's, ranked by size and how sure (insights/rank.ts). Each
  // row: its sentence (what and when, with sources and blocklists in their
  // own colors), a small picture, the change as a pill, how sure as bars
  // (none for records and lapses), and a × that dismisses it until it
  // changes a lot. The top-ranked row is raised; the first three come
  // first, then any Experiment running, in progress, then "N more". Tapping
  // a row opens its proof.
  //
  // Where the app may change rules (`actions`, Voucher), a row with a
  // suggestion has a compact "Try …" button, a running Experiment shows as
  // "Trying …, Day d of 14", and a judged one asks Keep it or Go back.
  // Without them (Counterfoil, which only reads) it shows findings only,
  // and nothing can be dismissed.
  //
  // Under two weeks of history it says how many Days until the first
  // findings, with what each kind is waiting on.
  //
  // Goal findings come from the goals the Ledger keeps (GET /goals); with
  // `goalScope="productive"` (Voucher) only those about work show.
  import TrendCard from "../components/TrendCard.svelte";
  import AboutText from "../components/AboutText.svelte";
  import ScrollCue from "../components/ScrollCue.svelte";
  import Marker from "../components/Marker.svelte";
  import { fitsSlot } from "../fit.svelte";
  import { correlateOff } from "../correlateOff";
  import type { Tested } from "../correlate";
  import { curfew } from "../curfew.svelte";
  import { comparedDays, goodDaySetup, readOf } from "../goodDays";
  import { notes } from "../notes.svelte";
  import { reveal } from "../motion";
  import { actionFailed } from "../toast.svelte";
  import type { Blocklist, DayTotal, Pending, Settings, Source } from "../types";
  import { cheapFindings, correlationFindings, FIRST_DAYS, insights as rankAll, waiting, type Context } from "./index";
  import { progress } from "./experiments";
  import { insights } from "./store.svelte";
  import { goals as goalStore } from "../goals.svelte";
  import { emptyFoot, firstFindings, nothingYet, onDay, running as sayRunning, runningWhen } from "./text";
  import type { Actions, Experiment, Finding } from "./types";
  import Bars from "./Bars.svelte";
  import Pill from "./Pill.svelte";
  import Visual from "./Visual.svelte";
  import ProofSheet from "./ProofSheet.svelte";

  let { history, timeZone, settings = null, pending = [], blocklists, actions, sources = {}, logFirstDay, dailyGoal, goalScope = "all" }: {
    history: DayTotal[];
    timeZone: string;
    /** The sources by id, for naming goals and telling work from health. */
    sources?: Record<string, Source>;
    /** GET /status's log_first_day. */
    logFirstDay?: string;
    /** The Daily goal setting, for a Ledger that doesn't keep goals. */
    dailyGoal?: number;
    /** Which goal findings show: every one, or only those about work. */
    goalScope?: "all" | "productive";
    /** The rules now, for suggestions; null where none can be made. */
    settings?: Settings | null;
    pending?: Pending[];
    blocklists: Record<string, Blocklist>;
    actions?: Actions;
  } = $props();
  const fit = fitsSlot();
  // Asked again with each new history (the dashboard's poll), so the tablet
  // and the phone agree on what's dismissed and what's being tried.
  $effect(() => { void history; insights.load(true); goalStore.load(true, dailyGoal); });
  $effect(() => { notes.load(); });

  const TOP = 3;
  const dayStart = $derived(Math.round(curfew.end * 60));
  const days = $derived(history.slice(0, -1));
  const today = $derived(history.at(-1)?.day ?? "");
  const experiments = $derived(insights.state.experiments);
  const ctx = $derived<Context>({
    days, today, current: history.at(-1) ?? null, timeZone, dayStart, curfewStart: Math.round(curfew.start * 60),
    blocklists, markers: notes.markers, settings, pending, experiments,
    goals: goalStore.list, sources, logFirstDay,
  });

  // Everything but the correlations, on the main thread: worked out again
  // only when what it reads has changed (a new history usually changes only
  // today, and only today's totals matter to records).
  let lastKey = "", lastCheap: Finding[] = [];
  const cheap = $derived.by(() => {
    const c = ctx;
    const key = JSON.stringify([c.days.map(readOf), c.days.map((d) => [d.planned?.length, d.verdict, d.goal_met, d.tears]), c.current?.earned, c.current?.stretches, c.current?.by_source,
      c.markers.length, c.experiments, c.dayStart, c.curfewStart, Object.keys(c.blocklists), c.settings && [c.settings.curfew_start, c.settings.unlock_minutes, c.settings.daily_goal], c.pending.length,
      c.goals, c.current?.sleep, c.current?.goal_met, c.current?.tears, c.current?.used, c.logFirstDay]);
    if (key === lastKey) return lastCheap;
    lastKey = key;
    return (lastCheap = cheapFindings(c));
  });

  // The correlations, in the worker, as What goes with a good Day does.
  let lastRead: string[] = [], lastDays: DayTotal[] = [];
  const compared = $derived.by(() => {
    const next = comparedDays(history), read = next.map(readOf);
    if (read.length === lastRead.length && read.every((r, i) => r === lastRead[i])) return lastDays;
    lastRead = read; lastDays = next;
    return next;
  });
  const setup = $derived(goodDaySetup(compared, timeZone, dayStart));
  let found = $state.raw<Tested[] | null>(null);
  $effect(() => {
    const r = setup.request;
    let wanted = true;
    correlateOff(r).then((t) => { if (wanted) found = t; });
    return () => { wanted = false; };
  });
  const correlations = $derived(found ? correlationFindings(found, setup) : []);

  const list = $derived(rankAll(ctx, cheap, correlations, insights.state.dismissed, { suggestions: !!actions, goals: goalScope }));
  const top = $derived(list.slice(0, TOP));
  const rest = $derived(list.slice(TOP));
  /** Experiments running, shown as rows in progress (Voucher only). */
  const runningNow = $derived(actions ? experiments.filter((e) => e.status === "running") : []);
  const early = $derived(days.length < FIRST_DAYS);
  const wait = $derived(early ? waiting(ctx, setup) : null);

  // The picture's size: wider on a wider card.
  let rowsW = $state(0);
  const vw = $derived(rowsW >= 620 ? 132 : rowsW >= 440 ? 96 : 76);

  let open = $state<Finding | null>(null);
  const openExperiment = $derived(open?.experiment !== undefined ? experiments.find((e) => e.id === open!.experiment) : undefined);
  let scroller = $state<HTMLDivElement>();
  // Opened from a notification ("Open" on an Experiment's verdict):
  // `?insight=<finding id>` opens that finding's proof once it's in the list.
  let asked = typeof location === "undefined" ? null : new URLSearchParams(location.search).get("insight");
  $effect(() => {
    const f = asked ? list.find((x) => x.id === asked) : undefined;
    if (f) { open = f; asked = null; }
  });

  async function dismiss(f: Finding, e: Event) {
    e.stopPropagation();
    const before = insights.state;
    // At once, then from the Ledger.
    insights.state = { ...before, dismissed: { ...before.dismissed, [f.id]: { at: new Date().toISOString(), kind: f.kind, value: f.value } } };
    try { await insights.dismiss(f); } catch (err) { insights.state = before; actionFailed(err, "The Ledger didn't take that dismissal. Try again."); }
  }
  function tryIt(f: Finding, e: Event) {
    e.stopPropagation();
    actions?.tryIt(f);
  }
  const keyOn = (fn: () => void) => (e: KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } };
</script>

{#snippet row(f: Finding, first: boolean, more: number)}
  <div class="row" class:first class:more={more > 0} data-more="{more} more" role="button" tabindex="0" aria-label="Open the proof"
    onclick={() => (open = f)} onkeydown={keyOn(() => (open = f))} out:reveal>
    <div class="text">
      <p class="sent"><AboutText parts={f.sentence} /></p>
      {#if f.confidence || (actions && (f.suggestion || f.experiment !== undefined))}
        <div class="meta">
          {#if f.confidence}<Bars level={f.confidence} />{/if}
          {#if actions && f.experiment !== undefined}
            <button class="btn small try" onclick={(e) => { e.stopPropagation(); open = f; }}>Keep it or go back</button>
          {:else if actions && f.suggestion}
            <button class="btn small try" onclick={(e) => tryIt(f, e)}><Marker kind="rule" color="var(--marker)" size={11} />{f.suggestion.button}</button>
          {/if}
        </div>
      {/if}
    </div>
    <div class="side">
      {#if f.pill}<Pill text={f.pill.text} tone={f.pill.tone} />{/if}
      <Visual v={f.visual} w={vw} h={24} />
    </div>
    {#if actions && f.experiment === undefined}
      <button class="iconbtn small bare x" aria-label="Dismiss" onclick={(e) => dismiss(f, e)}>
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>
    {:else}<span></span>{/if}
  </div>
{/snippet}

{#snippet trying(e: Experiment)}
  {@const p = progress(e, today)}
  <div class="row running" role="button" tabindex="0" aria-label="This Experiment" onclick={() => actions?.experiment(e)} onkeydown={keyOn(() => actions?.experiment(e))} out:reveal>
    <div class="text">
      <p class="sent">{sayRunning(e, p.waiting ? 0 : p.day)[0].text}</p>
      <div class="meta"><Marker kind="rule" color="var(--marker)" size={11} /><span class="when">{runningWhen(e, today, p.waiting)}</span></div>
    </div>
    <div class="side"><Visual v={{ kind: "days", day: p.waiting ? 0 : Math.max(0, p.day), of: e.measure_days }} w={vw} h={24} /></div>
    <button class="iconbtn small bare x" aria-label="End this Experiment" onclick={(ev) => { ev.stopPropagation(); actions?.experiment(e); }}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
    </button>
  </div>
{/snippet}

<TrendCard title="Insights">
  {#if early && wait}
    <div class="early" class:fit>
      <div class="firstday"><b>{wait.left}</b><span>{firstFindings(wait.left)} {onDay(wait.on)}</span></div>
      <div class="meters">
        {#each wait.meters as m (m.name)}
          <div class="meter"><span class="who"><i style="background: {m.color}"></i>{m.name}</span><span class="bar"><i style="width: {(m.n / m.of) * 100}%"></i></span><span class="count">{m.label}</span></div>
        {/each}
      </div>
      <p class="foot">{emptyFoot}</p>
    </div>
  {:else if !list.length && !runningNow.length}
    <p class="empty">{found ? nothingYet : "Comparing your Days…"}</p>
  {:else}
    <div class="frame" class:fit>
      <ScrollCue target={scroller} />
      <div class="rows" bind:this={scroller} bind:clientWidth={rowsW}>
        {#each top as f, i (f.id)}{@render row(f, i === 0, 0)}{/each}
        {#each runningNow as e (e.id)}{@render trying(e)}{/each}
        {#each rest as f, i (f.id)}{@render row(f, false, i === 0 ? rest.length : 0)}{/each}
      </div>
    </div>
  {/if}
</TrendCard>
{#if open}
  <ProofSheet f={open} experiment={openExperiment} onclose={() => (open = null)}
    ontry={actions ? (f) => { open = null; actions.tryIt(f); } : undefined}
    ondecide={actions ? async (e, keep) => { open = null; await actions.decide(e, keep); } : undefined} />
{/if}

<style>
  .frame { position: relative; display: flex; flex-direction: column; min-height: 0; }
  .frame.fit { flex: 1; }
  .rows { position: relative; display: flex; flex-direction: column; }
  .fit .rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; margin: 0 -8px; padding: 0 8px; }
  .fit .rows::-webkit-scrollbar { display: none; }

  /* One row a finding, as the Log's: the sentence and its bars on the left,
     the pill over the picture on the right, then the ×. */
  .row { position: relative; display: grid; grid-template-columns: minmax(0, 1fr) auto 24px; gap: 4px 10px; align-items: start; padding: 9px 8px; margin: 0 -8px; border-bottom: 1px solid var(--divider); border-radius: 10px; cursor: pointer; transition: background-color var(--t-quick), var(--press); }
  .row:active { filter: var(--press-glow); }
  .row:focus-visible { outline: 2px solid var(--voucher); outline-offset: -2px; }
  /* The top finding: the same row on a raised ground. */
  .row.first { background: var(--raised); border-bottom-color: transparent; }
  .row:has(+ .row.first), .row.first + .row { border-top-color: transparent; }
  /* "N more" over the first of the rest. */
  .row.more { margin-top: 22px; border-top: 0; }
  .row.more::after { content: ""; position: absolute; left: 8px; right: 8px; top: -13px; height: 1px; background: var(--divider); }
  .row.more::before { content: attr(data-more); position: absolute; z-index: 1; left: 8px; top: -18px; padding-right: 8px; background: var(--surface); font: 600 10px/10px var(--mono); letter-spacing: .12em; text-transform: uppercase; color: var(--faint); }
  .row:last-child { border-bottom-color: transparent; }
  .sent { margin: 0; font-size: 13.5px; line-height: 1.38; color: var(--ink); }
  .meta { display: flex; align-items: center; gap: 8px; margin-top: 5px; min-height: 11px; }
  .side { display: flex; flex-direction: column; align-items: flex-end; gap: 5px; padding-top: 1px; }
  .x { width: 24px; height: 24px; margin-top: -3px; border-radius: 8px; color: var(--faint); }
  .try { height: 26px; padding: 0 9px; border-radius: 9px; font-size: 12px; gap: 5px; border-style: dashed; border-color: var(--line-strong); background: none; color: var(--ink-soft); }
  .row.first .try { background: var(--surface); }

  /* An Experiment running: in progress, dashed in the Marker color. */
  .row.running { border: 1px dashed color-mix(in oklab, var(--marker) 45%, var(--surface)); margin-top: 4px; margin-bottom: 4px; }
  .running .sent { color: var(--ink-soft); }
  .running .when { font: 600 11px var(--mono); color: var(--muted); white-space: nowrap; }

  /* Under two weeks of history. */
  .early { display: flex; flex-direction: column; gap: 14px; }
  .early.fit { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .firstday { display: flex; align-items: baseline; gap: 10px; }
  .firstday b { font: 700 30px/1 var(--mono); color: var(--ink); }
  .firstday span { font-size: 14px; color: var(--ink-soft); line-height: 1.35; }
  .meters { display: flex; flex-direction: column; gap: 9px; }
  .meter { display: grid; grid-template-columns: minmax(0, 150px) minmax(40px, 1fr) auto; gap: 10px; align-items: center; font-size: 12.5px; }
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--ink-soft); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .who i { flex: none; width: 7px; height: 7px; border-radius: 50%; }
  .meter .bar i { background: var(--muted); }
  .count { font: 500 11px var(--mono); color: var(--muted); white-space: nowrap; }
  @container card (max-width: 420px) { .meter { grid-template-columns: minmax(0, 110px) minmax(30px, 1fr) auto; } }
</style>
