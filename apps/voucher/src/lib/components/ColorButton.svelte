<script lang="ts">
  // The top-right corner of an editor: what colour this is drawn in, and the
  // way to change it. Sources are drawn as rounded squares, blocklists as dots.
  let { color, round = false, label, onclick }: { color: string; round?: boolean; label: string; onclick: () => void } = $props();
</script>

<button class="color" aria-label="{label} colour" {onclick}>
  <span class="cap">Color</span>
  <span class="swatch" class:round style="background: {color}"></span>
</button>

<style>
  .color { height: 40px; padding: 0 8px 0 12px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .color:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
  .swatch { width: 22px; height: 22px; border-radius: 6px; }
  .swatch.round { border-radius: 50%; }
</style>
