<script lang="ts">
  // Back to today, for a view that has moved to another Day or scrolled back
  // in time. Fades in when it's needed, and out once you're back.
  import { fade } from "svelte/transition";
  import { ms } from "../motion";
  let { show, onclick }: { show: boolean; onclick: () => void } = $props();
</script>

{#if show}
  <button class="today" aria-label="Back to today" {onclick} transition:fade={{ duration: ms("base") }}>
    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-5-5 5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></svg>
    <span class="word">Today</span>
  </button>
{/if}

<style>
  .today { flex: none; height: 28px; padding: 0 10px 0 8px; border-radius: 999px; border: 1px solid var(--unlocked-line); background: var(--unlocked-bg); color: var(--voucher); font: 700 12px var(--font); display: flex; align-items: center; gap: 5px; cursor: pointer; }
  /* In a narrow card's header (a container named "card"), only the arrow shows. */
  @container card (max-width: 400px) { .word { display: none; } .today { padding: 0 8px; } }
  .today:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
</style>
