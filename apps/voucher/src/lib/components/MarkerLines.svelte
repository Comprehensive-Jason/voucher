<script lang="ts">
  // Markers drawn across a chart, inside its SVG: a thin line at each one's
  // place with a small notched flag at the top (the same flag as the Marker
  // button, the Log, and the keys), in the Marker colour for one written by
  // hand and grey for a rule change, its text in the tooltip. The same on
  // every chart.
  let { marks, y0, y1 }: { marks: { x: number; text: string; rule: boolean }[]; y0: number; y1: number } = $props();
</script>

<g class="markers">
  {#each marks as m}
    {@const color = m.rule ? "var(--muted)" : "var(--marker)"}
    <line x1={m.x} x2={m.x} y1={y1} y2={y0} stroke={color} stroke-width="1.2" opacity=".8"><title>{m.text}</title></line>
    <path d="M{m.x},{y1} h7 l-2,2.75 2,2.75 h-7 z" fill={color}><title>{m.text}</title></path>
  {/each}
</g>
