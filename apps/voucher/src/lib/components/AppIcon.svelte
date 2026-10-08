<script lang="ts">
  // An app's own icon, or a lettered tile until (or unless) the device has one.
  import { icons, wantIcon } from "../icons.svelte";
  let { pkg, label, size = 32 }: { pkg: string; label: string; size?: number } = $props();
  $effect(() => wantIcon(pkg));
  const src = $derived(icons[pkg]);
  const tint = $derived(["#5b6cff", "#c13584", "#2f9e6b", "#d9822b", "#7d8cff", "#0ca8d1"][[...pkg].reduce((n, c) => n + c.charCodeAt(0), 0) % 6]);
</script>

{#if src}
  <img {src} alt="" width={size} height={size} style="width: {size}px; height: {size}px" />
{:else}
  <span class="tile" style="width: {size}px; height: {size}px; background: {tint}; font-size: {Math.round(size * 0.42)}px" aria-hidden="true">{label.trim().charAt(0).toUpperCase()}</span>
{/if}

<style>
  img { flex: none; border-radius: 22%; }
  .tile { flex: none; border-radius: 22%; display: grid; place-items: center; color: #fff; font-weight: 700; opacity: .85; }
</style>
