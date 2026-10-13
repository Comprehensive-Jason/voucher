<script lang="ts">
  // A card's name on a folder tab: the card's left edge carries straight on
  // up into the tab, rounds over its top, and the tab's right side ramps
  // smoothly back down into the card's top edge, as on a paper folder. Drawn
  // as one outline; the tab's fill covers the card's border under it, so
  // card and tab read as one shape. It stands on the card's top border line,
  // `rise` px above it, flush with the card's left side (whose top-left
  // corner is square, so the edge runs on without a break).
  let { name, rise = 20 }: { name: string; rise?: number } = $props();
  /** The tab's top-left corner, the width of the ramp down on its right, and the name's inset (the card's own padding, so it lines up with what's below). */
  const R = 10, RAMP = 22, PAD = 18;
  let textWidth = $state(0);
  const w = $derived(Math.ceil(textWidth) + 2 * PAD + RAMP);
  // Border lines' centres sit half a pixel in from the edges.
  const y = $derived(rise + 0.5);
  /** Up the left side, over the rounded corner, along the top, and down the ramp into the card's top edge. */
  const outline = $derived(`M0.5,${rise + 1} L0.5,${R + 0.5} A${R},${R} 0 0 1 ${R + 0.5},0.5 L${w - RAMP},0.5 C${w - RAMP * 0.45},0.5 ${w - RAMP * 0.55},${y} ${w},${y}`);
</script>

<span class="cardtab" style="width: {w}px; height: {rise + 1}px">
  <svg width={w} height={rise + 1} viewBox="0 0 {w} {rise + 1}" aria-hidden="true">
    <!-- The fill reaches a pixel below the border line, covering it under the tab. -->
    <path d="{outline} L{w},{rise + 1} L0,{rise + 1} Z" fill="var(--surface)" />
    <path d={outline} fill="none" stroke="var(--line)" stroke-width="1" />
  </svg>
  <span class="cap name" bind:clientWidth={textWidth} style="left: {PAD}px; height: {rise + 1}px">{name}</span>
</span>

<style>
  .cardtab { position: absolute; display: block; }
  svg { position: absolute; inset: 0; display: block; overflow: visible; }
  .name { position: absolute; top: 1px; display: flex; align-items: center; font-size: 10px; line-height: 1; white-space: nowrap; }
</style>
