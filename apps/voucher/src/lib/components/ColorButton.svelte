<script lang="ts">
  // Beside an editor's name: what colour this is drawn in, and the way to
  // change it. Sources are drawn as rounded squares, blocklists as dots.
  let { color, round = false, label, onclick }: { color: string; round?: boolean; label: string; onclick: () => void } = $props();
</script>

<button class="color" aria-label="{label} colour" {onclick}>
  <span class="cap">Color</span>
  <span class="swatch" class:round style="background: {color}"></span>
</button>

<style>
  .color { flex: none; height: 48px; padding: 0 12px 0 14px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); display: flex; align-items: center; gap: 10px; cursor: pointer; }
  .color:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
  .swatch { width: 22px; height: 22px; border-radius: 6px; }
  .swatch.round { border-radius: 50%; }
</style>
