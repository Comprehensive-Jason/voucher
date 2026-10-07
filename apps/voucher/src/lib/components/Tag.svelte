<script lang="ts">
  let { premade }: { premade: boolean } = $props();
</script>

<span class="tag" class:premade>{premade ? "Premade" : "Yours"}</span>

<style>
  .tag { padding: 2px 8px; border-radius: 6px; font: 700 11px var(--font); background: var(--line); color: var(--ink); }
  .premade { background: #1b2350; color: var(--night-ink); }
</style>
