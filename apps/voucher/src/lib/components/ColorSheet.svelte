<script lang="ts">
  // Picks the color a source or blocklist is drawn in: the palette's rows,
  // light to dark, each running around the color wheel. A color saved before
  // salmon meant Unlock, or near gold (the Daily goal), still shows as the
  // current one, but is no longer offered.
  import Sheet from "./Sheet.svelte";
  import { PALETTE, nearGoal, nearSpend } from "../palette";

  let { title, current, fallback = null, onpick, onclose }: {
    title: string;
    current: string;
    /** The default color, offered as "Default color" when a choice can be undone. */
    fallback?: string | null;
    onpick: (color: string | null) => void;
    onclose: () => void;
  } = $props();
  const retired = $derived(nearSpend(current) ? "salmon, which means Unlock" : nearGoal(current) ? "gold, which means the Daily goal" : null);
</script>

<Sheet {onclose}>
  <div class="head"><h2>{title}</h2><span class="now" style="background: {current}"></span></div>
  {#if retired}<p class="lead">This color is too close to {retired}, so it's no longer offered. Pick another.</p>{/if}
  <div class="grid" style="--cols: {PALETTE[0].length}" role="radiogroup" aria-label="Colors">
    {#each PALETTE.flat() as swatch}
      <button class="swatch" class:on={swatch.color === current.toLowerCase()} style="background: {swatch.color}"
        role="radio" aria-checked={swatch.color === current.toLowerCase()} aria-label={swatch.name}
        onclick={() => onpick(swatch.color)}></button>
    {/each}
  </div>
  {#if fallback}
    <button class="btn small reset" onclick={() => onpick(null)}><span class="now small" style="background: {fallback}"></span>Default color</button>
  {/if}
</Sheet>

<style>
  .head { display: flex; align-items: center; justify-content: space-between; max-width: 440px; }
  h2 { margin: 0; font-size: 18px; }
  .now { width: 22px; height: 22px; border-radius: 50%; }
  .now.small { width: 14px; height: 14px; }
  .grid { display: grid; grid-template-columns: repeat(var(--cols), minmax(0, 1fr)); gap: 8px; max-width: 440px; }
  .swatch { aspect-ratio: 1; min-height: 28px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; }
  .swatch.on { outline: 3px solid var(--ink); outline-offset: 2px; }
  .swatch:focus-visible { outline: 3px solid var(--voucher); outline-offset: 2px; }
  .reset { align-self: flex-start; }
</style>
