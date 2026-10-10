<script lang="ts">
  // A chart's number axis, drawn inside its SVG: dashed lines across at each
  // tick, the numbers at the left, and the axis's name turned up the side.
  // The same on every line chart. Leave room for it: x0 of about 40.
  let { ticks, yAt, x0, x1, y0, y1, title, format = (v: number) => String(v) }: {
    ticks: number[]; yAt: (v: number) => number; x0: number; x1: number; y0: number; y1: number; title: string; format?: (v: number) => string;
  } = $props();
  const mid = $derived((y0 + y1) / 2);
</script>

<g class="axis">
  {#each ticks as t}
    <line x1={x0} x2={x1} y1={yAt(t)} y2={yAt(t)} stroke="#2c3036" stroke-dasharray={t ? "3 4" : ""} />
    <text x={x0 - 6} y={yAt(t) + 3.5} text-anchor="end">{format(t)}</text>
  {/each}
  <text class="title" x="10" y={mid} text-anchor="middle" transform="rotate(-90 10 {mid})">{title}</text>
</g>

<style>
  /* The axis's name is quieter than its numbers: smaller and dimmer, so it labels without cluttering. */
  .title { font-size: calc(9px * var(--k, 1)); fill: #5d6369; letter-spacing: .04em; }
</style>
