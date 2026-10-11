<script lang="ts">
  // A card's own options in Arrange mode (PANELS' `options`), over its size
  // switch: a Switch for an on-or-off one, chips for picking some of a few
  // (dimmed once as many are on as the card's height allows). Choices are
  // kept with the arrangement and apply wherever the card is drawn.
  import { arrangement, PANELS, type PanelId } from "../arrangement.svelte";
  import Switch from "./Switch.svelte";
  let { id }: { id: PanelId } = $props();
</script>

{#each PANELS[id].options ?? [] as o (o.id)}
  <div class="option" role="group" aria-label={o.label}>
    <span class="cap">{o.label}</span>
    {#if o.kind === "switch"}
      <Switch on={arrangement.switchOn(id, o.id)} label={o.label} onchange={(on) => arrangement.setSwitch(id, o.id, on)} />
    {:else}
      {@const picked = arrangement.picked(id, o.id)}
      {@const full = picked.length >= (o.most?.(arrangement.size(id)) ?? Infinity)}
      <div class="chips">
        {#each o.choices as c (c.id)}
          {@const on = picked.includes(c.id)}
          <button class:on aria-pressed={on} disabled={!on && full} onclick={() => arrangement.toggleChip(id, o.id, c.id)}>{c.label}</button>
        {/each}
      </div>
    {/if}
  </div>
{/each}

<style>
  .option { flex: none; display: flex; flex-direction: column; gap: 6px; }
  /* The "Why now?" chips' look (ReasonChips), a size smaller to sit over the size switch. */
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { height: 30px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--raised); color: var(--ink); font: 600 12px var(--font); cursor: pointer; transition: background-color var(--t-base), color var(--t-base), opacity var(--t-base), var(--press); }
  .chips button.on { background: var(--ink); color: var(--ground); }
  .chips button:disabled { opacity: .35; cursor: default; }
</style>
