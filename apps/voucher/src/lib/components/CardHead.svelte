<script lang="ts">
  // Every tile's heading, the same everywhere. The top line is the title on
  // the left and the card's switches on the right, so titles and switches
  // line up across a row of cards. A dated card adds a second line: its date
  // switcher on the left and, once it has moved off today, the Today button
  // on the right, the two as matching pills. The whole heading is what you
  // hold to drag a card (it keeps the class `cardhead`).
  import type { Snippet } from "svelte";
  import DateNav from "./DateNav.svelte";
  import TodayButton from "./TodayButton.svelte";

  type Nav = { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void };
  let { title, nav, today, tools }: { title?: string; nav?: Nav | null; today?: { show: boolean; onclick: () => void }; tools?: Snippet } = $props();
</script>

<div class="cardhead" class:dated={!!nav}>
  {#if title || tools}
    <div class="line">
      {#if title}<span class="cap title">{title}</span>{:else}<span></span>{/if}
      {#if tools}<div class="tools">{@render tools()}</div>{/if}
    </div>
  {/if}
  {#if nav}
    <div class="line">
      <DateNav {...nav} />
      {#if today}<TodayButton show={today.show} onclick={today.onclick} />{/if}
    </div>
  {/if}
</div>

<style>
  .cardhead.dated { flex-direction: column; align-items: stretch; gap: 8px; }
  .cardhead { flex: none; }
  .line { display: flex; align-items: center; justify-content: space-between; gap: 8px; min-height: 32px; min-width: 0; }
  .cardhead:not(.dated) .line { flex: 1; }
  .dated .line + .line { min-height: 28px; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .tools { display: flex; align-items: center; gap: 8px; margin-left: auto; }
</style>
