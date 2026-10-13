<script lang="ts">
  // Every tile's heading, one line, the same everywhere: on the left the
  // title, or on a dated card its date switcher in the title's place (the
  // name stays on the tile for screen readers); on the right, the Today
  // button first (once the card has moved off today), then the card's
  // switches. The whole heading is what you hold to drag a card (it keeps
  // the class `cardhead`).
  import type { Snippet } from "svelte";
  import DateNav from "./DateNav.svelte";
  import TodayButton from "./TodayButton.svelte";
  import { fitsSlot } from "../fit.svelte";
  /** On the tablet the card's name is on a tab above its edge, so the heading leaves it out. */
  const tabbed = fitsSlot();

  type Nav = { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void };
  let { title, nav, today, tools }: { title?: string; nav?: Nav | null; today?: { show: boolean; onclick: () => void }; tools?: Snippet } = $props();
</script>

{#if nav || tools || (title && !tabbed)}
<div class="cardhead" aria-label={title}>
  {#if nav}<DateNav {...nav} />{:else if title && !tabbed}<span class="cap title">{title}</span>{:else}<span></span>{/if}
  {#if tools || (nav && today)}
    <div class="tools">
      {#if nav && today}<TodayButton show={today.show} onclick={today.onclick} />{/if}
      {#if tools}{@render tools()}{/if}
    </div>
  {/if}
</div>
{/if}

<style>
  .cardhead { flex: none; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { display: flex; align-items: center; gap: 8px; margin-left: auto; }
</style>
