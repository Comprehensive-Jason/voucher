<script lang="ts">
  // The frame every Trends card shares: a title with optional controls on
  // the right, the chart, and one line under it saying what the chart shows.
  // A card that follows the shared Day passes `date`: its date switcher
  // takes the title's place, and the Today button comes first on the right,
  // as on every dated card.
  import type { Snippet } from "svelte";
  import { fitsSlot } from "../fit.svelte";
  import DayStepper, { type DateProps } from "./DayStepper.svelte";
  import TodayButton from "./TodayButton.svelte";
  const fit = fitsSlot();
  // A card that steps through something else (Before and after's Markers)
  // passes its own `nav` for the title's place, built from DateNav.
  let { title, date, nav, tools, children, foot }: { title: string; date?: DateProps; nav?: Snippet; tools?: Snippet; children: Snippet; foot?: Snippet } = $props();
  const ready = $derived(!!date && /^\d{4}-\d{2}-\d{2}$/.test(date.day) && /^\d{4}-\d{2}-\d{2}$/.test(date.today));
</script>

<section class="card tile" class:fit>
  <div class="cardhead">
    {#if nav}{@render nav()}{:else if date && ready}<DayStepper {...date} caption={title} />{:else}<span class="cap">{title}</span>{/if}
    {#if tools || date}
      <div class="tools">
        {#if date && ready}<TodayButton show={date.day !== date.today} onclick={() => date.onpick(date.today)} />{/if}
        {#if tools}{@render tools()}{/if}
      </div>
    {/if}
  </div>
  {@render children()}
  {#if foot}<p class="foot">{@render foot()}</p>{/if}
</section>

<style>
  .foot { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); border-top: 1px solid var(--divider); padding-top: 10px; }
  .foot :global(b) { color: var(--ink); font-family: var(--mono); font-weight: 700; }
  /* Charts draw in SVG; their text keeps the app's mono figures. */
  .card :global(svg.chart) { display: block; width: 100%; height: auto; overflow: visible; }
  /* Text inside a chart stays one size however wide the card is: each chart
     sets --k to its drawing's units per pixel (W / its width), so 11px
     on screen is 11 * --k units in the drawing. */
  .card :global(svg.chart text) { font-family: var(--mono); font-size: calc(11px * var(--k, 1)); fill: var(--muted); }
  /* Filling a tablet slot: the chart's box takes the spare height and its
     drawing is redrawn to that shape (see drawHeight). */
  .fit :global(.plot) { flex: 1; min-height: 0; }
  .fit :global(.plot svg.chart) { height: 100%; }
  .fit .foot { flex: none; }
</style>
