<script lang="ts">
  import { untrack } from "svelte";
  // A bar's fill that slides to new values. When the source has just earned
  // (`laps` went up), the full bar fades away where it stands while the new
  // progress grows in from the left underneath, instead of the bar snapping
  // empty or sliding backwards as if progress were lost.
  let { value, laps, color }: { value: number; laps: number; color: string } = $props();

  const SLIDE_MS = 350;
  const FADE_MS = 600;
  // Start where the bar already is; later values arrive through the effect.
  let shown = $state(untrack(() => value));
  let sliding = $state(true);
  /** Bumped on each Voucher, to draw a fresh fading copy of the full bar. */
  let ghost = $state(0);
  /** The new fill waits a moment, so the copy starts fading first. */
  let regrow = $state(false);
  let last = { laps: untrack(() => laps) };

  $effect(() => {
    const target = value;
    const earned = laps > last.laps;
    last = { laps };
    if (!earned) { sliding = true; shown = target; return; }
    // The full bar becomes a fading copy; the real fill restarts from empty.
    untrack(() => ghost++);
    sliding = false;
    regrow = true;
    shown = 0;
    let frame = 0;
    // Two frames, so the empty fill is drawn before it grows again.
    frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => { sliding = true; shown = target; })));
    const done = setTimeout(() => (regrow = false), FADE_MS);
    return () => { cancelAnimationFrame(frame); clearTimeout(done); };
  });
</script>

{#key ghost}
  {#if ghost}<i class="ghost" style="width: 100%; background: {color}; animation-duration: {FADE_MS}ms"></i>{/if}
{/key}
<i style="width: {Math.min(1, shown) * 100}%; background: {color}; transition: {sliding ? `width ${SLIDE_MS}ms ease ${regrow ? 120 : 0}ms` : 'none'}"></i>

<style>
  /* Fades out and brightens a little, so it reads as spent, not lost. */
  .ghost { pointer-events: none; animation: spend ease-out forwards; }
  @keyframes spend { 0% { opacity: 1; } 30% { opacity: .9; filter: brightness(1.4); } 100% { opacity: 0; filter: brightness(1.4); } }
</style>
