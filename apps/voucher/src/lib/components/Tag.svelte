<script lang="ts">
  // Whether a blocklist came with Voucher (Premade) or was made here (Yours).
  // Both neutral: indigo means Curfew, so it stays off tags.
  let { premade }: { premade: boolean } = $props();
</script>

<span class="tag" class:premade>{premade ? "Premade" : "Yours"}</span>

<style>
  .tag { flex: none; padding: 2px 8px; border-radius: 6px; border: 1px solid transparent; font: 700 11px var(--font); background: var(--line); color: var(--ink); }
  .premade { background: none; border-color: var(--line); color: var(--muted); }
</style>
