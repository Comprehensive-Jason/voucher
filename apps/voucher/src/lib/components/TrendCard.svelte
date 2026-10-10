<script lang="ts">
  // The frame every Trends card shares: a title with optional controls on
  // the right, the chart, and one line under it saying what the chart shows.
  import type { Snippet } from "svelte";
  import { fitsSlot } from "../fit.svelte";
  const fit = fitsSlot();
  let { title, tools, children, foot }: { title: string; tools?: Snippet; children: Snippet; foot?: Snippet } = $props();
</script>

<section class="card" class:fit>
  <div class="cardhead">
    <span class="cap">{title}</span>
    {#if tools}<div class="tools">{@render tools()}</div>{/if}
  </div>
  {@render children()}
  {#if foot}<p class="foot">{@render foot()}</p>{/if}
</section>

<style>
  .card { container: card / inline-size; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); padding: 16px 18px; display: flex; flex-direction: column; gap: 12px; }
  .foot { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); border-top: 1px solid var(--divider); padding-top: 10px; }
  .foot :global(b) { color: var(--ink); font-family: var(--mono); font-weight: 700; }
  /* Charts draw in SVG; their text keeps the app's mono figures. */
  .card :global(svg.chart) { display: block; width: 100%; height: auto; overflow: visible; }
  .card :global(svg.chart text) { font-family: var(--mono); font-size: 10px; fill: var(--muted); }
  /* Filling a tablet slot: the chart's box takes the spare height and its
     drawing is redrawn to that shape (see drawHeight). */
  .fit :global(.plot) { flex: 1; min-height: 0; }
  .fit :global(.plot svg.chart) { height: 100%; }
  .fit .foot { flex: none; }
</style>
