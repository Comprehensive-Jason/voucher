<script lang="ts" module>
  export type Unit = "day" | "week" | "month";
  export type DateProps = { day: string; today: string; oldest?: string; unit?: Unit; onpick: (day: string) => void };
</script>

<script lang="ts">
  // A card's date switcher for the shared Day: steps one Day, week, or month
  // back or forward. TrendCard shows it in place of the title, with the
  // Today button first among the card's controls.
  import DateNav from "./DateNav.svelte";
  import { periodLabel, shiftDay } from "../time";

  let { day, today, oldest, unit = "day", onpick }: DateProps = $props();

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
  const label = $derived(periodLabel(unit, day, today));
  /** Today's Day, week, or month: nothing later to step to. */
  const current = $derived(label === "Today" || label === "This week" || label === "This month");
  /** In the oldest Day, week, or month the card has. */
  const atStart = $derived(!!oldest && (unit === "day" ? day <= oldest : periodLabel(unit, oldest, today) === label));
</script>

<DateNav {label} back={!atStart} forward={!current} onback={() => onpick(step(-1))} onforward={() => onpick(step(1))} />
