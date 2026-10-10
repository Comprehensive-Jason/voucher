<script lang="ts">
  // How did last week, or last month, go, told as a short story? A few cards
  // with one big number each (what you earned, your top source, your goal
  // Days, your Distraction time, your best Day), ending on a question drawn
  // from the period's slowest weekday. Swipe through, or use the arrows.
  import TrendCard from "../../components/TrendCard.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { styleOf } from "../../sources";
  import { MONTHS, goalRuns, mondayOf } from "../../trends";
  import { zoomFade } from "../../motion";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  type Span = "week" | "month";
  let span = $state<Span>("month");
  const today = $derived(history.at(-1)?.day ?? "");
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

  /** The last finished week (Monday to Sunday) or calendar month, and the one before it. */
  const period = $derived.by(() => {
    if (!today) return null;
    if (span === "week") {
      const start = shift(mondayOf(today), -7);
      return { label: `the week of ${start}`, start, end: shift(start, 6), prevStart: shift(start, -7), prevEnd: shift(start, -1) };
    }
    const [y, m] = today.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 2, 1)).toISOString().slice(0, 10);
    const last = shift(`${today.slice(0, 7)}-01`, -1);
    const prevFirst = new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10);
    return { label: MONTHS[Number(first.slice(5, 7)) - 1], start: first, end: last, prevStart: prevFirst, prevEnd: shift(first, -1) };
  });
  const inRange = (a: string, b: string) => history.filter((d) => d.day >= a && d.day <= b);
  const days = $derived(period ? inRange(period.start, period.end) : []);
  const prev = $derived(period ? inRange(period.prevStart, period.prevEnd) : []);
  const sum = (list: DayTotal[], f: (d: DayTotal) => number) => list.reduce((n, d) => n + f(d), 0);

  type Card = { big: string; line: string; tone?: "goal" | "spend" };
  const cards = $derived.by((): Card[] => {
    if (!period || !days.length) return [];
    const earned = sum(days, (d) => d.earned), before = sum(prev, (d) => d.earned);
    const out: Card[] = [{ big: String(earned), line: `Vouchers earned in ${period.label}${before ? `, ${earned >= before ? "up" : "down"} from ${before} the ${span} before` : ""}.` }];
    const bySource = new Map<string, number>();
    for (const d of days) for (const [id, n] of Object.entries(d.by_source ?? {})) bySource.set(id, (bySource.get(id) ?? 0) + n);
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && earned) out.push({ big: styleOf(top[0]).name, line: `Your top source: ${top[1]} Vouchers, ${Math.round((top[1] / earned) * 100)}% of the ${span}.` });
    const goalDays = days.filter((d) => d.goal_met).length;
    const longest = Math.max(0, ...goalRuns(days).map((r) => r.length));
    out.push({ big: `${goalDays} of ${days.length}`, line: `Days that met the goal${longest > 1 ? `, with a streak of ${longest}` : ""}.`, tone: "goal" });
    const used = sum(days, (d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0));
    const unlocked = sum(days, (d) => d.unlocked_minutes ?? 0);
    if (used || unlocked) out.push({ big: `${used} min`, line: `In Distractions, against ${unlocked} min unlocked.`, tone: "spend" });
    const best = days.reduce((a, b) => (b.earned > a.earned ? b : a));
    out.push({ big: String(best.earned), line: `Your best Day, ${best.day}.` });
    // The question: the weekday that earned least on average.
    const weekdays = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
    const per = weekdays.map((_, i) => days.filter((d) => (new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7 === i));
    const avg = per.map((l) => (l.length ? sum(l, (d) => d.earned) / l.length : Infinity));
    const slow = avg.indexOf(Math.min(...avg));
    if (Number.isFinite(avg[slow])) out.push({ big: weekdays[slow], line: `were your slowest, about ${avg[slow].toFixed(1)} a Day. What gets in the way on ${weekdays[slow]}?` });
    return out;
  });

  let reel = $state<HTMLDivElement>();
  let at = $state(0);
  function go(i: number) { reel?.scrollTo({ left: i * reel.clientWidth, behavior: "smooth" }); }
  function onScroll() { if (reel) at = Math.round(reel.scrollLeft / reel.clientWidth); }
  $effect(() => { span; at = 0; reel?.scrollTo({ left: 0 }); });
</script>

<TrendCard title="Replay">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "week", label: "Last week" }, { id: "month", label: "Last month" }]} value={span} onchange={(v) => (span = v as Span)} />
  {/snippet}
  {#if !cards.length}
    <p class="empty">A finished {span} of history makes the first replay.</p>
  {:else}
    {#key span}
    <div class="stage" in:zoomFade={{ out: span === "month" }}>
      <div class="reel" bind:this={reel} onscroll={onScroll}>
        {#each cards as c, i (i)}
          <div class="slide">
            <b class:goal={c.tone === "goal"} class:spend={c.tone === "spend"}>{c.big}</b>
            <p>{c.line}</p>
          </div>
        {/each}
      </div>
      <div class="nav">
        <button aria-label="Back" disabled={at === 0} onclick={() => go(at - 1)}>‹</button>
        <div class="dots">{#each cards as _, i}<i class:on={i === at}></i>{/each}</div>
        <button aria-label="Next" disabled={at >= cards.length - 1} onclick={() => go(at + 1)}>›</button>
      </div>
    </div>
    {/key}
  {/if}
</TrendCard>

<style>
  .stage { flex: 1; min-height: 160px; display: flex; flex-direction: column; gap: 10px; }
  /* One card per width; past the last one, a swipe moves the tablet's strip. */
  .reel { flex: 1; display: flex; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none; border-radius: 14px; background: #1f2226; }
  .reel::-webkit-scrollbar { display: none; }
  .slide { flex: 0 0 100%; scroll-snap-align: start; display: flex; flex-direction: column; justify-content: center; gap: 10px; padding: 18px 22px; box-sizing: border-box; }
  .slide b { font: 700 clamp(28px, 9cqw, 52px)/1.05 var(--font); color: var(--voucher); }
  .slide b.goal { color: var(--goal); }
  .slide b.spend { color: var(--spend); }
  .slide p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--ink); }
  .nav { display: flex; align-items: center; justify-content: space-between; }
  .nav button { width: 36px; height: 32px; border-radius: 10px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 700 18px var(--font); cursor: pointer; }
  .nav button:disabled { opacity: .3; cursor: default; }
  .dots { display: flex; gap: 6px; }
  .dots i { width: 7px; height: 7px; border-radius: 50%; background: var(--line); transition: background-color var(--t-base); }
  .dots i.on { background: var(--ink); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
