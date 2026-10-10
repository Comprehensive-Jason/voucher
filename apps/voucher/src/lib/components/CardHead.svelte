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

  type Nav = { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void };
  let { title, nav, today, tools }: { title?: string; nav?: Nav | null; today?: { show: boolean; onclick: () => void }; tools?: Snippet } = $props();
</script>

<div class="cardhead" aria-label={title}>
  {#if nav}<DateNav {...nav} />{:else if title}<span class="cap title">{title}</span>{:else}<span></span>{/if}
  {#if tools || (nav && today)}
    <div class="tools">
      {#if nav && today}<TodayButton show={today.show} onclick={today.onclick} />{/if}
      {#if tools}{@render tools()}{/if}
    </div>
  {/if}
</div>

<style>
  .cardhead { flex: none; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { display: flex; align-items: center; gap: 8px; margin-left: auto; }
</style>
