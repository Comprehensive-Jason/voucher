<script lang="ts">
  // A card's name on a tab that grows out of its top edge, drawn as one
  // outline: the card's border runs along, bends up through a small inward
  // curve into the tab's side, over its rounded top, and back down into the
  // border on the far side. The tab's fill covers the stretch of the card's
  // border between the two curves, so card and tab read as one shape. It
  // sits on the card's top border line: `rise` px above it.
  let { name, rise = 14 }: { name: string; rise?: number } = $props();
  /** Inward curve where the border bends up, and the tab's top corners. */
  const F = 7, R = 7, PAD = 9;
  let textWidth = $state(0);
  const w = $derived(Math.ceil(textWidth) + 2 * PAD + 2 * F);
  // The border line's centre is half a pixel below the tab's foot.
  const y = $derived(rise + 0.5);
  /** The outline, open at the bottom: concave curve up, side, rounded top, side, concave curve down. */
  const outline = $derived(`M0,${y} A${F},${F} 0 0 0 ${F - 0.5},${y - F} L${F - 0.5},${R + 0.5} A${R},${R} 0 0 1 ${F - 0.5 + R},0.5 L${w - F + 0.5 - R},0.5 A${R},${R} 0 0 1 ${w - F + 0.5},${R + 0.5} L${w - F + 0.5},${y - F} A${F},${F} 0 0 0 ${w},${y}`);
</script>

<span class="cardtab" style="width: {w}px; height: {rise + 1}px">
  <svg width={w} height={rise + 1} viewBox="0 0 {w} {rise + 1}" aria-hidden="true">
    <!-- The fill reaches a pixel below the border line, covering it under the tab. -->
    <path d="{outline} L{w},{rise + 1} L0,{rise + 1} Z" fill="var(--surface)" />
    <path d={outline} fill="none" stroke="var(--line)" stroke-width="1" />
  </svg>
  <span class="cap name" bind:clientWidth={textWidth} style="left: {F + PAD}px; height: {rise}px">{name}</span>
</span>

<style>
  .cardtab { position: absolute; display: block; pointer-events: auto; }
  svg { position: absolute; inset: 0; display: block; overflow: visible; }
  .name { position: absolute; top: 1px; display: flex; align-items: center; font-size: 10px; line-height: 1; white-space: nowrap; }
</style>
