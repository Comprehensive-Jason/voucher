<script lang="ts">
  // Picks the colour a source or blocklist is drawn in: the palette as a grid,
  // a hue per column and light, medium, and deep down each one.
  import Sheet from "./Sheet.svelte";
  import { PALETTE } from "../palette";

  let { title, current, fallback = null, onpick, onclose }: {
    title: string;
    current: string;
    /** The default colour, offered as "Default colour" when a choice can be undone. */
    fallback?: string | null;
    onpick: (color: string | null) => void;
    onclose: () => void;
  } = $props();
</script>

<Sheet {onclose}>
  <div class="head"><h2>{title}</h2><span class="now" style="background: {current}"></span></div>
  <div class="grid" role="radiogroup" aria-label="Colours">
    {#each [0, 1, 2] as tone}
      {#each PALETTE as p}
        {@const color = p.tones[tone]}
        <button class="swatch" class:on={color.toLowerCase() === current.toLowerCase()} style="background: {color}"
          role="radio" aria-checked={color.toLowerCase() === current.toLowerCase()} aria-label="{p.hue}, {['light', 'medium', 'deep'][tone]}"
          onclick={() => onpick(color)}></button>
      {/each}
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
  .grid { display: grid; grid-template-columns: repeat(11, minmax(0, 1fr)); gap: 8px; max-width: 520px; }
  .swatch { aspect-ratio: 1; min-height: 28px; border-radius: 50%; border: 0; padding: 0; cursor: pointer; }
  .swatch.on { outline: 3px solid var(--ink); outline-offset: 2px; }
  .swatch:focus-visible { outline: 3px solid var(--voucher); outline-offset: 2px; }
  .reset { align-self: flex-start; display: flex; align-items: center; gap: 10px; min-height: 40px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); font: 600 14px var(--font); cursor: pointer; }
</style>
