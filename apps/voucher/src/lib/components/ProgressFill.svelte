<script lang="ts">
  import { untrack } from "svelte";
  // A bar's fill that slides to new values. When the source has just earned
  // (`laps` went up), it runs to the end, empties, and grows to the new value,
  // instead of sliding backwards as if progress were lost.
  let { value, laps, color }: { value: number; laps: number; color: string } = $props();

  const SLIDE_MS = 350;
  // Start where the bar already is; later values arrive through the effect.
  let shown = $state(untrack(() => value));
  let sliding = $state(true);
  let last = { laps: untrack(() => laps) };

  $effect(() => {
    const target = value;
    const earned = laps > last.laps;
    last = { laps };
    sliding = true;
    if (!earned) { shown = target; return; }
    shown = 1;
    let frame = 0;
    const timer = setTimeout(() => {
      sliding = false;
      shown = 0;
      // Two frames, so the empty bar is drawn before it grows again.
      frame = requestAnimationFrame(() => (frame = requestAnimationFrame(() => { sliding = true; shown = target; })));
    }, SLIDE_MS);
    return () => { clearTimeout(timer); cancelAnimationFrame(frame); };
  });
</script>

<i style="width: {Math.min(1, shown) * 100}%; background: {color}; transition: {sliding ? `width ${SLIDE_MS}ms ease` : 'none'}"></i>
