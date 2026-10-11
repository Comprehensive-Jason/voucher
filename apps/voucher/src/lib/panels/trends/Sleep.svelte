<script lang="ts">
  // How do my nights go, and how does the Day after go with them? A row per
  // night, newest at the bottom (scroll up for earlier ones), on the hours
  // from 20:00 to 12:00 with Curfew shaded in the night colour. Each night is
  // a bar in the sleep colour from bedtime to wake-up: filled when Health
  // Connect recorded it, hollow and dashed when it was estimated from when
  // devices were last and first used. Hours asleep sit at the row's end. The
  // gold dashed lines are the usual bedtime and wake-up of the last 4 weeks
  // (the middle ones), their times over them, outside the scroller.
  //
  // Right of that, the Day the night led into, in columns picked in Arrange
  // mode (PANELS' options): the Curfew answer as a square in Verdicts'
  // colours, Vouchers earned as a green bar with a gold tick at the Daily
  // goal, and Distraction minutes as a bar split by blocklist (hatched when
  // no device reported). A night belongs to the Day it wakes into, as in the
  // Ledger. It follows the shared Day (its row lit and scrolled into view),
  // and tapping a row shares its Day. A Day with a Marker has a flag by its date.
  // The legend keys each column picked, named by its head (Day, Earned,
  // Distr), so it fits one line at a one-third width.
  import TrendCard from "../../components/TrendCard.svelte";
  import Legend, { type LegendItem } from "../../components/Legend.svelte";
  import { curfew } from "../../curfew.svelte";
  import { clock, shortDate } from "../../time";
  import { median } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import { arrangement } from "../../arrangement.svelte";
  import { minutesByList, type ListMinutes } from "../../blocklists";
  import type { Blocklist, DayTotal, Marker, Verdict } from "../../types";
  import { dayOfMoment, markerKeys, measured, notes } from "../../notes.svelte";
  import { selection } from "../../selection.svelte";
  import { untrack } from "svelte";

  let { history, timeZone, blocklists = {} }: { history: DayTotal[]; timeZone: string; blocklists?: Record<string, Blocklist> } = $props();
  const fit = fitsSlot();
  const uid = $props.id();

  /** Minutes from the wake-up Day's midnight: a bedtime after noon is the evening before, so negative. */
  const minutesOf = (at: string, bed: boolean) => {
    const [h, m] = clock(at, timeZone).split(":").map(Number);
    const t = h * 60 + m;
    return bed && t >= 12 * 60 ? t - 1440 : t;
  };
  /** The hours drawn: 20:00 the evening before to 12:00. */
  const A = -4 * 60, B = 12 * 60;

  // Every Day from the first night on record, oldest first.
  const today = $derived(history.at(-1)?.day ?? "");
  const first = $derived(history.findIndex((d) => d.sleep));
  type Night = { d: DayTotal; bed: number | null; wake: number | null; parts: ListMinutes[] };
  /** Each row as last drawn, with what it reads of its Day as text. A new
   *  history usually changes only today's numbers: a row that reads the same
   *  keeps its object (and its Day's), so only rows that changed are drawn
   *  again and their times turned into minutes again. */
  let seenNights = new Map<string, { text: string; night: Night }>();
  const nights = $derived.by((): Night[] => {
    if (first < 0) return [];
    const setting = `${timeZone}|${JSON.stringify(blocklists)}`;
    const next = new Map<string, { text: string; night: Night }>();
    const out = history.slice(first).map((d) => {
      const text = `${setting}|${JSON.stringify([d.day, d.sleep, d.verdict, d.earned, d.goal, d.goal_met, d.used, d.used_lists, d.reported])}`;
      const old = seenNights.get(d.day);
      const night = old && old.text === text ? old.night : {
        d,
        bed: d.sleep ? minutesOf(d.sleep.bedtime, true) : null,
        wake: d.sleep ? minutesOf(d.sleep.wake, false) : null,
        parts: lists(d),
      };
      next.set(d.day, { text, night });
      return night;
    });
    seenNights = next;
    return out;
  });
  const recent = $derived(nights.slice(-28).filter((n) => n.bed !== null));
  const usualBed = $derived(median(recent.map((n) => n.bed!)));
  const usualWake = $derived(median(recent.map((n) => n.wake!)));

  // The columns picked in Arrange mode, in a fixed order.
  const picked = $derived(arrangement.picked("sleep", "columns"));
  const COLS = ["verdict", "vouchers", "distraction"] as const;
  const cols = $derived(COLS.filter((c) => picked.includes(c)));
  const lists = (d: DayTotal) => minutesByList(d.used, d.used_lists, blocklists);
  const vMax = $derived(Math.max(1, ...nights.map((n) => Math.max(n.d.earned, n.d.goal ?? 0))));
  const dMax = $derived(Math.max(1, ...nights.map((n) => n.parts.reduce((a, p) => a + p.minutes, 0))));

  // Markers by Day, oldest first.
  $effect(() => { notes.load(); });
  const marksOn = $derived.by(() => {
    const have = new Set(nights.map((n) => n.d.day));
    const out = new Map<string, Marker[]>();
    for (const m of notes.markers) { const d = dayOfMoment(m.at); if (have.has(d)) out.set(d, [...(out.get(d) ?? []), m]); }
    return out;
  });
  const marks = $derived([...marksOn.values()].flat());
  const markLines = (day: string) => (marksOn.get(day) ?? []).map((m) => `\n${m.text}`).join("");

  // Drawn 600 wide, its text kept one size (see TrendCard); each night a 17px row.
  const W = 600;
  let width = $state(0);
  const k = $derived(W / (width || W));
  const ROW = $derived(17 * k);
  const H = $derived(nights.length * ROW);
  const flagRoom = $derived(marks.length ? Math.round(12 * k) : 0);
  const x0 = $derived(Math.max(40, Math.round((10 + 5.6 * Math.max(5, ...nights.map((n) => shortDate(n.d.day, today).length))) * k)) + flagRoom);
  /** The right-hand columns, each a width in screen px, laid out after the hours asleep. */
  const COL_W = { verdict: 14, vouchers: 34, distraction: 34 } as const;
  const COL_HEAD = { verdict: "Day", vouchers: "Earned", distraction: "Distr" } as const;
  const ASLEEP = 34, GAP = 7;
  const colX = $derived.by(() => {
    const out: Record<string, number> = {};
    let x = W - 2;
    for (const c of [...cols].reverse()) { x -= COL_W[c] * k; out[c] = x; x -= GAP * k; }
    out.asleep = x;
    return out;
  });
  const x1 = $derived(colX.asleep - ASLEEP * k - GAP * k);
  const xAt = (m: number) => x0 + ((Math.max(A, Math.min(B, m)) - A) / (B - A)) * (x1 - x0);
  /** Curfew's span on these hours, in minutes from midnight. */
  const night = $derived({ from: curfew.start * 60 - (curfew.start >= 12 ? 1440 : 0), to: curfew.end * 60 });

  const length = (m: number) => `${Math.floor(m / 60)}h${String(Math.round(m % 60)).padStart(2, "0")}`;
  const hhmm = (m: number) => { const t = ((Math.round(m) % 1440) + 1440) % 1440; return `${String(Math.floor(t / 60)).padStart(2, "0")}:${String(t % 60).padStart(2, "0")}`; };
  const VERDICT: Record<Verdict, { fill: string; word: string }> = { yes: { fill: "var(--heat-3)", word: "Yes" }, mostly: { fill: "var(--mostly)", word: "Mostly" }, no: { fill: "var(--worse)", word: "No" } };

  // Open at the newest nights; follow the shared Day to its row.
  let scroller = $state<HTMLDivElement>();
  const chosen = $derived(selection.day ?? today);
  const chosenRow = $derived(nights.findIndex((n) => n.d.day === chosen));
  /** The chosen row in the middle of the scroller (the newest at the bottom when it's today's). */
  function reveal(smooth: boolean) {
    if (!scroller) return;
    const row = chosenRow < 0 ? nights.length - 1 : chosenRow;
    scroller.scrollTo({ top: Math.max(0, (row + 0.5) * 17 - scroller.clientHeight / 2), behavior: smooth ? "smooth" : "instant" });
  }
  // At once whenever the rows change size (the card's width settles after it's drawn) ...
  $effect(() => { H; const f = requestAnimationFrame(() => reveal(false)); return () => cancelAnimationFrame(f); });
  // ... and smoothly when another card picks a Day (not on the first run,
  // whose smooth scroll would land where the rows were before they settled).
  let seen = selection.seq;
  $effect(() => {
    const seq = selection.seq;
    untrack(() => { if (seq !== seen && selection.from !== "sleep") reveal(true); seen = seq; });
  });
  const pick = (day: string) => selection.set("sleep", { day: day === today ? null : day, picked: true });

  /** The blocklists' colors the Distraction column draws, first three, for its key. */
  const listColors = $derived.by(() => {
    const seen = new Set<string>();
    for (const n of nights) for (const p of n.parts) seen.add(p.color);
    const drawn = [...seen];
    return (drawn.length ? drawn : Object.values(blocklists).filter((l) => l.on).map((l) => l.color)).slice(0, 3);
  });
  // Keys for the columns picked at the right, each named by its column's head
  // so the legend stays on one line at a one-third width. With all three on
  // there's no room for the Curfew answer's "Day: Yes ... No" scale, so it
  // shrinks to a key like the others: its three colors and "Day".
  const DAY_COLORS = [VERDICT.yes.fill, VERDICT.mostly.fill, VERDICT.no.fill];
  const compact = $derived(cols.length === 3);
  const colKeys = $derived<LegendItem[]>([
    ...(compact ? [{ kind: "split" as const, colors: DAY_COLORS, label: COL_HEAD.verdict }] : []),
    ...(cols.includes("vouchers") ? [{ kind: "goalbar" as const, label: COL_HEAD.vouchers }] : []),
    ...(cols.includes("distraction") ? [{ kind: "split" as const, colors: listColors, label: COL_HEAD.distraction }] : []),
  ]);
  const legend = $derived<LegendItem[]>([
    ...colKeys,
    { kind: "box", color: "var(--sleep)", label: "Tracked" },
    { kind: "outline", color: "var(--sleep)", label: "Estimated" },
    ...(Number.isNaN(usualBed) ? [] : [{ kind: "usual" as const, color: "var(--goal)", label: "Usual" }]),
    ...markerKeys(marks),
  ]);
</script>

<TrendCard title="Sleep" date={{ day: selection.day ?? today, today, oldest: nights[0]?.d.day, onpick: (d) => selection.set("sleep-step", { day: d === today ? null : d, picked: false }) }}>
  {#if !nights.length}
    <p class="empty">Nights show here once Health Connect, or your devices' last and first use, report one.</p>
  {:else}
    <div class="wrap" class:fit bind:clientWidth={width}>
      <!-- The usual times over their lines, and what each column at the right is, outside the scroller. -->
      <svg class="chart head" viewBox="0 0 {W} {14 * k}" style="--k: {k}" aria-hidden="true">
        {#if !Number.isNaN(usualBed)}
          <text class="tag usual" x={xAt(usualBed) - 4 * k} y={10 * k} text-anchor="end">{hhmm(usualBed)}</text>
          <text class="tag usual" x={xAt(usualWake) + 4 * k} y={10 * k}>{hhmm(usualWake)}</text>
        {/if}
        <text x={colX.asleep} y={10 * k} text-anchor="end">asleep</text>
        {#each cols as c (c)}<text x={colX[c] + (COL_W[c] * k) / 2} y={10 * k} text-anchor="middle">{COL_HEAD[c]}</text>{/each}
      </svg>
      <div class="rows" bind:this={scroller}>
        <svg class="chart" viewBox="0 0 {W} {H}" style="--k: {k}" role="img" aria-label="Each night's sleep, with the Day after it">
          <defs>
            <pattern id="{uid}-hatch" width={7 * k} height={7 * k} patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><rect width={3 * k} height={7 * k} fill="rgba(255, 255, 255, .09)" /></pattern>
          </defs>
          <rect x={xAt(night.from)} y="0" width={xAt(night.to) - xAt(night.from)} height={H} style="fill: var(--night-band)" />
          {#if !Number.isNaN(usualBed)}
            {#each [usualBed, usualWake] as u}<line x1={xAt(u)} x2={xAt(u)} y1="0" y2={H} stroke="var(--goal)" stroke-width={1.2 * k} stroke-dasharray="{3 * k} {3 * k}" />{/each}
          {/if}
          {#if chosenRow >= 0}<rect x="0" y={chosenRow * ROW} width={W} height={ROW} rx={4 * k} fill="#ffffff" opacity=".045" />{/if}
          {#each nights as n, r (n.d.day)}
            {@const y = r * ROW + ROW / 2}
            {@const s = n.d.sleep}
            {@const bh = ROW - 8 * k}
            {@const dm = n.d.day === chosen}
            <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
            <g class="row pressdim" onclick={() => pick(n.d.day)}>
              <rect x="0" y={r * ROW} width={W} height={ROW} fill="transparent" />
              <text x={x0 - 8 * k - flagRoom} y={y + 3 * k} text-anchor="end" class:chosen={dm}>{shortDate(n.d.day, today)}</text>
              {#if marksOn.has(n.d.day)}
                <g transform="translate({x0 - 4 * k - 10 * k} {y - 6 * k}) scale({k})">
                  <title>{(marksOn.get(n.d.day) ?? []).map((m) => m.text).join("\n")}</title>
                  <path d="M1.6 11.2V1" stroke="var(--marker)" stroke-width="1.6" stroke-linecap="round" />
                  <path d="M1.6 1h7l-2 2.75 2 2.75h-7z" fill="var(--marker)" />
                </g>
              {/if}
              <line x1={x0} x2={x1} y1={y} y2={y} stroke="var(--divider)" stroke-width={k} />
              {#if s && n.bed !== null && n.wake !== null}
                {@const a = xAt(n.bed)}
                {@const b = xAt(n.wake)}
                {#if s.source === "estimated"}
                  <rect x={a + 0.75 * k} y={y - bh / 2 + 0.75 * k} width={Math.max(0, b - a - 1.5 * k)} height={bh - 1.5 * k} rx={3 * k} fill="none" stroke="var(--sleep)" stroke-width={1.5 * k} stroke-dasharray="{3 * k} {2 * k}"><title>{shortDate(n.d.day, today)}: estimated {hhmm(n.bed)} to {hhmm(n.wake)}, {length(s.asleep)}{markLines(n.d.day)}</title></rect>
                {:else}
                  <rect x={a} y={y - bh / 2} width={Math.max(0, b - a)} height={bh} rx={3 * k} fill="var(--sleep)"><title>{shortDate(n.d.day, today)}: {hhmm(n.bed)} to {hhmm(n.wake)}, {length(s.asleep)} asleep{markLines(n.d.day)}</title></rect>
                {/if}
                <text x={colX.asleep} y={y + 3 * k} text-anchor="end" class:tracked={s.source !== "estimated"}>{length(s.asleep)}</text>
              {:else}
                <text x={colX.asleep} y={y + 3 * k} text-anchor="end">none</text>
              {/if}
              {#if cols.includes("verdict")}
                {@const v = n.d.verdict ? VERDICT[n.d.verdict] : null}
                {@const sq = Math.min(10 * k, bh + 2 * k)}
                <rect x={colX.verdict + (COL_W.verdict * k - sq) / 2} y={y - sq / 2} width={sq} height={sq} rx={3 * k} style="fill: {v?.fill ?? 'var(--heat-0)'}"><title>{shortDate(n.d.day, today)}: {v ? v.word : "no answer"}</title></rect>
              {/if}
              {#if cols.includes("vouchers")}
                {@const w = COL_W.vouchers * k}
                {@const goal = n.d.goal ?? 0}
                <rect x={colX.vouchers} y={y - bh / 2} width={w} height={bh} rx={2 * k} style="fill: var(--heat-0)" />
                <rect x={colX.vouchers} y={y - bh / 2} width={(n.d.earned / vMax) * w} height={bh} rx={2 * k} fill="var(--voucher)"><title>{shortDate(n.d.day, today)}: {n.d.earned} Vouchers{goal ? `, goal ${goal}${n.d.goal_met ? " met" : ""}` : ""}</title></rect>
                {#if goal}<rect x={colX.vouchers + (goal / vMax) * w - 0.75 * k} y={y - bh / 2 - 1.5 * k} width={1.5 * k} height={bh + 3 * k} fill="var(--goal)" />{/if}
              {/if}
              {#if cols.includes("distraction")}
                {@const w = COL_W.distraction * k}
                {@const parts = n.parts}
                <rect x={colX.distraction} y={y - bh / 2} width={w} height={bh} rx={2 * k} style="fill: {measured(n.d) ? 'var(--heat-0)' : `url(#${uid}-hatch)`}"><title>{shortDate(n.d.day, today)}: {measured(n.d) ? `${parts.reduce((a, p) => a + p.minutes, 0)} min in Distractions` : "Distraction not measured"}</title></rect>
                {#each parts as p, i (p.id)}
                  {@const before = parts.slice(0, i).reduce((a, q) => a + q.minutes, 0)}
                  <rect x={colX.distraction + (before / dMax) * w} y={y - bh / 2} width={(p.minutes / dMax) * w} height={bh} fill={p.color}><title>{shortDate(n.d.day, today)}: {p.minutes} min {p.name}</title></rect>
                {/each}
              {/if}
            </g>
          {/each}
        </svg>
      </div>
      <!-- Every other hour, Curfew's in the night colour, as HourAxis draws them. -->
      <svg class="chart axis" viewBox="0 0 {W} {16 * k}" style="--k: {k}" aria-hidden="true">
        {#each [20, 22, 24, 26, 28, 30, 32, 34, 36] as h (h)}
          {@const m = (h - 24) * 60}
          <text x={xAt(m)} y={12 * k} text-anchor="middle" class:night={m >= night.from && m < night.to}>{String(h % 24).padStart(2, "0")}</text>
        {/each}
      </svg>
    </div>
    <Legend items={legend} scale={cols.includes("verdict") && !compact ? { from: "Day: Yes", colors: DAY_COLORS, to: "No" } : undefined} />
  {/if}
</TrendCard>

<style>
  .wrap { display: flex; flex-direction: column; gap: 2px; }
  /* About ten nights in view on a phone; in a tablet slot, whatever height is left. */
  .rows { max-height: 170px; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .rows::-webkit-scrollbar { display: none; }
  .wrap.fit { flex: 1; min-height: 0; }
  .wrap.fit .rows { flex: 1; min-height: 0; max-height: none; }
  .head, .axis { flex: none; }
  .row { cursor: pointer; transition: var(--press); }
  /* Two classes deep, to outrank TrendCard's axis-ink for chart text. */
  svg.chart text.tag { paint-order: stroke; stroke: var(--surface); stroke-width: calc(3px * var(--k, 1)); stroke-linejoin: round; }
  svg.chart text.usual { fill: var(--goal); font-weight: 700; }
  svg.chart text.tracked { fill: var(--muted); }
  svg.chart text.chosen { fill: var(--ink); font-weight: 700; }
  svg.chart text.night { fill: var(--night); }
</style>
