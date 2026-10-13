<script lang="ts">
  // The frame every Trends card shares: the heading (CardHead), the chart,
  // and one line under it saying what the chart shows. A card that follows
  // the shared Day passes `date`, and gets the date switcher in the title's
  // place and the Today button beside its switches, all on the heading's one
  // line; a card that steps through something else (Before and after's
  // Markers) passes its own `nav` for the switcher.
  import type { Snippet } from "svelte";
  import { fitsSlot } from "../fit.svelte";
  import CardHead from "./CardHead.svelte";
  import { stepper, type DateProps } from "../stepper";
  const fit = fitsSlot();
  type Nav = { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void };
  let { title, date, nav, tools, children, foot }: { title: string; date?: DateProps; nav?: Nav; tools?: Snippet; children: Snippet; foot?: Snippet } = $props();
  const step = $derived(date ? stepper(date) : null);
</script>

<section class="card tile" class:fit>
  <CardHead {title} nav={nav ?? step?.nav} today={step?.today} {tools} />
  {@render children()}
  {#if foot}<p class="foot">{@render foot()}</p>{/if}
</section>

<style>
  /* Charts draw in SVG; their text keeps the app's mono figures. */
  .card :global(svg.chart) { display: block; width: 100%; height: auto; overflow: visible; }
  /* Text inside a chart stays one size however wide the card is: each chart
     sets --k to its drawing's units per pixel (W / its width), so the
     axis size on screen is that many px times --k in the drawing. */
  .card :global(svg.chart text) { font-family: var(--mono); font-size: calc(var(--axis-size) * var(--k, 1)); fill: var(--axis-ink); }
  /* Filling a tablet slot: the chart's box takes the spare height and its
     drawing is redrawn to that shape (see drawHeight). */
  .fit :global(.plot) { flex: 1; min-height: 0; }
  .fit :global(.plot svg.chart) { height: 100%; }
  .fit .foot { flex: none; }
</style>
