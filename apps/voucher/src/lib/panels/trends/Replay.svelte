<script lang="ts">
  // How did a week, month, or year go, in six averages (never totals):
  // Vouchers a Day, the top source's share, how often the goal was met;
  // Distraction a Day, the busiest hour, and how often a Day went well (the
  // Curfew question). It replays the period holding the Day picked on any
  // card, and its Week/Month switch moves with the others'. Today counts only
  // once it's the period's only Day, since it's still going.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "../../notes.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { styleOf } from "../../sources";
  import { mondayOf } from "../../trends";
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

  /** The week, month, or year holding the shared Day. */
  const period = $derived.by(() => {
    const day = selection.day ?? today;
    if (!day) return null;
    if (span === "week") {
      const start = mondayOf(day);
      return { start, end: shift(start, 6) };
    }
    if (span === "year") {
      const y = Number(day.slice(0, 4));
      return { start: `${y}-01-01`, end: `${y}-12-31` };
    }
    const start = monthStart(day);
    return { start, end: shift(monthStart(day, -1), -1) };
  });
  const inRange = (a: string, b: string) => history.filter((d) => d.day >= a && d.day <= b);
  const days = $derived(period ? inRange(period.start, period.end) : []);
  const sum = (list: DayTotal[], f: (d: DayTotal) => number) => list.reduce((n, d) => n + f(d), 0);

  type Card = { big: string; line: string; tone?: "goal" | "spend" };
  /** The Days to average over: today counts only once it's the period's only Day, since it's still going. */
  const settled = $derived(days.length > 1 ? days.filter((d) => d.day !== today) : days);
  const perDay = (list: DayTotal[], f: (d: DayTotal) => number) => (list.length ? sum(list, f) / list.length : null);
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  /** Six averages, never totals: Vouchers a Day, the top source's share, the goal rate; Distraction a Day, the busiest hour, the good-Day rate. Each says what it is in a few words. */
  const cards = $derived.by((): Card[] => {
    if (!period || !settled.length) return [];
    const rate = perDay(settled, (d) => d.earned)!;
    const bySource = new Map<string, number>();
    for (const d of settled) for (const [id, n] of Object.entries(d.by_source ?? {})) bySource.set(id, (bySource.get(id) ?? 0) + n);
    const total = [...bySource.values()].reduce((a, b) => a + b, 0);
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    const met = settled.filter((d) => d.goal_met).length;
    // Days no device reported are left out, not counted as none.
    const used = perDay(settled.filter(measured), (d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0));
    const byHour = Array<number>(24).fill(0);
    for (const d of settled) (d.hours ?? []).forEach((n, h) => (byHour[h] += n));
    const busiest = byHour.some((n) => n) ? byHour.indexOf(Math.max(...byHour)) : null;
    const answered = settled.filter((d) => d.verdict);
    const good = answered.filter((d) => d.verdict !== "no").length;
    return [
      { big: one(rate), line: "Vouchers a Day" },
      { big: top && total ? styleOf(top[0]).name : "–", line: top && total ? `${Math.round((top[1] / total) * 100)}% of Vouchers` : "Top source" },
      { big: `${Math.round((met / settled.length) * 100)}%`, line: "Days met the goal", tone: "goal" },
      { big: used === null ? "–" : `${Math.round(used)} min`, line: "Distracted a Day", tone: "spend" },
      { big: busiest === null ? "–" : `${String(busiest).padStart(2, "0")}:00`, line: "Busiest hour" },
      { big: answered.length ? `${Math.round((good / answered.length) * 100)}%` : "–", line: "Days went well" },
    ];
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
  /* One short line under the number, never wrapping into it. */
  .tile span { font-size: 12px; line-height: 1.3; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
