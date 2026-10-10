<script lang="ts">
  // How did a week, month, or year go, as averages (never totals): Vouchers
  // a Day (against the period before), the top source's share, how often
  // the goal was met, Distraction a Day, the best Day, and over a year the
  // best month. It replays the period holding the Day picked on any card,
  // and its Week/Month switch moves with the others'. Today counts only once
  // it's the period's only Day, since it's still going.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "../../notes.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { styleOf } from "../../sources";
  import { MONTHS, goalRuns, mondayOf } from "../../trends";
  import { zoomFade } from "../../motion";
  import { selection } from "../../selection.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  type Span = "week" | "month" | "year";
  let span = $state<Span>("week");
  // Follows the shared Week or Month (Day leaves it as it is). Year is this
  // card's own: no other card shows a year, so it isn't shared.
  $effect(() => {
    selection.seq;
    untrack(() => { if (selection.from !== "replay" && selection.span !== "day") span = selection.span; });
  });
  function pick(next: Span) { span = next; if (next !== "year") selection.set("replay", { span: next, picked: false }); }

  const today = $derived(history.at(-1)?.day ?? "");
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const monthStart = (d: string, back = 0) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1 - back, 1, 12)).toISOString().slice(0, 10); };

  /** The week, month, or year holding the shared Day, and the one before it. */
  const period = $derived.by(() => {
    const day = selection.day ?? today;
    if (!day) return null;
    if (span === "week") {
      const start = mondayOf(day);
      return { start, end: shift(start, 6), prevStart: shift(start, -7), prevEnd: shift(start, -1) };
    }
    if (span === "year") {
      const y = Number(day.slice(0, 4));
      return { start: `${y}-01-01`, end: `${y}-12-31`, prevStart: `${y - 1}-01-01`, prevEnd: `${y - 1}-12-31` };
    }
    const start = monthStart(day);
    return { start, end: shift(monthStart(day, -1), -1), prevStart: monthStart(day, 1), prevEnd: shift(start, -1) };
  });
  const inRange = (a: string, b: string) => history.filter((d) => d.day >= a && d.day <= b);
  const days = $derived(period ? inRange(period.start, period.end) : []);
  const prev = $derived(period ? inRange(period.prevStart, period.prevEnd) : []);
  const sum = (list: DayTotal[], f: (d: DayTotal) => number) => list.reduce((n, d) => n + f(d), 0);

  type Card = { big: string; line: string; tone?: "goal" | "spend" };
  /** The Days to average over: today counts only once it's the period's only Day, since it's still going. */
  const settled = $derived(days.length > 1 ? days.filter((d) => d.day !== today) : days);
  const perDay = (list: DayTotal[], f: (d: DayTotal) => number) => (list.length ? sum(list, f) / list.length : null);
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  /** Averages only, never totals: Vouchers a Day, the top source's share, the goal rate, Distraction a Day, the best Day, and over a year the best month. */
  const cards = $derived.by((): Card[] => {
    if (!period || !settled.length) return [];
    const out: Card[] = [];
    const rate = perDay(settled, (d) => d.earned)!, before = perDay(prev, (d) => d.earned);
    const span_ = span === "week" ? "week" : span === "month" ? "month" : "year";
    out.push({ big: one(rate), line: `Vouchers a Day${before !== null ? `, ${rate >= before ? "up" : "down"} from ${one(before)} the ${span_} before` : ""}` });
    const bySource = new Map<string, number>();
    for (const d of settled) for (const [id, n] of Object.entries(d.by_source ?? {})) bySource.set(id, (bySource.get(id) ?? 0) + n);
    const total = [...bySource.values()].reduce((a, b) => a + b, 0);
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && total) out.push({ big: styleOf(top[0]).name, line: `Top source: ${Math.round((top[1] / total) * 100)}% of Vouchers, about ${one(top[1] / settled.length)} a Day` });
    const met = settled.filter((d) => d.goal_met).length;
    const longest = Math.max(0, ...goalRuns(settled).map((r) => r.length));
    out.push({ big: `${Math.round((met / settled.length) * 100)}%`, line: `of Days met the goal${longest > 1 ? `; longest streak ${longest} Days` : ""}`, tone: "goal" });
    // Days no device reported are left out, not counted as none.
    const kept = settled.filter(measured);
    const used = perDay(kept, (d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0));
    const unlocked = perDay(settled, (d) => d.unlocked_minutes ?? 0)!;
    out.push({ big: used === null ? "Unknown" : `${Math.round(used)} min`, line: `In Distractions a Day, of ${Math.round(unlocked)} min unlocked${kept.length < settled.length ? `; ${settled.length - kept.length} not measured` : ""}`, tone: "spend" });
    const best = settled.reduce((a, b) => (b.earned > a.earned ? b : a));
    out.push({ big: String(best.earned), line: `Best Day, ${best.day.slice(5)}` });
    if (span === "year") {
      const months = new Map<string, DayTotal[]>();
      for (const d of settled) months.set(d.day.slice(0, 7), [...(months.get(d.day.slice(0, 7)) ?? []), d]);
      const topMonth = [...months.entries()].map(([m, l]) => [m, sum(l, (d) => d.earned) / l.length] as const).sort((a, b) => b[1] - a[1])[0];
      if (topMonth) out.push({ big: MONTHS[Number(topMonth[0].slice(5, 7)) - 1], line: `Best month, ${one(topMonth[1])} Vouchers a Day` });
    }
    return out;
  });
</script>

<TrendCard title="Replay" date={{ day: selection.day ?? today, today, oldest: history[0]?.day, unit: span, onpick: (d) => selection.set("replay", { day: d === today ? null : d, picked: false }) }}>
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "year", label: "Year" }]} value={span} onchange={(v) => pick(v as Span)} />
  {/snippet}
  {#if !cards.length}
    <p class="empty">Nothing in this {span} yet.</p>
  {:else}
    {#key `${span}${period?.start}`}
    <div class="stage" class:fit in:zoomFade={{ out: span === "month" }}>
      <div class="grid">
        {#each cards as c, i (i)}
          <div class="tile">
            <b class:goal={c.tone === "goal"} class:spend={c.tone === "spend"}>{c.big}</b>
            <span>{c.line}</span>
          </div>
        {/each}
      </div>
    </div>
    {/key}
  {/if}
</TrendCard>

<style>
  .stage { display: flex; flex-direction: column; gap: 8px; }
  /* In a tablet slot the boxes fill the card, without scrolling. */
  .stage.fit { flex: 1; min-height: 0; }
  /* Three to a row, two rows, every box the same size (theme.css .stats look). */
  .grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); grid-auto-rows: 1fr; gap: 8px; }
  .stage.fit .grid { flex: 1; min-height: 0; grid-template-rows: repeat(2, minmax(0, 1fr)); }
  .tile { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 10px 12px; border-radius: 10px; background: #1f2226; min-width: 0; min-height: 0; overflow: hidden; }
  .tile b { font: 700 22px/1.1 var(--font); color: var(--voucher); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile b.goal { color: var(--goal); }
  .tile b.spend { color: var(--spend); }
  .tile span { font-size: 12px; line-height: 1.35; color: var(--muted); }
</style>
