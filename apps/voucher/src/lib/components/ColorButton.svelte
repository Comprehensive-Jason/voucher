<script lang="ts">
  // Beside an editor's name: what color this is drawn in, and the way to
  // change it. Sources are drawn as rounded squares, blocklists as dots.
  let { color, round = false, label, onclick }: { color: string; round?: boolean; label: string; onclick: () => void } = $props();
</script>

<button class="btn" aria-label="{label} color" {onclick}>
  <span class="cap">Color</span>
  <span class="swatch" class:round style="background: {color}"></span>
</button>

<style>
  .swatch { width: 22px; height: 22px; border-radius: 6px; }
  .swatch.round { border-radius: 50%; }
</style>
