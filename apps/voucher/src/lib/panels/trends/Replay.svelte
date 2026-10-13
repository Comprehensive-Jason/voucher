<script lang="ts">
  // How did a week, month, or year go, in eight averages (never totals), in
  // three rows. First the headline: Vouchers a Day and how often the goal was
  // met. Then how the Vouchers came: the top source and its share, the
  // busiest hour, and Distracted per Day against them. Then the Day around
  // them: how often a Day went well (the Curfew question), time asleep a
  // night, and calendar events a Day. Each number is in its meaning's
  // color, as text on the box (at least 4.5:1); Distracted per Day stays
  // ink, since each blocklist has its own color. It replays the period
  // holding the Day picked on any card, and its Week/Month switch moves with
  // the others'. Today counts only once it's the period's only Day, since
  // it's still going.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "$core/notes.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { styleOf } from "$core/sources";
  import { mondayOf } from "$core/trends";
  import { zoomFade } from "$core/motion";
  import { selection } from "$core/selection.svelte";
  import { fitsSlot } from "$core/fit.svelte";
  import type { DayTotal } from "$core/types";

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

  /** A box's number, what it is, and its meaning's color (ink when none). */
  type Card = { big: string; line: string; color?: string };

  /** WCAG contrast of two "#rrggbb" colors. */
  const lum = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
    .reduce((t, c, i) => t + c * [0.2126, 0.7152, 0.0722][i], 0);
  const contrast = (a: string, b: string) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  /** A source's color as text on a box: as chosen, or (a deep swatch)
   *  mixed toward ink until it reads at 4.5:1 on --raised. */
  function readable(color: string): string {
    const css = typeof document === "undefined" ? null : getComputedStyle(document.documentElement);
    const box = css?.getPropertyValue("--raised").trim() || "#1f2226", ink = css?.getPropertyValue("--ink").trim() || "#f2f2f0";
    const hex = /^#[0-9a-f]{6}$/i;
    if (!hex.test(color) || !hex.test(box) || !hex.test(ink)) return color;
    for (let k = 0; k <= 100; k += 5) {
      const mixed = "#" + [1, 3, 5].map((i) => Math.round(parseInt(color.slice(i, i + 2), 16) * (1 - k / 100) + parseInt(ink.slice(i, i + 2), 16) * (k / 100)).toString(16).padStart(2, "0")).join("");
      if (contrast(mixed, box) >= 4.5) return mixed;
    }
    return ink;
  }
  /** The Days to average over: today counts only once it's the period's only Day, since it's still going. */
  const settled = $derived(days.length > 1 ? days.filter((d) => d.day !== today) : days);
  const perDay = (list: DayTotal[], f: (d: DayTotal) => number) => (list.length ? sum(list, f) / list.length : null);
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
  /** Eight averages, never totals, in rows of 2, 3, and 3: Vouchers a Day and the goal rate; the top source's share, the busiest hour, and Distracted per Day; the good-Day rate, asleep a night, and events a Day. Each says what it is in a few words. Nights and calendars not recorded are left out, not counted as none. */
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
    const asleep = perDay(settled.filter((d) => d.sleep), (d) => d.sleep!.asleep);
    const events = perDay(settled.filter((d) => d.calendar), (d) => d.calendar!.events);
    const source = top && total ? styleOf(top[0]) : null;
    return [
      { big: one(rate), line: "Vouchers a Day", color: "var(--voucher)" },
      { big: `${Math.round((met / settled.length) * 100)}%`, line: "Days met the goal", color: "var(--goal)" },
      // The short name ("Reader", not "Readwise Reader"), so it fits a third of the card.
      { big: source ? source.short : "–", line: source ? `${Math.round((top![1] / total) * 100)}% of Vouchers` : "Top source", color: source ? readable(source.color) : undefined },
      // The hour the most Vouchers came in: green, as the hour grids draw earning.
      { big: busiest === null ? "–" : `${String(busiest).padStart(2, "0")}:00`, line: "Busiest hour", color: busiest === null ? undefined : "var(--voucher)" },
      { big: used === null ? "–" : `${Math.round(used)} min`, line: "Distracted per Day" },
      // Yes and Mostly both count, so the Yes green.
      { big: answered.length ? `${Math.round((good / answered.length) * 100)}%` : "–", line: "Days went well", color: answered.length ? "var(--voucher)" : undefined },
      { big: asleep === null ? "–" : `${Math.floor(asleep / 60)}h${String(Math.round(asleep % 60)).padStart(2, "0")}`, line: "Asleep a night", color: asleep === null ? undefined : "var(--sleep-text)" },
      { big: events === null ? "–" : one(events), line: "Events a Day", color: events === null ? undefined : "var(--calendar-text)" },
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
      <div class="stats eight">
        {#each cards as c, i (i)}
          <div><b style:color={c.color}>{c.big}</b><span>{c.line}</span></div>
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
  /* The shared stat boxes (theme.css .stats) in rows of 2, 3, and 3: the
     first two each half the row, the rest a third, so every box in a row is
     the same size. */
  .eight { grid-auto-flow: row; grid-template-columns: repeat(6, minmax(0, 1fr)); grid-auto-rows: 1fr; }
  .eight > div { grid-column: span 2; }
  .eight > div:nth-child(-n + 2) { grid-column: span 3; }
  /* The numbers keep the stat boxes' 18px wherever a third of the card
     fits "Obsidian" or "1000 min" (a tablet slot), and shrink with the card
     on a phone, to 14px at the narrowest, rather than clip. */
  .eight b { font-size: clamp(14px, 4.8cqi, 18px); }
  /* In a tablet slot the boxes share the card's height, numbers centred at
     the stat boxes' own 18px. */
  .stage.fit .eight { flex: 1; min-height: 0; grid-template-rows: repeat(3, minmax(0, 1fr)); }
  /* Little padding above and below, so a phone's third still fits a number and its line. */
  .stage.fit .eight > div { justify-content: center; min-height: 0; overflow: hidden; padding-block: 4px; }
</style>
