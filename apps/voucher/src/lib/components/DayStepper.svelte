<script lang="ts">
  // ‹ Today › in a card's header: steps one Day (or one week, or one month,
  // for cards that show those) back or forward, with a way back to today once
  // it has moved. The card shares the Day it moves to, so every card that
  // follows the shared Day moves with it.
  import TodayButton from "./TodayButton.svelte";
  import { dayLabel, shiftDay } from "../time";
  import { MONTHS, mondayOf } from "../trends";

  type Unit = "day" | "week" | "month";
  let { day, today, oldest, unit = "day", short = false, onpick }: { day: string; today: string; oldest?: string; unit?: Unit; short?: boolean; onpick: (day: string) => void } = $props();
  /** "Fri 09-18": the year only when it isn't this one. */
  const dayText = (d: string) => {
    const full = dayLabel(d, today);
    return d.slice(0, 4) === today.slice(0, 4) ? full.replace(`${d.slice(0, 4)}-`, "") : full;
  };

  /** The same day of the month `n` months away, kept inside that month. */
  function shiftMonth(d: string, n: number) {
    const [y, m, dd] = d.split("-").map(Number);
    const first = new Date(Date.UTC(y, m - 1 + n, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
    first.setUTCDate(Math.min(dd, last));
    return first.toISOString().slice(0, 10);
  }
  const step = (n: number) => {
    const next = unit === "day" ? shiftDay(day, n) : unit === "week" ? shiftDay(day, 7 * n) : shiftMonth(day, n);
    return next > today ? today : next;
  };
  /** Whether `day` is in the same Day, week, or month as today. */
  // Nothing to step through until the card has its Days.
  const ready = $derived(/^\d{4}-\d{2}-\d{2}$/.test(day) && /^\d{4}-\d{2}-\d{2}$/.test(today));
  const current = $derived(!ready || unit === "day" ? day === today : unit === "week" ? mondayOf(day) === mondayOf(today) : day.slice(0, 7) === today.slice(0, 7));
  const label = $derived(
    !ready ? "" : unit === "day" ? dayText(day)
    : unit === "week" ? (current ? "This week" : `Week of ${mondayOf(day).slice(5)}`)
    : current ? "This month" : `${MONTHS[Number(day.slice(5, 7)) - 1]} ${day.slice(0, 4)}`,
  );
  const atStart = $derived(!!oldest && (unit === "day" ? day <= oldest : unit === "week" ? mondayOf(day) <= mondayOf(oldest) : day.slice(0, 7) <= oldest.slice(0, 7)));
</script>

{#if ready}
<div class="stepper">
  <TodayButton show={day !== today} {short} onclick={() => onpick(today)} />
  <button aria-label="Previous {unit}" disabled={atStart} onclick={() => onpick(step(-1))}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  </button>
  <span class="cap label">{label}</span>
  <button aria-label="Next {unit}" disabled={current} onclick={() => onpick(step(1))}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
</div>
{/if}

<style>
  .stepper { display: flex; align-items: center; gap: 2px; }
  .stepper :global(.today) { margin-right: 6px; }
  button { width: 30px; height: 32px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: opacity var(--t-base), color var(--t-base); }
  button:disabled { opacity: .3; cursor: default; }
  button:not(:disabled):active { color: var(--ink); }
  .label { min-width: 78px; text-align: center; color: var(--ink); white-space: nowrap; }
</style>
