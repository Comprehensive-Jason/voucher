<script lang="ts">
  // How did a week or a month go, told in a few numbers at once: what you
  // earned (against the period before), your top source, your goal Days, your
  // Distraction time, your best Day, and a question drawn from the slowest
  // weekday. It replays the week or month holding the Day picked on any card
  // (the current one "so far" until it ends), and its Week/Month switch moves
  // with the others'. For a finished week or month it first asks you to
  // guess your goal Days, then shows the numbers: over time the guesses show
  // how well you judge your own capacity, which makes planning cheaper.
  import { untrack } from "svelte";
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured, notes } from "../../notes.svelte";
  import ZoomSwitch from "../../components/ZoomSwitch.svelte";
  import { styleOf } from "../../sources";
  import { MONTHS, goalRuns, mondayOf } from "../../trends";
  import { zoomFade } from "../../motion";
  import { selection } from "../../selection.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  type Span = "week" | "month";
  let span = $state<Span>("week");
  // Follows the shared Week or Month (Day leaves it as it is).
  $effect(() => {
    selection.seq;
    untrack(() => { if (selection.from !== "replay" && selection.span !== "day") span = selection.span; });
  });
  function pick(next: Span) { span = next; selection.set("replay", { span: next, picked: false }); }

  const today = $derived(history.at(-1)?.day ?? "");
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const monthStart = (d: string, back = 0) => { const [y, m] = d.split("-").map(Number); return new Date(Date.UTC(y, m - 1 - back, 1, 12)).toISOString().slice(0, 10); };

  /** The week or month holding the shared Day, and the one before it. */
  const period = $derived.by(() => {
    const day = selection.day ?? today;
    if (!day) return null;
    if (span === "week") {
      const start = mondayOf(day), end = shift(start, 6);
      return { label: end >= today ? "this week so far" : `the week of ${start}`, start, end, prevStart: shift(start, -7), prevEnd: shift(start, -1) };
    }
    const start = monthStart(day), end = shift(monthStart(day, -1), -1);
    const name = MONTHS[Number(start.slice(5, 7)) - 1];
    return { label: end >= today ? `${name} so far` : name, start, end, prevStart: monthStart(day, 1), prevEnd: shift(start, -1) };
  });
  const inRange = (a: string, b: string) => history.filter((d) => d.day >= a && d.day <= b);
  const days = $derived(period ? inRange(period.start, period.end) : []);
  const prev = $derived(period ? inRange(period.prevStart, period.prevEnd) : []);
  const sum = (list: DayTotal[], f: (d: DayTotal) => number) => list.reduce((n, d) => n + f(d), 0);

  // ---- Guess, then see ----
  $effect(() => { notes.load(); });
  const key = $derived(period ? (span === "week" ? `week ${period.start}` : `month ${period.start.slice(0, 7)}`) : "");
  const finished = $derived(!!period && period.end < today);
  const goalDaysIn = (k: string) => {
    const [kind, start] = k.split(" ");
    const end = kind === "week" ? shift(start, 6) : shift(monthStart(`${start}-15`, -1), -1);
    const from = kind === "week" ? start : `${start}-01`;
    const inside = history.filter((d) => d.day >= from && d.day <= end);
    return inside.length ? inside.filter((d) => d.goal_met).length : null;
  };
  const guessed = $derived(key ? notes.guesses[key] : undefined);
  const asking = $derived(finished && guessed === undefined && days.length > 0);
  let draft = $state(3);
  $effect(() => { key; draft = Math.round(days.length / 2); });
  /** How far off past guesses were, on average. */
  const calibration = $derived.by(() => {
    const misses = Object.entries(notes.guesses).flatMap(([k, g]) => { const real = goalDaysIn(k); return real === null ? [] : [Math.abs(real - g)]; });
    return misses.length >= 2 ? { off: misses.reduce((a, b) => a + b, 0) / misses.length, n: misses.length } : null;
  });

  type Card = { big: string; line: string; tone?: "goal" | "spend"; wide?: boolean };
  const cards = $derived.by((): Card[] => {
    if (!period || !days.length) return [];
    const earned = sum(days, (d) => d.earned), before = sum(prev, (d) => d.earned);
    const out: Card[] = [{ big: String(earned), line: `Vouchers earned${before ? `, ${earned >= before ? "up" : "down"} from ${before} the ${span} before` : ""}` }];
    const bySource = new Map<string, number>();
    for (const d of days) for (const [id, n] of Object.entries(d.by_source ?? {})) bySource.set(id, (bySource.get(id) ?? 0) + n);
    const top = [...bySource.entries()].sort((a, b) => b[1] - a[1])[0];
    if (top && earned) out.push({ big: styleOf(top[0]).name, line: `Top source: ${top[1]} Vouchers, ${Math.round((top[1] / earned) * 100)}%` });
    const goalDays = days.filter((d) => d.goal_met).length;
    const longest = Math.max(0, ...goalRuns(days).map((r) => r.length));
    const guess = guessed !== undefined ? `; you guessed ${guessed}` : "";
    out.push({ big: `${goalDays} of ${days.length}`, line: `Goal Days${longest > 1 ? `, a streak of ${longest}` : ""}${guess}`, tone: "goal" });
    // Days no device reported are left out, not counted as none.
    const kept = days.filter(measured);
    const used = sum(kept, (d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0));
    const unlocked = sum(days, (d) => d.unlocked_minutes ?? 0);
    const gap = days.length - kept.length;
    if (used || unlocked) out.push({ big: kept.length ? `${used} min` : "Unknown", line: `In Distractions, of ${unlocked} min unlocked${gap ? `; ${gap} ${gap === 1 ? "Day" : "Days"} not measured` : ""}`, tone: "spend" });
    const best = days.reduce((a, b) => (b.earned > a.earned ? b : a));
    out.push({ big: String(best.earned), line: `Best Day, ${best.day}` });
    // The question: the weekday that earned least on average (a month has every weekday more than once).
    if (span === "month") {
      const weekdays = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
      const per = weekdays.map((_, i) => days.filter((d) => (new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7 === i));
      const avg = per.map((l) => (l.length ? sum(l, (d) => d.earned) / l.length : Infinity));
      const slow = avg.indexOf(Math.min(...avg));
      if (Number.isFinite(avg[slow])) out.push({ big: weekdays[slow], line: `were slowest, about ${avg[slow].toFixed(1)} a Day. What gets in the way?`, wide: true });
    }
    return out;
  });
</script>

<TrendCard title="Replay">
  {#snippet tools()}
    <ZoomSwitch options={[{ id: "week", label: "Week" }, { id: "month", label: "Month" }]} value={span} onchange={(v) => pick(v as Span)} />
  {/snippet}
  {#if !cards.length}
    <p class="empty">Nothing in this {span} yet.</p>
  {:else}
    {#key `${span}${period?.start}`}
    <div class="stage" class:fit in:zoomFade={{ out: span === "month" }}>
      <span class="cap when">{period?.label}</span>
      {#if asking}
        <div class="guess">
          <p>Before you look: how many goal Days do you think {span === "week" ? "that week" : "that month"} had?</p>
          <div class="pick">
            <button aria-label="Fewer" disabled={draft <= 0} onclick={() => (draft = Math.max(0, draft - 1))}>−</button>
            <b class="mono">{draft}</b>
            <button aria-label="More" disabled={draft >= days.length} onclick={() => (draft = Math.min(days.length, draft + 1))}>+</button>
            <span class="of">of {days.length}</span>
          </div>
          <button class="see" onclick={() => notes.guess(key, draft)}>Show me</button>
        </div>
      {:else}
      <div class="grid">
        {#each cards as c, i (i)}
          <div class="tile" class:wide={c.wide}>
            <b class:goal={c.tone === "goal"} class:spend={c.tone === "spend"}>{c.big}</b>
            <span>{c.line}</span>
          </div>
        {/each}
      </div>
      {#if calibration}<p class="calib">Your guesses are off by <b>{calibration.off.toFixed(1).replace(/\.0$/, "")}</b> goal Days on average, over {calibration.n}.</p>{/if}
      {/if}
    </div>
    {/key}
  {/if}
</TrendCard>

<style>
  .stage { display: flex; flex-direction: column; gap: 8px; }
  .stage.fit { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .when { color: var(--muted); }
  /* Every number at once, two to a row. */
  .grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
  .tile { display: flex; flex-direction: column; gap: 4px; padding: 12px 14px; border-radius: 12px; background: #1f2226; min-width: 0; }
  .tile.wide { grid-column: span 2; }
  .tile b { font: 700 24px/1.1 var(--font); color: var(--voucher); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .tile b.goal { color: var(--goal); }
  .tile b.spend { color: var(--spend); }
  .tile span { font-size: 12.5px; line-height: 1.4; color: var(--muted); }
  .guess { display: flex; flex-direction: column; gap: 12px; padding: 16px; border-radius: 12px; background: #1f2226; }
  .guess p { margin: 0; font-size: 14px; line-height: 1.4; color: var(--ink); }
  .pick { display: flex; align-items: center; gap: 12px; }
  .pick button { width: 40px; height: 40px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 20px var(--font); cursor: pointer; transition: scale var(--t-quick) var(--ease-out), opacity var(--t-base); }
  .pick button:active { scale: .9; }
  .pick button:disabled { opacity: .35; }
  .pick b { min-width: 28px; text-align: center; font-size: 26px; color: var(--goal); }
  .pick .of { color: var(--muted); font-size: 13px; }
  .see { align-self: flex-start; height: 38px; padding: 0 16px; border-radius: 12px; border: 0; background: var(--goal); color: #0e0f11; font: 700 14px var(--font); cursor: pointer; }
  .calib { margin: 2px 0 0; font-size: 12.5px; color: var(--muted); }
  .calib b { color: var(--ink); font-family: var(--mono); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
