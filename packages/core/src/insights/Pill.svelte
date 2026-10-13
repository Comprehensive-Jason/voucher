<script lang="ts">
  // The change, in its direction's color on a tint of it: green better,
  // crimson worse, gold a record, gray neither. As on What goes with a good
  // Day: crimson text is --worse-text, 4.9:1 on its wash.
  import type { Tone } from "./types";
  let { text, tone }: { text: string; tone: Tone } = $props();
</script>

<b class="pill {tone}">{text}</b>

<style>
  .pill { flex: none; font: 700 11px/1 var(--mono); padding: 3px 5px; border-radius: 6px; white-space: nowrap; color: var(--worse-text); background: var(--worse-wash); }
  .pill.good { color: var(--voucher); background: var(--voucher-wash); }
  .pill.gold { color: var(--goal); background: var(--goal-wash); }
  .pill.neutral { color: var(--ink); background: var(--line); }
</style>
