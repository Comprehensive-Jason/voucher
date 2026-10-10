<script lang="ts">
  // The Streak as a gold pill, "4 Day streak", one look everywhere it shows:
  // the Bank meter, the phone's Trends heading, and the tray.
  import Flame from "./Flame.svelte";
  let { days }: { days: number } = $props();
</script>

<span class="streak"><Flame />{days > 0 ? `${days} Day streak` : "No streak"}</span>

<style>
  .streak { flex: none; display: inline-flex; align-items: center; gap: 5px; padding: 4px 10px; border-radius: 999px; background: var(--goal-bg); color: var(--goal); font-size: 12px; font-weight: 700; white-space: nowrap; }
</style>
