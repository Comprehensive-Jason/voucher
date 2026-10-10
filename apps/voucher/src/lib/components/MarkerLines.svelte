<script lang="ts">
  // Markers drawn across a chart, inside its SVG: a thin line at each one's
  // place with a small flag at the top, in the Marker colour for one written
  // by hand and grey for a rule change, its text in the tooltip. The same on
  // every chart.
  let { marks, y0, y1 }: { marks: { x: number; text: string; rule: boolean }[]; y0: number; y1: number } = $props();
</script>

<g class="markers">
  {#each marks as m}
    {@const color = m.rule ? "var(--muted)" : "var(--marker)"}
    <line x1={m.x} x2={m.x} y1={y1} y2={y0} stroke={color} stroke-width="1.2" opacity=".8"><title>{m.text}</title></line>
    <rect x={m.x} y={y1} width="6" height="5" rx="1" fill={color}><title>{m.text}</title></rect>
  {/each}
</g>
