<script lang="ts">
  // Which habits am I keeping up? A row per switched-on source, a cell filled
  // in its colour on each Day it earned at least one Voucher, and how many
  // Days in a row it's earned up to now. The Days scroll sideways, back as
  // far as the log keeps them, with the month and each Monday's date along
  // the top; it opens at today. It follows the shared Day (that Day's column
  // is outlined and scrolled into view), and tapping a cell shares its Day.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import { compareSources, styleOf } from "../../sources";
  import { MONTHS } from "../../trends";
  import { selection } from "../../selection.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import DayStepper from "../../components/DayStepper.svelte";
  import type { DayTotal, SourceProgress } from "../../types";
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
  const longest = $derived([...rows].sort((a, b) => b.run - a.run)[0]);

  /** The label over a Day's column: the month where one starts, each Monday's date, else nothing. */
  const label = (day: string) => {
    if (day.endsWith("-01")) return MONTHS[Number(day.slice(5, 7)) - 1];
    return new Date(`${day}T12:00:00Z`).getUTCDay() === 1 ? String(Number(day.slice(8))) : "";
  };

  const CELL = 13, GAP = 3;
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

<TrendCard title="Source streaks">
  {#snippet tools()}
    <DayStepper day={selection.day ?? today} today={today} oldest={days[0]?.day} unit="day" onpick={(d) => selection.set("sourcestreaks-step", { day: d === today ? null : d, picked: false })} />
  {/snippet}
  <div class="grid" class:fit style="--cell: {CELL}px; --gap: {GAP}px">
    <div class="side">
      <span class="dates"></span>
      {#each rows as r (r.id)}<span class="name">{r.name}</span>{/each}
    </div>
    <div class="scroll" bind:this={scroller}>
      <div class="track" style="grid-template-columns: repeat({days.length}, var(--cell))">
        {#each days as d (d.day)}<span class="date" class:month={d.day.endsWith("-01")} class:on={d.day === chosen}>{#if label(d.day)}<b>{label(d.day)}</b>{/if}</span>{/each}
        {#each rows as r (r.id)}
          {#each r.hit as on, i (days[i].day)}
            <button class="cell" class:on={days[i].day === chosen} style={on ? `background: ${r.color}` : ""} title="{days[i].day}: {r.name} {on ? 'earned' : 'did not earn'}" aria-label="{days[i].day}, {r.name}" onclick={() => pick(days[i].day)}></button>
          {/each}
        {/each}
      </div>
    </div>
    <div class="side runs">
      <span class="dates"></span>
      {#each rows as r (r.id)}<span class="run" class:none={!r.run}>{r.run ? `${r.run} d` : "–"}</span>{/each}
    </div>
  </div>
  {#snippet foot()}
    {#if longest && longest.run}<b>{longest.name}</b> has earned every Day for <b>{longest.run}</b> Days. Filled squares are Days a source earned at least one Voucher.{:else}Filled squares are Days a source earned at least one Voucher.{/if}
  {/snippet}
</TrendCard>

<style>
  .grid { display: flex; gap: 8px; align-items: flex-start; }
  /* In a tablet slot the rows take the spare height and scroll up and down. */
  .grid.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .side { flex: none; display: grid; grid-auto-rows: var(--cell); row-gap: var(--gap); }
  .side .dates, .date { height: 14px; }
  .side:not(.runs) { width: 96px; }
  .runs { width: 34px; }
  .name { font-size: 12.5px; line-height: var(--cell); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .run { font: 700 11px/var(--cell) var(--mono); color: var(--ink); text-align: right; }
  .run.none { color: var(--muted); }
  /* The Days scroll sideways, inside the card. */
  .scroll { flex: 1; min-width: 0; overflow-x: auto; overscroll-behavior-x: contain; scrollbar-width: none; }
  .scroll::-webkit-scrollbar { display: none; }
  .track { display: grid; grid-auto-rows: var(--cell); grid-template-rows: 14px; gap: var(--gap); }
  .date { position: relative; }
  .date b { position: absolute; left: 0; bottom: 1px; font: 500 9px var(--mono); color: #6f757b; white-space: nowrap; }
  .date.month b { color: var(--muted); font-weight: 700; }
  .date.on b { color: var(--ink); }
  .cell { display: block; width: var(--cell); height: var(--cell); padding: 0; border: 0; border-radius: 3px; background: #22262a; cursor: pointer; }
  .cell.on { outline: 1.5px solid var(--ink); outline-offset: 0; }
</style>
