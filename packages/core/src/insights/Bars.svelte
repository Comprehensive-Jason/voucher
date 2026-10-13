<script lang="ts">
  // How sure a finding is, like a signal icon: one bar Low, two Medium,
  // three High, as on What goes with a good Day.
  let { level }: { level: 1 | 2 | 3 } = $props();
  const NAMES = ["", "Low", "Medium", "High"];
</script>

<span class="conf" role="img" aria-label="{NAMES[level]} confidence">
  <i class:on={level >= 1} style="height: 5px"></i><i class:on={level >= 2} style="height: 8px"></i><i class:on={level >= 3} style="height: 11px"></i>
</span>

<style>
  .conf { flex: none; display: inline-flex; align-items: flex-end; gap: 2px; height: 11px; }
  .conf i { display: block; width: 3px; border-radius: 1px; background: var(--line); }
  .conf i.on { background: var(--muted); }
</style>
