<script lang="ts">
  // Do busy Days cost Vouchers? Four weeks, a column per Day: the Day's busy
  // time in the chosen calendars rises above a centre line in the calendar
  // colour, and its Vouchers hang below it in green, with the gold dashed
  // Daily goal across the lower half (stepping where the goal changed). The
  // calendar can't tell a meeting from any other timed event, so the card
  // says events. It shows the four weeks ending with the week of the shared
  // Day, steps a week at a time, lights that Day's column, and shares a Day
  // when its column is tapped. Markers are thin lines with a flag. With no
  // calendar chosen, it says where to choose one.
  import TrendCard from "../../components/TrendCard.svelte";
  import ChartAxis from "../../components/ChartAxis.svelte";
  import MarkerLines from "../../components/MarkerLines.svelte";
  import Legend from "../../components/Legend.svelte";
  import { drawHeight, fitsSlot } from "../../fit.svelte";
  import { mondayOf } from "../../trends";
  import { shiftDay, shortDate } from "../../time";
  import type { DayTotal } from "../../types";
  import { dayOfMoment, markerKeys, notes } from "../../notes.svelte";
  import { selection } from "../../selection.svelte";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  let pw = $state(0), ph = $state(0);

  const today = $derived(history.at(-1)?.day ?? "");
  const chosen = $derived(selection.day ?? today);
  const anyCalendar = $derived(history.some((d) => d.calendar));
  /** The four weeks ending with the chosen Day's week (today at the latest). */
  const days = $derived.by(() => {
    if (!chosen) return [];
    const end = shiftDay(mondayOf(chosen), 6), start = shiftDay(end, -27);
    const byDay = new Map(history.map((d) => [d.day, d]));
    return Array.from({ length: 28 }, (_, i) => shiftDay(start, i)).map((day) => ({ day, d: byDay.get(day) ?? null, future: day > today }));
  });
  const oldest = $derived(history.find((d) => d.calendar)?.day ?? history[0]?.day);

  const W = 600, FLAG_Y = 3;
  const H = $derived(fit ? drawHeight(pw, ph, 200) : 200);
  const k = $derived(W / (pw || W));
  const y1 = $derived(Math.round(FLAG_Y + 12 * k));
  const bottom = $derived(H - 16 * k);
  const mid = $derived(y1 + (bottom - y1) * 0.48);
  /** Busy hours up to the largest whole hour shown (8 h at least). */
  const busyTop = $derived(Math.max(480, Math.ceil(Math.max(0, ...days.map((x) => x.d?.calendar?.busy_minutes ?? 0)) / 60) * 60));
  const vTop = $derived(Math.max(1, ...days.map((x) => Math.max(x.d?.earned ?? 0, x.d?.goal ?? 0))) * 1.1);
  const up = (m: number) => mid - ((m / busyTop) * (mid - y1));
  const down = (v: number) => mid + ((v / vTop) * (bottom - mid));
  const busyTicks = $derived([0, Math.round(busyTop / 120) * 60, busyTop]);
  const goalNow = $derived(days.findLast((x) => x.d?.goal)?.d?.goal ?? 0);
  /** Vouchers ticks, leaving room around the goal's own label. */
  const vTicks = $derived([Math.round(vTop / 2.2), Math.round(vTop / 1.1)].filter((v) => v && Math.abs(v - goalNow) > vTop * 0.2));
  const x0 = $derived(Math.round(16 + k * (7 + 6.6 * 3)));
  /** An axis name only where its half is tall enough for it (9px letters, about 5.8px each). */
  const named = (title: string, from: number, to: number) => ((to - from) / k >= title.length * 5.8 + 6 ? title : "");
  const x1 = W - 4;
  const slot = $derived((x1 - x0) / 28);
  const bw = $derived(Math.max(4 * k, slot * 0.62));
  const xc = (i: number) => x0 + slot * (i + 0.5);

  $effect(() => { notes.load(); });
  const marks = $derived.by(() => {
    const at = new Map(days.map((x, i) => [x.day, i]));
    return notes.markers.flatMap((m) => { const i = at.get(dayOfMoment(m.at)); return i === undefined ? [] : [{ x: xc(i), text: `${shortDate(dayOfMoment(m.at), today)}: ${m.text}`, rule: m.rule }]; });
  });
  /** The Daily goal as steps across each Day's slot. */
  const goalPath = $derived(days.map((x, i) => (x.d?.goal ? `${i && days[i - 1].d?.goal ? "L" : "M"}${(x0 + slot * i).toFixed(1)},${down(x.d.goal).toFixed(1)}H${(x0 + slot * (i + 1)).toFixed(1)}` : "")).join(""));
  const busyWords = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ""}` : `${m} min`);
  const pick = (day: string) => selection.set("calendar", { day: day === today ? null : day, picked: true });
</script>

<TrendCard title="Calendar load" date={anyCalendar ? { day: chosen, today, oldest, unit: "week", onpick: (d) => selection.set("calendar", { day: d === today ? null : d, picked: false }) } : undefined}>
  {#if !anyCalendar}
    <div class="empty box">
      <p class="empty">Choose calendars in Sources to see busy Days against Vouchers. Only when events start and end is read.</p>
      <a class="btn small" href="/rules/sources">Open Sources</a>
    </div>
  {:else}
    <div class="plot" bind:clientWidth={pw} bind:clientHeight={ph}>
      <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Busy time in events above, Vouchers below, a column per Day">
        {#each days as x, i (x.day)}
          {#if x.day === chosen}<rect x={x0 + slot * i} y={y1} width={slot} height={bottom - y1} rx={3 * k} fill="var(--select)" />{/if}
        {/each}
        <ChartAxis ticks={busyTicks} yAt={up} {x0} {x1} y0={mid} {y1} title={named("Busy", y1, mid)} format={(m) => (m ? `${m / 60} h` : "")} />
        <ChartAxis ticks={vTicks} yAt={down} {x0} {x1} y0={bottom} y1={mid} title={named("Vouchers", mid, bottom)} />
        <MarkerLines {marks} y0={bottom} y1={FLAG_Y} />
        {#each days as x, i (x.day)}
          {@const cal = x.d?.calendar}
          <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
          <g class="col pressdim" onclick={() => !x.future && pick(x.day)}>
            <rect x={x0 + slot * i} y={y1} width={slot} height={bottom - y1} fill="transparent" />
            {#if cal && cal.busy_minutes}
              <rect x={xc(i) - bw / 2} y={up(cal.busy_minutes)} width={bw} height={mid - 1.5 * k - up(cal.busy_minutes)} rx={2 * k} style="fill: var(--calendar)"><title>{shortDate(x.day, today)}: {cal.events} event{cal.events === 1 ? "" : "s"}, {busyWords(cal.busy_minutes)} busy</title></rect>
            {:else if cal}<title>{shortDate(x.day, today)}: no events</title>
            {/if}
            {#if x.d && x.d.earned}
              <rect x={xc(i) - bw / 2} y={mid + 1.5 * k} width={bw} height={down(x.d.earned) - mid - 1.5 * k} rx={2 * k} fill="var(--voucher)"><title>{shortDate(x.day, today)}: {x.d.earned} Vouchers{x.d.goal ? `, goal ${x.d.goal}${x.d.goal_met ? " met" : ""}` : ""}</title></rect>
            {/if}
          </g>
          {#if x.day === today}<text x={xc(i)} y={H - 3 * k} text-anchor="end" dx={bw / 2} class="today">Today</text>
          {:else if i % 7 === 0 && !(days.some((t) => t.day === today) && days.findIndex((t) => t.day === today) - i < 4)}<text x={xc(i) - bw / 2} y={H - 3 * k}>{shortDate(x.day, today)}</text>{/if}
        {/each}
        <path d={goalPath} fill="none" stroke="var(--goal)" stroke-width={1.4 * k} stroke-dasharray="{4 * k} {3 * k}" />
        {#if goalNow}<text class="tag goal" x={x0 - 6} y={down(goalNow) + 3.5} text-anchor="end">{goalNow}</text>{/if}
      </svg>
    </div>
    <Legend items={[
      { kind: "box", color: "var(--calendar)", label: "Busy" },
      { kind: "box", color: "var(--voucher)", label: "Vouchers" },
      { kind: "dash", color: "var(--goal)", label: "Daily goal" },
      ...markerKeys(marks),
    ]} />
  {/if}
</TrendCard>

<style>
  .col { cursor: pointer; transition: var(--press); }
  .empty.box { flex: 1; flex-direction: column; gap: 10px; }
  /* Two classes deep, to outrank TrendCard's axis-ink for chart text. */
  svg.chart text.today { fill: var(--ink); }
  svg.chart text.goal { fill: var(--goal); font-weight: 700; }
</style>
