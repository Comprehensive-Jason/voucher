<script lang="ts">
  // How long do I hold out each morning? A row per week, newest at the
  // bottom (scroll up for earlier ones, as far as the log keeps them), a dot
  // at each Day's first Unlock across the whole Day, 06:00 to 06:00, with
  // Curfew's hours shaded in the night colour; a hollow dot in the "none"
  // column at the far right for a Day with no Unlock at all. Both in salmon,
  // Unlocks' colour everywhere. The further
  // right the dots, the longer the morning ran before the first Distraction.
  // A tick in the sleep colour marks each Day's wake-up (hollow when the
  // night was estimated, at 06:00 when it came before), so the stretch from
  // tick to dot is how long you held out after waking.
  // The gold dashed line is the middle first Unlock of the last 4 weeks, its
  // time over it; a fainter one marks the 4 weeks before, with its time, when
  // the two are 10 minutes or more apart. The hours sit under the scroller
  // and never move, drawn as HourAxis draws them.
  // It follows the shared Day: that Day's dot is ringed and its week scrolled
  // into view, and tapping a dot shares its Day. A week holding a Marker has
  // a small notched flag beside its date,
  // the Markers' Days and texts in its tooltip and in their Days' dots'.
  //
  // With From wake on (an Arrange-mode switch, PANELS' options), each dot
  // sits at the hours from that Day's wake-up to its first Unlock, on an
  // axis of hours after waking fitted to the Days drawn, and the usual lines
  // are the middle of those. Only Days with a tracked (Health Connect)
  // wake-up are drawn: an estimated one comes from the first device use,
  // which may be the Unlock itself. Curfew's shading and the wake ticks go,
  // since neither has one place on that axis.
  import TrendCard from "$core/components/TrendCard.svelte";
  import Legend from "$core/components/Legend.svelte";
  import { inCurfew } from "$core/curfew.svelte";
  import { clock, hoursAndMinutes, shortDate } from "$core/time";
  import { clockOfHours, median, mondayOf } from "$core/trends";
  import { fitsSlot } from "$core/fit.svelte";
  import type { DayTotal, Marker } from "$core/types";
  import { dayOfMoment, markerKeys, notes } from "$core/notes.svelte";
  import { selection } from "$core/selection.svelte";
  import { untrack } from "svelte";
  import { arrangement } from "../../arrangement.svelte";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const fit = fitsSlot();
  const START = 6, END = 30;
  const hoursAt = (at: string) => { const [h, m] = clock(at, timeZone).split(":").map(Number); return (h < START ? h + 24 : h) + m / 60; };

  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));
  /** A Day's first Unlock (`t`, hours on the 06:00 clock), its wake-up (`t`
   *  drawn no earlier than 06:00, `raw` as it was), and the hours between. */
  type Item = { day: string; t: number | null; wake: { t: number; raw: number; at: string; estimated: boolean } | null; since: number | null };
  type Week = { monday: string; list: Item[] };
  // A new history usually changes only today, which this card leaves out:
  // each Day's dot and tick, and each week's row, keep their objects while
  // what they're drawn from reads the same, so the clock isn't asked for
  // every time again and only rows that changed are drawn again.
  let seenDays = new Map<string, { text: string; item: Item }>(), seenWeeks = new Map<string, Week>(), lastWeeks: Week[] = [];
  const items = $derived.by(() => {
    const next = new Map<string, { text: string; item: Item }>();
    const out = days.map((d) => {
      const text = `${timeZone}|${d.first_tear}|${d.sleep?.wake}|${d.sleep?.source}`;
      const old = seenDays.get(d.day);
      let item = old && old.text === text ? old.item : null;
      if (!item) {
        // A wake-up before 06:00 still leads into the Day: drawn at 06:00.
        const at = d.sleep ? clock(d.sleep.wake, timeZone) : "";
        const raw = Number(at.slice(0, 2)) + Number(at.slice(3)) / 60;
        const wake = d.sleep ? { t: Math.max(START, raw), raw, at, estimated: d.sleep.source === "estimated" } : null;
        const t = d.first_tear ? hoursAt(d.first_tear) : null;
        // An Unlock logged before the wake-up counts as none held out.
        item = { day: d.day, t, wake, since: t !== null && wake ? Math.max(0, t - raw) : null };
      }
      next.set(d.day, { text, item });
      return item;
    });
    seenDays = next;
    return out;
  });
  const fromWake = $derived(arrangement.switchOn("runway", "fromwake"));
  /** A Day with a tracked wake-up, the only kind From wake draws. */
  const tracked = (d: Item) => !!d.wake && !d.wake.estimated;
  /** Where a Day's dot sits, in hours along the axis drawn, or null for the "none" column. */
  const valueOf = (d: Item) => (fromWake ? d.since : d.t);
  const shown = $derived(fromWake ? items.filter(tracked) : items);
  const weeks = $derived.by(() => {
    const map = new Map<string, Item[]>();
    for (const item of shown) { const key = mondayOf(item.day); map.set(key, [...(map.get(key) ?? []), item]); }
    const next = new Map<string, Week>();
    const out = [...map.entries()].map(([monday, list]) => {
      const old = seenWeeks.get(monday);
      const week = old && old.list.length === list.length && old.list.every((x, i) => x === list[i]) ? old : { monday, list };
      next.set(monday, week);
      return week;
    });
    seenWeeks = next;
    if (out.length === lastWeeks.length && out.every((w, i) => w === lastWeeks[i])) return lastWeeks;
    return (lastWeeks = out);
  });
  // The last 4 weeks of Days and the 4 before, of those drawn.
  const usualOf = (list: Item[]) => median(list.filter((d) => !fromWake || tracked(d)).flatMap((d) => { const v = valueOf(d); return v === null ? [] : [v]; }));
  const recent = $derived(usualOf(items.slice(-28)));
  const before = $derived(usualOf(items.slice(-56, -28)));
  /** A usual line's label: a clock time, or hours after waking. */
  const usualText = (h: number) => (fromWake ? hoursAndMinutes(h * 60) : clockOfHours(h));

  /** The 4 weeks before, drawn only when they differ from lately by 10 minutes or more. */
  /** Whether any Day drawn has a wake-up, and any an estimated one, for the keys (From wake draws none). */
  const wakes = $derived(fromWake ? [] : weeks.flatMap((w) => w.list.flatMap((d) => (d.wake ? [d.wake] : []))));
  const showBefore = $derived(!Number.isNaN(recent) && !Number.isNaN(before) && Math.abs(recent - before) * 60 >= 10);

  // Markers on the Days drawn, by Day, oldest first.
  $effect(() => { notes.load(); });
  const marksOn = $derived.by(() => {
    const have = new Set(shown.map((d) => d.day));
    const out = new Map<string, Marker[]>();
    for (const m of notes.markers) { const d = dayOfMoment(m.at); if (have.has(d)) out.set(d, [...(out.get(d) ?? []), m]); }
    return out;
  });
  const marks = $derived([...marksOn.values()].flat());
  /** A Day's Markers as tooltip lines, after its own line. */
  const markLines = (day: string) => (marksOn.get(day) ?? []).map((m) => `\n${m.text}`).join("");

  // Drawn 600 wide; each week a 22-high row.
  const W = 600, x1 = 560, ROW = 22;
  const H = $derived(weeks.length * ROW);
  /** The drawing's units per pixel, which keeps its text one size (see TrendCard). */
  let width = $state(0);
  const k = $derived(W / (width || W));
  /** Where the hours start: room for the widest week's date ("09-07", or
   *  "2025-09-07" from another year) at the axis size, however narrow the card. */
  /** Room between the dates and the hours for a week's Marker flag, when any week has one. */
  const flagRoom = $derived(marks.length ? Math.round(12 * k) : 0);
  const x0 = $derived(Math.max(52, Math.round((10 + 5.6 * Math.max(5, ...weeks.map((w) => shortDate(w.monday, today).length))) * k)) + flagRoom);
  /** From wake's axis: whole hours after waking, labeled every `step`, out
   *  past the longest morning drawn (at least 6, at most 24). */
  const wakeAxis = $derived.by(() => {
    const most = Math.max(0, ...shown.flatMap((d) => (d.since === null ? [] : [d.since])));
    const step = most <= 7 ? 1 : most <= 11 ? 2 : 3;
    const span = Math.min(24, Math.max(6, Math.ceil((most * 1.05 + 0.25) / step) * step));
    // Not at the far end, where it would run into "none".
    return { span, ticks: Array.from({ length: Math.ceil(span / step) }, (_, i) => i * step) };
  });
  const xAt = (h: number) => fromWake
    ? x0 + (Math.min(h, wakeAxis.span) / wakeAxis.span) * (x1 - x0)
    : x0 + ((Math.min(h, END) - START) / (END - START)) * (x1 - x0);
  /** The Day's hours, 6 to 29 (29 is 05:00), and which fall in Curfew (shaded only on the clock). */
  const HOURS = Array.from({ length: END - START }, (_, i) => START + i);
  const night = $derived(fromWake ? [] : HOURS.filter((h) => inCurfew(h % 24)));

  // Open at the newest weeks; follow the shared Day to its week.
  let scroller = $state<HTMLDivElement>();
  const today = $derived(history.at(-1)?.day ?? "");
  const chosen = $derived(selection.day ?? today);
  const chosenRow = $derived(weeks.findIndex((w) => w.monday === mondayOf(chosen)));
  $effect(() => { weeks.length; if (scroller) scroller.scrollTop = scroller.scrollHeight; });
  $effect(() => {
    selection.seq;
    const row = chosenRow;
    untrack(() => {
      if (!scroller || selection.from === "runway") return;
      if (row < 0) { scroller.scrollTo({ top: scroller.scrollHeight, behavior: "smooth" }); return; }
      // The row's place in pixels: the SVG scales to the scroller's width.
      const px = (row * ROW + ROW / 2) * (scroller.clientWidth / W);
      scroller.scrollTo({ top: Math.max(0, px - scroller.clientHeight / 2), behavior: "smooth" });
    });
  });
  const pick = (day: string) => selection.set("runway", { day: day === today ? null : day, picked: true });
</script>

<TrendCard title="Morning runway" date={{ day: selection.day ?? today, today, oldest: days[0]?.day, onpick: (d) => selection.set("runway-step", { day: d === today ? null : d, picked: false }) }}>
  {#if !weeks.length}
    <p class="empty">{fromWake && items.length ? "From wake needs Days with a tracked wake-up. Turn it off in Arrange mode to see every Day." : "First Unlocks show here as the log fills."}</p>
  {:else}
    <div class="wrap" class:fit bind:clientWidth={width}>
      <!-- The usual times, over their lines and outside the scroller, so they stay in view.
           With both drawn, each reads outward from its line so the two never overlap. -->
      {#if !Number.isNaN(recent)}
        {@const late = !showBefore || recent >= before}
        <svg class="chart times" viewBox="0 0 {W} {14 * k}" style="--k: {k}" aria-hidden="true">
          <text class="time recent" x={xAt(recent) + (showBefore ? (late ? 4 : -4) * k : 0)} y={10 * k} text-anchor={showBefore ? (late ? "start" : "end") : "middle"}>{usualText(recent)}</text>
          {#if showBefore}<text class="time" x={xAt(before) + (late ? -4 : 4) * k} y={10 * k} text-anchor={late ? "end" : "start"}>{usualText(before)}</text>{/if}
        </svg>
      {/if}
      <div class="rows" bind:this={scroller}>
        <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label={fromWake ? "Hours from waking to each Day's first Unlock, by week" : "Each Day's first Unlock, by week"}>
          <!-- Curfew's hours, in the night colour behind the rows. -->
          {#each night as h (h)}<rect x={xAt(h)} y="0" width={xAt(h + 1) - xAt(h)} height={H} style="fill: var(--night-band)" />{/each}
          {#if showBefore}<line x1={xAt(before)} x2={xAt(before)} y1="0" y2={H} stroke="var(--muted)" stroke-opacity=".5" stroke-width={k} stroke-dasharray="{2 * k} {4 * k}" />{/if}
          {#if !Number.isNaN(recent)}<line x1={xAt(recent)} x2={xAt(recent)} y1="0" y2={H} stroke="var(--goal)" stroke-width={1.2 * k} stroke-dasharray="{3 * k} {3 * k}" />{/if}
          {#if chosenRow >= 0}<rect x="0" y={chosenRow * ROW} width={W} height={ROW} rx="4" fill="var(--select)" />{/if}
          {#each weeks as w, r (w.monday)}
            {@const y = r * ROW + ROW / 2}
            {@const wm = w.list.flatMap((d) => marksOn.get(d.day) ?? [])}
            <text x={x0 - 8 - flagRoom} y={y + 3} text-anchor="end">{shortDate(w.monday, today)}</text>
            {#if wm.length}
              {@const color = "var(--marker)"}
              <!-- The week's Markers: a notched flag, as in the keys, in the Marker colour. -->
              <g class="flag" transform="translate({x0 - 4 - 10 * k} {y - 6 * k}) scale({k})">
                <title>{wm.map((m) => `${shortDate(dayOfMoment(m.at), today)}: ${m.text}`).join("\n")}</title>
                <rect x="-1" y="-1" width="12" height="14" fill="transparent" />
                <path d="M1.6 11.2V1" stroke={color} stroke-width="1.6" stroke-linecap="round" />
                <path d="M1.6 1h7l-2 2.75 2 2.75h-7z" fill={color} />
              </g>
            {/if}
            <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--divider)" />
            {#each w.list as d, i (d.day)}
              {@const v = valueOf(d)}
              {@const cx = v === null ? x1 + 22 : xAt(v)}
              {@const cy = y + (i - 3) * 1.6}
              <!-- The Day's wake-up: a tick in the sleep colour, hollow when the night was estimated. The runway is the stretch from it to the dot. -->
              {#if d.wake && !fromWake}
                {@const wx = xAt(d.wake.t)}
                <rect class="wake" class:estimated={d.wake.estimated} x={wx - (d.wake.estimated ? 1.8 : 1.2)} y={cy - 5} width={d.wake.estimated ? 3.6 : 2.4} height="10" rx="1"><title>{shortDate(d.day, today)}: woke {d.wake.at}{d.wake.estimated ? ", estimated" : ""}</title></rect>
              {/if}
              {#if d.day === chosen}<circle {cx} {cy} r="8" fill="none" stroke="var(--ink)" stroke-width="1.5" />{/if}
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <g class="dot pressdim" onclick={() => pick(d.day)}>
                <circle {cx} {cy} r="9" fill="transparent" />
                {#if d.t === null}<circle {cx} {cy} r="4" fill="none" stroke="var(--spend)" stroke-width="1.5"><title>{shortDate(d.day, today)}: no Unlock{markLines(d.day)}</title></circle>
                {:else}<circle {cx} {cy} r="4" fill="var(--spend)" opacity=".8"><title>{shortDate(d.day, today)}: first Unlock {clockOfHours(d.t)}{fromWake && d.since !== null ? `, ${hoursAndMinutes(d.since * 60)} after waking at ${d.wake?.at}` : ""}{markLines(d.day)}</title></circle>{/if}
              </g>
            {/each}
          {/each}
        </svg>
      </div>
      <!-- As HourAxis draws them: every third hour from each hour's start, Curfew's in the night colour; From wake, hours after waking. -->
      <svg class="chart axis" viewBox="0 0 {W} 18" style="--k: {k}" aria-hidden="true">
        {#if fromWake}
          {#each wakeAxis.ticks as h (h)}<text class="hour" x={xAt(h)} y="13">{h}h</text>{/each}
        {:else}
          {#each HOURS.filter((h) => (h - START) % 3 === 0) as h (h)}<text class="hour" class:night={inCurfew(h % 24)} x={xAt(h)} y="13">{String(h % 24).padStart(2, "0")}</text>{/each}
        {/if}
        <text class="hour" x={x1 + 22} y="13" text-anchor="middle">none</text>
      </svg>
    </div>
    <!-- The note fits the legend's one line only beside three keys; a fourth (the 4 weeks before, a Marker's, or the wake-ups') pushes it out;
         beside the 4 weeks before and the wake-ups, "Usual lately" shortens to "Lately" to keep one line.
         The hollow rings need no key: the column they sit in is headed "none". -->
    <Legend
      items={[{ kind: "dot", color: "var(--spend)", label: "First Unlock" },
        ...(wakes.length ? [{ kind: "tick" as const, color: "var(--sleep)", label: "Woke" }] : []),
        ...(wakes.some((w) => w.estimated) ? [{ kind: "opentick" as const, color: "var(--sleep)", label: "Estimated" }] : []),
        { kind: "usual", color: "var(--goal)", label: showBefore && wakes.length ? "Lately" : "Usual lately" }, ...(showBefore ? [{ kind: "usual" as const, color: "var(--muted)", label: "4 weeks before" }] : []), ...markerKeys(marks)]}
      note={showBefore || marks.length || wakes.length ? undefined : "further right: a longer morning"} />
  {/if}
</TrendCard>

<style>
  .wrap { display: flex; flex-direction: column; gap: 2px; }
  /* About eight weeks in view on a phone; in a tablet slot, whatever height is left. */
  .rows { max-height: 190px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .rows::-webkit-scrollbar { display: none; }
  .wrap.fit { flex: 1; min-height: 0; }
  .wrap.fit .rows { flex: 1; min-height: 0; max-height: none; }
  .axis, .times { flex: none; }
  /* Two classes deep, to outrank TrendCard's axis-ink for chart text. */
  .times text.time { fill: var(--muted); }
  .times text.time.recent { fill: var(--goal); font-weight: 700; }
  .dot { cursor: pointer; transition: var(--press); }
  .wake { fill: var(--sleep); }
  .wake.estimated { fill: none; stroke: var(--sleep); stroke-width: 1.2; }
  /* HourAxis's look: 10px mono hour labels, Curfew's in the night colour. */
  .axis text.hour { font-size: calc(var(--axis-size) * var(--k, 1)); font-weight: 500; }
  .axis text.hour.night { fill: var(--night); }
</style>
