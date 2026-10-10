<script lang="ts">
  // Which habits am I keeping up? A row per switched-on source, a cell filled
  // in its colour on each Day it earned at least one Voucher, and how many
  // Days in a row it's earned up to now; the longest run (every source tied
  // for it) has its name and run in ink, the rest muted. The Days scroll
  // sideways, back as far as the log keeps them, with the month's name where
  // one starts and each Monday's date ("09-14") along the top; it opens at
  // today. It follows the shared Day (that Day's column
  // is outlined and scrolled into view), and tapping a cell shares its Day.
  // A Day with a Marker carries Activity's corner tick on each of its cells
  // (the Marker colour), the texts in their
  // tooltips, with a key under the grid while any is drawn.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import Legend from "../../components/Legend.svelte";
  import { dayOfMoment, markerKeys, notes } from "../../notes.svelte";
  import { compareSources, styleOf } from "../../sources";
  import { MONTHS } from "../../trends";
  import { shortDate } from "../../time";
  import { selection } from "../../selection.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import { heat } from "../../heat.svelte";
  import type { DayTotal, Marker, SourceProgress } from "../../types";
  const fit = fitsSlot();

  let { history, sources }: { history: DayTotal[]; sources: SourceProgress[] } = $props();
  /** Days the log still holds earnings by source for, oldest first (at least four weeks). */
  const days = $derived.by(() => {
    const first = history.findIndex((d) => Object.keys(d.by_source ?? {}).length);
    return history.slice(first < 0 ? -28 : Math.min(first, history.length - 28));
  });
  const today = $derived(history.at(-1)?.day ?? "");
  const chosen = $derived(selection.day ?? today);
  // The switched-on sources, or, without that list, whichever sources earned in these Days.
  const ids = $derived(sources.length ? sources.filter((s) => s.on).map((s) => s.id) : [...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))]);
  const rows = $derived(ids
    .map((id) => ({ ...styleOf(id), id }))
    .sort((a, b) => compareSources(a, b))
    .map((s) => {
      const hit = days.map((d) => (d.by_source?.[s.id] ?? 0) > 0);
      // Days in a row up to now; today doesn't break it while it's still open.
      let run = 0;
      for (let i = hit.length - 1; i >= 0; i--) { if (hit[i]) run++; else if (i < hit.length - 1) break; }
      return { ...s, hit, run };
    }));
  // Markers on the Days drawn, by Day, oldest first.
  $effect(() => { notes.load(); });
  const marksOn = $derived.by(() => {
    const have = new Set(days.map((d) => d.day));
    const out = new Map<string, Marker[]>();
    for (const m of notes.markers) { const d = dayOfMoment(m.at); if (have.has(d)) out.set(d, [...(out.get(d) ?? []), m]); }
    return out;
  });
  const marks = $derived([...marksOn.values()].flat());
  /** A Day's Markers as tooltip lines, after the cell's own line. */
  const markLines = (day: string) => (marksOn.get(day) ?? []).map((m) => `\n${m.text}`).join("");
  /** The longest current run, in Days; 0 when no source is on a run. */
  const longest = $derived(Math.max(0, ...rows.map((r) => r.run)));

  /** The label over a Day's column: the month's name where one starts, each
   *  Monday's date, else nothing. A date runs about two columns wide, so a
   *  Monday just before or after a month's start leaves the month its room. */
  const label = (day: string) => {
    const date = Number(day.slice(8));
    if (date === 1) return MONTHS[Number(day.slice(5, 7)) - 1];
    if (new Date(`${day}T12:00:00Z`).getUTCDay() !== 1) return "";
    const last = new Date(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0)).getUTCDate();
    return date === 2 || date >= last - 1 ? "" : shortDate(day, today);
  };

  // Squares as big as Activity's, so both grids read the same.
  const CELL = $derived(heat.cell), GAP = $derived(heat.gap);
  let scroller = $state<HTMLDivElement>();
  /** Scrolls a Day's column to the middle (or the end, for today). */
  function reveal(day: string, smooth: boolean) {
    if (!scroller) return;
    const i = days.findIndex((d) => d.day === day);
    const left = i < 0 || day === today ? scroller.scrollWidth : i * (CELL + GAP) - scroller.clientWidth / 2;
    scroller.scrollTo({ left: Math.max(0, left), behavior: smooth ? "smooth" : "instant" });
  }
  $effect(() => { days.length; if (scroller) untrack(() => reveal(chosen, false)); });
  $effect(() => {
    selection.seq;
    const day = chosen;
    untrack(() => { if (selection.from !== "sourcestreaks") reveal(day, true); });
  });
  const pick = (day: string) => selection.set("sourcestreaks", { day: day === today ? null : day, picked: true });
</script>

<TrendCard title="Source streaks" date={{ day: selection.day ?? today, today, oldest: days[0]?.day, onpick: (d) => selection.set("sourcestreaks-step", { day: d === today ? null : d, picked: false }) }}>
  <div class="grid" class:fit style="--cell: {CELL}px; --gap: {GAP}px">
    <div class="side">
      <span class="dates"></span>
      {#each rows as r (r.id)}<span class="name" class:best={longest > 0 && r.run === longest}>{r.name}</span>{/each}
    </div>
    <div class="scroll" bind:this={scroller}>
      <div class="track" style="grid-template-columns: repeat({days.length}, var(--cell))">
        {#each days as d (d.day)}<span class="date" class:month={d.day.endsWith("-01")} class:on={d.day === chosen}>{#if label(d.day)}<b>{label(d.day)}</b>{/if}</span>{/each}
        {#each rows as r (r.id)}
          {#each r.hit as on, i (days[i].day)}
            <button class="cell" class:on={days[i].day === chosen} class:marked={marksOn.has(days[i].day)} style={on ? `background: ${r.color}` : ""} title="{shortDate(days[i].day, today)}: {r.name} {on ? 'earned' : 'did not earn'}{markLines(days[i].day)}" aria-label="{days[i].day}, {r.name}" onclick={() => pick(days[i].day)}></button>
          {/each}
        {/each}
      </div>
    </div>
    <div class="side runs">
      <span class="dates"></span>
      {#each rows as r (r.id)}<span class="run" class:best={longest > 0 && r.run === longest}>{r.run ? `${r.run} ${r.run === 1 ? "Day" : "Days"}` : "–"}</span>{/each}
    </div>
  </div>
  {#if marks.length}<Legend items={markerKeys(marks, "corner")} />{/if}
</TrendCard>

<style>
  .grid { display: flex; gap: 8px; align-items: flex-start; }
  /* In a tablet slot the rows take the spare height and scroll up and down. */
  .grid.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .side { flex: none; display: grid; grid-auto-rows: var(--cell); row-gap: var(--gap); }
  .side .dates, .date { height: 14px; }
  .side:not(.runs) { width: 96px; }
  /* As wide as its longest run ("12 Days"), so the words fit. */
  .runs { min-width: 34px; }
  .name { font-size: 13px; line-height: var(--cell); color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run { font: 500 12px/var(--cell) var(--mono); color: var(--muted); text-align: right; white-space: nowrap; }
  /* The longest run going: name and run in ink. */
  .name.best { color: var(--ink); font-weight: 600; }
  .run.best { color: var(--ink); font-weight: 700; }
  /* The Days scroll sideways, inside the card, with room inside the edges
     for the shared Day's outline, which the scroller would otherwise clip.
     The names and runs beside it move down by the same room. */
  .scroll { flex: 1; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; padding: 4px; }
  .side { padding-top: 4px; }
  .scroll::-webkit-scrollbar { display: none; }
  /* As wide as its Days, so the scroller's padding comes after the last one. */
  .track { display: grid; grid-auto-rows: var(--cell); grid-template-rows: 14px; gap: var(--gap); width: max-content; }
  .date { position: relative; }
  .date b { position: absolute; left: 0; bottom: 1px; font: 500 var(--axis-size) var(--mono); color: var(--axis-ink); white-space: nowrap; }
  .date.month b { color: var(--muted); font-weight: 700; }
  .date.on b { color: var(--ink); }
  .cell { position: relative; display: block; width: var(--cell); height: var(--cell); padding: 0; border: 0; border-radius: 4px; background: var(--heat-0); cursor: pointer; }
  /* A Day with a Marker: Activity's corner, in the Marker colour. */
  .cell.marked::after { content: ""; position: absolute; top: 0; right: 0; width: 0; height: 0; border-top: 6px solid var(--marker); border-left: 6px solid transparent; border-top-right-radius: 3px; }
  /* The shared Day, outlined as Activity outlines it. */
  .cell.on { outline: 2px solid var(--ink); outline-offset: 1px; }
</style>
