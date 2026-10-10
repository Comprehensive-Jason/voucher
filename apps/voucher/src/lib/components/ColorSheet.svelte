<script lang="ts">
  // Picks the colour a source or blocklist is drawn in: the palette's rows,
  // light to dark, each running around the colour wheel.
  import Sheet from "./Sheet.svelte";
  import { PALETTE, nearSpend } from "../palette";

  let { title, current, fallback = null, onpick, onclose }: {
    title: string;
    current: string;
    /** The default colour, offered as "Default colour" when a choice can be undone. */
    fallback?: string | null;
    onpick: (color: string | null) => void;
    onclose: () => void;
  } = $props();
  // A colour saved before salmon meant Unlock still shows, but is no longer offered.
  const retired = $derived(nearSpend(current));
</script>

<Sheet {onclose}>
  <div class="head"><h2>{title}</h2><span class="now" style="background: {current}"></span></div>
  {#if retired}<p class="lead">This colour is too close to salmon, which now means Unlock, so it's no longer offered. Pick another.</p>{/if}
  <div class="grid" role="radiogroup" aria-label="Colours">
    {#each PALETTE.flat() as swatch}
      <button class="swatch" class:on={swatch.color === current.toLowerCase()} style="background: {swatch.color}"
        role="radio" aria-checked={swatch.color === current.toLowerCase()} aria-label={swatch.name}
        onclick={() => onpick(swatch.color)}></button>
    {/each}
  </div>
  {#if fallback}
    <button class="reset" onclick={() => onpick(null)}><span class="now small" style="background: {fallback}"></span>Default colour</button>
  {/if}
</Sheet>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; max-width: 520px; }
  h2 { margin: 0; font-size: 18px; }
  .now { width: 22px; height: 22px; border-radius: 50%; }
  .now.small { width: 14px; height: 14px; }
  .grid { display: grid; grid-template-columns: repeat(10, minmax(0, 1fr)); gap: 8px; max-width: 480px; }
  .swatch { aspect-ratio: 1; min-height: 28px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; }
  .swatch.on { outline: 3px solid var(--ink); outline-offset: 2px; }
  .swatch:focus-visible { outline: 3px solid var(--voucher); outline-offset: 2px; }
  .reset { align-self: flex-start; display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); font: 600 14px var(--font); cursor: pointer; }
</style>
