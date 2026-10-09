<script lang="ts">
  // A small segmented switch for how far a chart is zoomed out (Day / Week /
  // Month on the bar graph, 12 weeks / Year on the history grid), the same on
  // every card.
  let { options, value, onchange, label = "Zoom" }: {
    options: { id: string; label: string }[];
    value: string;
    onchange: (id: string) => void;
    label?: string;
  } = $props();
</script>

<div class="zoom" role="group" aria-label={label}>
  {#each options as o (o.id)}
    <button class:on={value === o.id} aria-pressed={value === o.id} onclick={() => onchange(o.id)}>{o.label}</button>
  {/each}
</div>

<style>
  .zoom { flex: none; display: flex; padding: 2px; border-radius: 10px; background: #1f2226; border: 1px solid var(--line); }
  button { height: 26px; padding: 0 9px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: 700 11px var(--font); cursor: pointer; white-space: nowrap; transition: background-color var(--t-quick), color var(--t-quick); }
  button.on { background: var(--line); color: var(--ink); }
  button:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
</style>
