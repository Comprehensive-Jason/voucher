<script lang="ts">
  // ‹ Today › in a card's header: steps one Day back or forward, with a way
  // back to today once it has moved. The card shares the Day it moves to, so
  // every card that follows the shared Day moves with it.
  import TodayButton from "./TodayButton.svelte";
  import { dayLabel, shiftDay } from "../time";

  let { day, today, oldest, onpick }: { day: string; today: string; oldest?: string; onpick: (day: string) => void } = $props();
</script>

<div class="stepper">
  <TodayButton show={day !== today} onclick={() => onpick(today)} />
  <button aria-label="Previous day" disabled={!!oldest && day <= oldest} onclick={() => onpick(shiftDay(day, -1))}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  </button>
  <span class="cap label">{dayLabel(day, today)}</span>
  <button aria-label="Next day" disabled={day >= today} onclick={() => onpick(shiftDay(day, 1))}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
</div>

<style>
  .stepper { display: flex; align-items: center; gap: 2px; }
  .stepper :global(.today) { margin-right: 6px; }
  button { width: 32px; height: 32px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: opacity var(--t-base), color var(--t-base); }
  button:disabled { opacity: .3; cursor: default; }
  button:not(:disabled):active { color: var(--ink); }
  .label { min-width: 84px; text-align: center; color: var(--ink); white-space: nowrap; }
</style>
