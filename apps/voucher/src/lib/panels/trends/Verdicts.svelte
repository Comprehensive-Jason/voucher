<script lang="ts">
  // Does the goal measure what I care about? The Curfew question's answers
  // ("Did today go the way you wanted?") against whether the goal was met,
  // over the last eight weeks: a row for goal Days and one for missed Days,
  // a column per answer, under the question itself so the table says what it
  // counts. Goal Days that felt bad, or missed Days that felt good, are the
  // interesting ones: they say the goal or the sources may be weighing the
  // wrong things. A strip of the last four weeks shows each Day's answer,
  // framed in gold where the goal was met, with its dates under it and a key;
  // "No" answers take the --worse colour, in the table and the strip. With
  // enough answers, one line under it says what the mismatch suggests. A Day
  // in the strip with a Marker carries Activity's corner tick (the Marker
  // colour), the texts in its tooltip.
  import TrendCard from "../../components/TrendCard.svelte";
  import Legend from "../../components/Legend.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal, Marker, Verdict } from "../../types";
  import { dayOfMoment, markerKeys, notes } from "../../notes.svelte";
  import { shortDate } from "../../time";

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
    if (met.n >= 4 && pct(met.n - met.good, met.n) >= 30) return "Many goal Days went badly: the goal may count the wrong work.";
    if (missed.n >= 4 && pct(missed.good, missed.n) >= 50) return "Many missed Days went well: the goal may ask too much.";
    return "Goal Days mostly went well, and missed Days mostly didn't.";
  });
  const strip = $derived(history.slice(-28));
  const today = $derived(history.at(-1)?.day ?? "");
  // Markers on the strip's Days, by Day, oldest first.
  $effect(() => { notes.load(); });
  const marksOn = $derived.by(() => {
    const have = new Set(strip.map((d) => d.day));
    const out = new Map<string, Marker[]>();
    for (const m of notes.markers) { const d = dayOfMoment(m.at); if (have.has(d)) out.set(d, [...(out.get(d) ?? []), m]); }
    return out;
  });
  const marks = $derived([...marksOn.values()].flat());
  /** A Day's Markers as tooltip lines, after its answer. */
  const markLines = (day: string) => (marksOn.get(day) ?? []).map((m) => `\n${m.text}`).join("");
  const LABEL: Record<Verdict, string> = { yes: "Yes", mostly: "Mostly", no: "No" };
</script>

{#snippet summary()}{hint}{/snippet}

<TrendCard title="Goal vs how the Day went" foot={answered.length >= 3 && hint ? summary : undefined}>
  {#if answered.length < 3}
    <p class="empty">Your answers to the Curfew question ("Did today go the way you wanted?") show here after a few nights.</p>
  {:else}
    <div class="table" class:fit role="table" aria-label="Curfew answers on goal Days and missed Days, last 8 weeks">
      <span class="cap corner">Last 8 weeks</span><span class="q">"Did today go the way you wanted?"</span>
      <span></span>{#each ["yes", "mostly", "no"] as v}<span class="cap h">{LABEL[v as Verdict]}</span>{/each}
      <span class="cap row gold">Goal met</span>{#each ["yes", "mostly", "no"] as v}<b class="n {v}">{count(true, v as Verdict)}</b>{/each}
      <span class="cap row">Goal missed</span>{#each ["yes", "mostly", "no"] as v}<b class="n {v}">{count(false, v as Verdict)}</b>{/each}
    </div>
    <div class="days">
      <div class="strip" aria-label="Each Day's answer, last four weeks">
        {#each strip as d (d.day)}<i class={d.verdict ?? "none"} class:met={d.goal_met} class:marked={marksOn.has(d.day)} title="{shortDate(d.day, today)}: {d.verdict ? LABEL[d.verdict] : 'no answer'}{d.goal_met ? ', goal met' : ''}{markLines(d.day)}"></i>{/each}
      </div>
      <div class="ends"><span>{strip[0] ? shortDate(strip[0].day, today) : ""}</span><span>Today</span></div>
    </div>
    <Legend items={[
      { kind: "box", color: "var(--heat-3)", label: "Yes" },
      { kind: "box", color: "var(--mostly)", label: "Mostly" },
      { kind: "box", color: "var(--worse)", label: "No" },
      { kind: "box", color: "var(--heat-0)", label: "No answer" },
      { kind: "frame", color: "var(--goal)", label: "Goal met" },
      ...markerKeys(marks, "corner"),
    ]} />
  {/if}
</TrendCard>

<style>
  .table { display: grid; grid-template-columns: auto repeat(3, minmax(0, 1fr)); gap: 6px 8px; align-items: center; }
  .table.fit { flex: 1; min-height: 0; align-content: center; }
  .h { text-align: center; color: var(--muted); }
  /* The question over the answer columns, so the counts say what they count. */
  .q { grid-column: 2 / -1; text-align: center; font-size: 12px; color: var(--muted); }
  .table .corner { color: var(--muted); align-self: end; }
  .days { display: flex; flex-direction: column; gap: 4px; }
  .ends { display: flex; justify-content: space-between; font: 500 var(--axis-size) var(--mono); color: var(--axis-ink); }
  .row { color: var(--muted); }
  .row.gold { color: var(--goal); }
  /* Each count in a box with the shared stat boxes' look (theme.css .stats). */
  .n { text-align: center; padding: 8px 10px; border-radius: 10px; background: var(--raised); font: 700 18px/1.1 var(--mono); min-width: 0; }
  .n.yes { color: var(--voucher); } .n.mostly { color: var(--mostly-ink); } .n.no { color: var(--worse); }
  .strip { display: grid; grid-template-columns: repeat(28, minmax(0, 1fr)); gap: 3px; }
  .strip i { position: relative; aspect-ratio: 1; border-radius: 3px; background: var(--heat-0); box-sizing: border-box; }
  /* A Day with a Marker: Activity's corner, in the Marker colour. */
  .strip i.marked::after { content: ""; position: absolute; top: 0; right: 0; width: 0; height: 0; border-top: 6px solid var(--marker); border-left: 6px solid transparent; border-top-right-radius: 3px; }
  /* A dark edge along the tick's slant, so grey still reads on the light greens (as in Source streaks). */
  .strip i.marked::after { filter: drop-shadow(-1px 1px 0 var(--surface)); }
  .strip i.yes { background: var(--heat-3); } .strip i.mostly { background: var(--mostly); } .strip i.no { background: var(--worse); }
  .strip i.met { outline: 1.5px solid var(--goal); outline-offset: -1.5px; }
</style>
