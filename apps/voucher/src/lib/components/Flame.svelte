<script lang="ts">
  // The Streak's flame, drawn in the current text colour, wherever a Streak
  // or the Daily goal is shown.
  let { size = 12 }: { size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>

<style>
  svg { flex: none; display: block; }
</style>
