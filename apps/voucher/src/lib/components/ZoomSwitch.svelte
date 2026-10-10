<script lang="ts">
  // A segmented switch, one look everywhere. `size="small"` (the default) is
  // the compact one on chart cards (Day / Week / Month on the bar graph, 12
  // weeks / Year on the history grid); `size="large"` fills its row with
  // equal segments at touch height, as the phone's Rules tabs do. The
  // highlight fades from the old segment to the new one.
  let { options, value, onchange, label = "Zoom", size = "small" }: {
    options: { id: string; label: string }[];
    value: string;
    onchange: (id: string) => void;
    label?: string;
    size?: "small" | "large";
  } = $props();
</script>

<div class="zoom" class:large={size === "large"} role="group" aria-label={label}>
  {#each options as o (o.id)}
    <button class:on={value === o.id} aria-pressed={value === o.id} onclick={() => onchange(o.id)}>{o.label}</button>
  {/each}
</div>

<style>
  .zoom { flex: none; display: flex; padding: 2px; border-radius: 10px; background: var(--raised); border: 1px solid var(--line); }
  button { height: 26px; padding: 0 9px; border: 0; border-radius: 8px; background: none; color: var(--muted); font: 700 11px var(--font); cursor: pointer; white-space: nowrap; transition: background-color var(--t-base), color var(--t-base); }
  button.on { background: var(--line); color: var(--ink); }
  button:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .large { display: grid; grid-auto-flow: column; grid-auto-columns: minmax(0, 1fr); gap: 2px; padding: 3px; border-radius: 14px; }
  .large button { height: 38px; padding: 0 4px; border-radius: 11px; font-size: 13px; overflow: hidden; text-overflow: ellipsis; }
</style>
