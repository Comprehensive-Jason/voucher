<script lang="ts">
  // Does the goal measure what I care about? The Curfew question's answers
  // ("Did today go the way you wanted?") against whether the goal was met,
  // over the last eight weeks. Goal Days that felt bad, or missed Days that
  // felt good, are the interesting ones: they say the goal or the sources
  // may be weighing the wrong things. A strip of the last four weeks shows
  // each answer, outlined in gold where the goal was met.
  import TrendCard from "../../components/TrendCard.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal, Verdict } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const recent = $derived(history.slice(-56));
  const answered = $derived(recent.filter((d) => d.verdict));
  const count = (met: boolean, v: Verdict) => answered.filter((d) => d.goal_met === met && d.verdict === v).length;
  const goodShare = (met: boolean) => {
    const all = answered.filter((d) => d.goal_met === met);
    return { n: all.length, good: all.filter((d) => d.verdict !== "no").length };
  };
  const met = $derived(goodShare(true));
  const missed = $derived(goodShare(false));
  const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : 0);
  /** What the mismatch suggests, once there are enough answers to say. */
  const hint = $derived.by(() => {
    if (answered.length < 10) return null;
    if (met.n >= 4 && pct(met.n - met.good, met.n) >= 30) return "Goal Days that went badly are common: the goal may count work that doesn't matter much to you.";
    if (missed.n >= 4 && pct(missed.good, missed.n) >= 50) return "Many missed Days still went well: the goal may ask too much, or miss what you actually do.";
    return "Goal Days and good Days mostly agree: the goal seems to measure what you care about.";
  });
  const strip = $derived(history.slice(-28));
  const LABEL: Record<Verdict, string> = { yes: "Yes", mostly: "Mostly", no: "No" };
</script>

<TrendCard title="Goal Days vs good Days">
  {#if answered.length < 3}
    <p class="empty">Your answers to the Curfew question ("Did today go the way you wanted?") show here after a few nights.</p>
  {:else}
    <p class="lead">
      Of <b>{met.n}</b> goal Days you answered, <b class="ok">{met.good}</b> went the way you wanted{#if missed.n}; of <b>{missed.n}</b> missed Days, <b class="ok">{missed.good}</b> did anyway{/if}.
    </p>
    <div class="table" class:fit role="table" aria-label="Answers by goal met or missed">
      <span></span>{#each ["yes", "mostly", "no"] as v}<span class="cap h">{LABEL[v as Verdict]}</span>{/each}
      <span class="cap row gold">Goal met</span>{#each ["yes", "mostly", "no"] as v}<b class="n {v}">{count(true, v as Verdict)}</b>{/each}
      <span class="cap row">Missed</span>{#each ["yes", "mostly", "no"] as v}<b class="n {v}">{count(false, v as Verdict)}</b>{/each}
    </div>
    <div class="strip" aria-label="The last four weeks' answers">
      {#each strip as d (d.day)}<i class={d.verdict ?? "none"} class:met={d.goal_met} title="{d.day}: {d.verdict ? LABEL[d.verdict] : 'no answer'}{d.goal_met ? ', goal met' : ''}"></i>{/each}
    </div>
    {#if hint}<p class="hint">{hint}</p>{/if}
  {/if}
</TrendCard>

<style>
  .lead { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--muted); }
  .lead b { color: var(--ink); font-family: var(--mono); }
  .lead b.ok { color: var(--voucher); }
  .table { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)); gap: 6px 8px; align-items: center; }
  .table.fit { flex: 1; min-height: 0; align-content: center; }
  .h { text-align: center; color: var(--muted); }
  .row { color: var(--muted); }
  .row.gold { color: var(--goal); }
  .n { text-align: center; padding: 6px 0; border-radius: 8px; background: #1f2226; font: 700 16px var(--mono); }
  .n.yes { color: var(--voucher); } .n.mostly { color: #d9c65b; } .n.no { color: var(--spend); }
  .strip { display: grid; grid-template-columns: repeat(28, minmax(0, 1fr)); gap: 3px; }
  .strip i { aspect-ratio: 1; border-radius: 3px; background: #22262a; box-sizing: border-box; }
  .strip i.yes { background: #2fb36b; } .strip i.mostly { background: #8f8640; } .strip i.no { background: #a54a40; }
  .strip i.met { outline: 1.5px solid var(--goal); outline-offset: -1.5px; }
  .hint { margin: 0; font-size: 12.5px; line-height: 1.4; color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
