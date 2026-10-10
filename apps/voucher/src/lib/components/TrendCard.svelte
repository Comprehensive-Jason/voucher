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
  let { title, date, tools, children, foot }: { title: string; date?: DateProps; tools?: Snippet; children: Snippet; foot?: Snippet } = $props();
  const ready = $derived(!!date && /^\d{4}-\d{2}-\d{2}$/.test(date.day) && /^\d{4}-\d{2}-\d{2}$/.test(date.today));
</script>

<section class="card" class:fit>
  <div class="cardhead">
    {#if date && ready}<DayStepper {...date} />{:else}<span class="cap">{title}</span>{/if}
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
