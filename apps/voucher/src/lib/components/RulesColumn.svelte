<script lang="ts">
  // The frame for one Rules panel. On the tablet (`column`) the panels sit
  // side by side, each under a title that stays put while only its body
  // scrolls, so the title never moves or bounces with the list. On the phone
  // the tabs already name the panel, so it's the body alone, in the page's
  // own scroll. Every panel's rows sit the same distance apart. `count`
  // ("3 on") sits at the right end of the tablet title's line; on the phone, with no title, it
  // opens the body as "Sources · 3 on" (`label` names what's counted there).
  import type { Snippet } from "svelte";

  let { title, count, label = title, column = false, children }: {
    title: string; count?: string; label?: string; column?: boolean; children: Snippet;
  } = $props();
</script>

{#if column}
  <section class="column" aria-label={title}>
    <h2>{title}{#if count}<span class="cap count">{count}</span>{/if}</h2>
    <div class="body">{@render children()}</div>
  </section>
{:else}
  <div class="body">{#if count}<span class="cap">{label} · {count}</span>{/if}{@render children()}</div>
{/if}

<style>
  .column { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: 12px; }
  h2 { flex: none; margin: 0; font: 700 18px/24px var(--font); display: flex; align-items: baseline; justify-content: space-between; gap: 10px; }
  .body { display: flex; flex-direction: column; gap: 10px; }
  .column .body { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; padding-bottom: 28px; scrollbar-width: none; }
  .column .body::-webkit-scrollbar { display: none; }
  /* Rows keep their size; the body scrolls instead of squeezing them. */
  .column .body > :global(*) { flex-shrink: 0; }
</style>
