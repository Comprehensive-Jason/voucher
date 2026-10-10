<script lang="ts">
  // When does each kind of work go best for me? A row per source: how its
  // Vouchers spread over the hours from 06:00, each row scaled to its own
  // busiest hour so a quiet source's shape shows as clearly as a busy one's.
  // That busiest hour's bar is the solid one, with its time over it; the
  // rest are dimmer. The range picks which Days count. The hours sit under the rows, outside
  // their scroller.
  import TrendCard from "../../components/TrendCard.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import HourAxis from "../../components/HourAxis.svelte";
  import { compareSources, styleOf } from "../../sources";
  import { zoomFade } from "../../motion";
  import { inCurfew } from "../../curfew.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  type Span = "28" | "84" | "182" | "all";
  let span = $state<Span>("84");
  let widened = $state(true);
  const ORDER: Span[] = ["28", "84", "182", "all"];
  function setSpan(next: Span) { widened = ORDER.indexOf(next) > ORDER.indexOf(span); span = next; }

  // The whole Day, 06:00 to 06:00, with Curfew's hours in the night colour.
  const FIRST = 6, COLS = 24;
  const hourOf = (c: number) => (FIRST + c) % 24;
  const days = $derived((span === "all" ? history : history.slice(-Number(span))).filter((d) => d.source_hours));
  const rows = $derived.by(() => {
    const sums = new Map<string, number[]>();
    for (const d of days) for (const [id, hours] of Object.entries(d.source_hours ?? {})) {
      const row = sums.get(id) ?? Array<number>(COLS).fill(0);
      hours.forEach((n, h) => (row[(h - FIRST + 24) % 24] += n));
      sums.set(id, row);
    }
    return [...sums.entries()]
      .map(([id, cells]) => ({ id, ...styleOf(id), cells, total: cells.reduce((a, b) => a + b, 0), peak: cells.indexOf(Math.max(...cells)) }))
      .filter((r) => r.total > 0)
      .sort((a, b) => compareSources(a, b));
  });
  const hh = (c: number) => String((FIRST + c) % 24).padStart(2, "0") + ":00";
</script>

<TrendCard title="Best hours by source">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "28", label: "4 weeks" }, { id: "84", label: "12 weeks" }, { id: "182", label: "6 months" }, { id: "all", label: "All" }]} value={span} onchange={(v) => setSpan(v as Span)} />
  {/snippet}
  {#if !rows.length}
    <p class="empty">Each source's hours show here as the log fills.</p>
  {:else}
    {#key span}
    <div class="grid" class:fit in:zoomFade={{ out: widened }}>
      <div class="rows">
        {#each rows as r (r.id)}
          {@const top = Math.max(...r.cells)}
          <div class="row" title="{r.name}: busiest around {hh(r.peak)}">
            <span class="name">{r.name}</span>
            <!-- A filled ridge: each hour as tall as its share of the source's busiest hour. -->
            <div class="ridge">{#each r.cells as n, c}<span class="hour" class:night={inCurfew(hourOf(c))} class:peak={c === r.peak}><i style="height: {(n / top) * 100}%; background: {r.color}"></i>{#if c === r.peak}<b class:start={c < 2} class:end={c > COLS - 3}>{hh(c)}</b>{/if}</span>{/each}</div>
          </div>
        {/each}
      </div>
      <!-- The name column (84px) and its 8px gap, less HourAxis's own 2px gap,
           so each hour sits over its ridge column. -->
      <HourAxis lead={90} />
    </div>
    {/key}
  {/if}
</TrendCard>

<style>
  .grid { display: flex; flex-direction: column; gap: 4px; }
  .grid.fit { flex: 1; min-height: 0; }
  .row { display: grid; grid-template-columns: 84px minmax(0, 1fr); align-items: end; gap: 8px; }
  .rows { display: flex; flex-direction: column; gap: 6px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .grid.fit .rows { flex: 1; min-height: 0; }
  /* In a tablet slot the rows share the height left, so the peaks' times don't push the last row out of view;
     past a few sources they keep a floor and scroll. */
  .grid.fit .row { flex: 1 1 0; min-height: 34px; }
  .grid.fit .ridge { height: auto; align-self: stretch; }
  /* Centred on the ridge, below the peak's time. */
  .name { margin-top: 11px; font-size: 12.5px; color: var(--ink); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; align-self: center; }
  /* The top 11px holds the peak's time, over the ridge rather than on it. */
  .ridge { height: 26px; margin-top: 11px; display: grid; grid-template-columns: repeat(24, minmax(0, 1fr)); gap: 2px; align-items: end; border-bottom: 1px solid #2c3036; }
  .ridge .hour { position: relative; height: 100%; display: flex; align-items: flex-end; }
  /* Curfew's hours, in the night colour behind the ridge. */
  .ridge .hour.night { background: var(--night-band); }
  .ridge i { display: block; width: 100%; border-radius: 2px 2px 0 0; min-height: 1px; opacity: .45; }
  .ridge .peak i { opacity: 1; }
  /* The peak's time, centred over its bar; at either end it lines up with the bar's outer edge instead, so it stays on the card. */
  .ridge b { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); padding-bottom: 1px; font: 600 var(--axis-size)/10px var(--mono); color: var(--ink); white-space: nowrap; }
  .ridge b.start { left: 0; transform: none; }
  .ridge b.end { left: auto; right: 0; transform: none; }
</style>
