<script lang="ts">
  // What are my productive hours? A row per Day (or the average Day of each
  // week or month), a cell per hour from 06:00, brighter for more Vouchers.
  // Newest at the bottom; scroll up for earlier ones, as far as the log
  // keeps them. The busiest hour's column is outlined, with its time and
  // "busiest" over it. The hours sit under the rows, outside the scroller,
  // so they never move.
  import TrendCard from "../../components/TrendCard.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import HourAxis from "../../components/HourAxis.svelte";
  import Legend from "../../components/Legend.svelte";
  import { monthOf, mondayOf } from "../../trends";
  import { zoomFade } from "../../motion";
  import { inCurfew } from "../../curfew.svelte";
  import { selection } from "../../selection.svelte";
  import { untrack } from "svelte";
  import type { DayTotal } from "../../types";
  import { fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();

  let { history }: { history: DayTotal[] } = $props();
  type By = "day" | "week" | "month";
  let by = $state<By>("day");
  /** Whether the last switch went to a longer span (Day to Week to Month), for the zoom's direction. */
  let widened = $state(true);
  const LEVELS: By[] = ["day", "week", "month"];
  function setBy(next: By) { widened = LEVELS.indexOf(next) > LEVELS.indexOf(by); by = next; }
  /** A switch made here, which the other cards follow. */
  function pickBy(next: By) { setBy(next); selection.set("when", { span: next, picked: false }); }
  // Day, Week, or Month as the other cards are, and the row holding their Day outlined and in view.
  $effect(() => {
    selection.seq;
    untrack(() => { if (selection.from !== "when" && selection.span !== by) setBy(selection.span); });
  });
  const lastDay = $derived(history.at(-1)?.day ?? "");
  const chosenKey = $derived.by(() => {
    const d = selection.day ?? lastDay;
    return by === "day" ? d : by === "week" ? mondayOf(d) : d.slice(0, 7);
  });
  $effect(() => {
    const key = chosenKey;
    rows.length;
    by;
    // Only the rows scroll (scrollIntoView would move the tablet's strip of cards too).
    untrack(() => {
      const el = scroller?.querySelector<HTMLElement>(`[data-key="${key}"]`);
      if (scroller && el) scroller.scrollTo({ top: el.offsetTop - scroller.clientHeight + el.offsetHeight * 2, behavior: "smooth" });
    });
  });

  // The whole Day, 06:00 to 06:00, with Curfew's hours in the night colour.
  const FIRST = 6, COLS = 24;
  const hourOf = (c: number) => (FIRST + c) % 24;
  const cols = (hours: number[]) => {
    const out = Array<number>(COLS).fill(0);
    hours.forEach((n, h) => (out[(h - FIRST + 24) % 24] += n));
    return out;
  };
  // Only Days whose hours the log still holds.
  const kept = $derived(history.filter((d) => d.hours && d.hours.length));
  const rows = $derived.by(() => {
    if (by === "day") return kept.map((d) => ({ key: d.day, label: d.day.slice(5), cells: cols(d.hours!) }));
    const groups = new Map<string, number[][]>();
    for (const d of kept) {
      const key = by === "week" ? mondayOf(d.day) : d.day.slice(0, 7);
      groups.set(key, [...(groups.get(key) ?? []), cols(d.hours!)]);
    }
    return [...groups.entries()].map(([key, list]) => ({
      key, label: by === "week" ? key.slice(5) : `${monthOf(key + "-01")} ${key.slice(2, 4)}`,
      cells: Array.from({ length: COLS }, (_, c) => list.reduce((a, r) => a + r[c], 0) / list.length),
    }));
  });
  const max = $derived(Math.max(1e-9, ...rows.flatMap((r) => r.cells)));
  const SHADES = ["#22262a", "#1d4d33", "#24804f", "#2fb36b", "#3ddc84"];
  /** An empty hour during Curfew. */
  const NIGHT = "#1b1f36";
  const shade = (v: number) => (v <= 0 ? SHADES[0] : SHADES[Math.min(4, 1 + Math.floor((v / max) * 3.999))]);

  // Opens on the row holding the shared Day (today's, at first), and goes back to it after a switch.
  let scroller = $state<HTMLDivElement>();

  /** The column of the busiest hour across everything in view, or null with nothing earned. */
  const busiest = $derived.by(() => {
    const sums = Array.from({ length: COLS }, (_, c) => rows.reduce((a, r) => a + r.cells[c], 0));
    const top = Math.max(...sums);
    return top > 0 ? sums.indexOf(top) : null;
  });
  // Its label reads away from the column, toward the open side, so it never runs off the card;
  // the time sits next to the column either way.
  // Grid lines: line 1 starts the label column, line c + 2 starts hour column c.
  const peakSpan = $derived(busiest === null ? "" : busiest < COLS / 2 ? `${busiest + 3} / -1` : `2 / ${busiest + 2}`);
</script>

<TrendCard title="When you earn" date={{ day: selection.day ?? lastDay, today: lastDay, oldest: history[0]?.day, unit: by, onpick: (d) => selection.set("when", { day: d === lastDay ? null : d, picked: false }) }}>
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "day", label: "Day" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }]} value={by} onchange={(v) => pickBy(v as By)} />
  {/snippet}
  {#if !rows.length}
    <p class="empty">Vouchers earned by the hour show here as the log fills.</p>
  {:else}
    <!-- Each switch zooms in like the bar graph's Day, Week, and Month. -->
    {#key by}
    <div class="grid" class:fit in:zoomFade={{ out: widened }}>
      <div class="stage">
        <!-- The busiest hour: a label beside its column, on the same columns as the rows. -->
        {#if busiest !== null}
          {@const time = `${String(hourOf(busiest)).padStart(2, "0")}:00`}
          <div class="cols peak" aria-hidden="true"><span style="grid-column: {peakSpan}" class:end={busiest >= COLS / 2}>{#if busiest >= COLS / 2}busiest <b>{time}</b>{:else}<b>{time}</b> busiest{/if}</span></div>
        {/if}
        <div class="rows" bind:this={scroller}>
          {#each rows as r (r.key)}
            <div class="row" class:chosen={r.key === chosenKey} data-key={r.key}><span class="label">{r.label}</span>{#each r.cells as v, c}<i style="background: {v <= 0 && inCurfew(hourOf(c)) ? NIGHT : shade(v)}" title="{v.toFixed(by === 'day' ? 0 : 1)}"></i>{/each}</div>
          {/each}
        </div>
        <!-- Over the scroller, not in it, so the outline stays put while the rows scroll. -->
        {#if busiest !== null}
          <div class="cols outline" aria-hidden="true"><i style="grid-column: {busiest + 2}"></i></div>
        {/if}
      </div>
      <!-- Under the rows and outside the scroller, so the hours never move.
           The label column (44px) plus HourAxis's own 2px gap meets the cells. -->
      <HourAxis lead={44} />
    </div>
    {/key}
    <Legend scale={{ from: "Fewer", colors: SHADES, to: `More Vouchers${by === "day" ? "" : ", per Day on average"}` }} />
  {/if}
</TrendCard>

<style>
  .grid { display: flex; flex-direction: column; gap: 4px; }
  .stage { position: relative; display: flex; flex-direction: column; gap: 3px; }
  /* The rows' columns, for the busiest hour's label and outline. */
  .cols { display: grid; grid-template-columns: 44px repeat(24, minmax(0, 1fr)); column-gap: 2px; pointer-events: none; }
  .peak { height: 12px; }
  .peak span { min-width: 0; padding: 0 2px; font: 500 var(--axis-size)/12px var(--mono); color: var(--muted); white-space: nowrap; }
  .peak span.end { text-align: right; }
  .peak b { color: var(--ink); font-weight: 700; }
  /* From the label's row down to the bottom of the rows in view. */
  .outline { position: absolute; inset: 0; }
  .outline i { margin: 0 -1px; border: 1px solid rgba(242, 242, 240, .45); border-radius: 4px; }
  .row { display: grid; grid-template-columns: 44px repeat(24, minmax(0, 1fr)); gap: 2px; align-items: center; }
  /* In a tablet slot the rows take whatever height is left. */
  .grid.fit, .grid.fit .stage { flex: 1; min-height: 0; }
  .grid.fit .rows { flex: 1; min-height: 0; max-height: none; }
  .rows { position: relative; display: flex; flex-direction: column; gap: 3px; max-height: 260px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .rows::-webkit-scrollbar { display: none; }
  .row i { display: block; height: 14px; border-radius: 3px; }
  .label { font: 500 var(--axis-size) var(--mono); color: var(--axis-ink); }
  /* The row holding the Day picked on any card. */
  .row.chosen .label { color: var(--ink); font-weight: 700; }
  .row.chosen i { box-shadow: 0 0 0 1px rgba(242, 242, 240, .5); }
</style>
