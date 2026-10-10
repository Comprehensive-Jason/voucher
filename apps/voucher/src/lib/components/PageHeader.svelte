<script lang="ts">
  // The top of a page: an optional back button, the title, and whatever the
  // page puts on the right (a tag, a switch, notices). One title size and one
  // top padding on every page, so titles never jump between pages; the page
  // sets the side padding. Put it first in the page's <main> and give <main>
  // no top padding of its own.
  //
  //   <PageHeader title="Protection" back="/rules" backLabel="Back to Rules" />
  //   <PageHeader title="Rules" back={() => goto("/")} backIcon="down">…right side…</PageHeader>
  import type { Snippet } from "svelte";
  import { goto } from "$app/navigation";

  let { title, back, backLabel = "Back", backIcon = "left", children }: {
    title: string;
    /** Where Back goes: a path, or a function for anything else. No back button without it. */
    back?: string | (() => void);
    /** What a screen reader says for Back ("Back to Rules"). */
    backLabel?: string;
    /** "left" for a page over another; "down" for a sheet that lowers (Rules over Today on the tablet). */
    backIcon?: "left" | "down";
    /** The right side, after the title: it takes the rest of the row and lines up on the right. */
    children?: Snippet;
  } = $props();

  function goBack() {
    if (typeof back === "string") goto(back);
    else back?.();
  }
</script>

<header class="pagehead" class:hasback={!!back}>
  {#if back}
    <button class="iconbtn back" aria-label={backLabel} onclick={goBack}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={backIcon === "down" ? "M6 9l6 6 6-6" : "M15 6l-6 6 6 6"} /></svg>
    </button>
  {/if}
  <h1>{title}</h1>
  {#if children}<div class="right">{@render children()}</div>{/if}
</header>

<style>
  .pagehead { flex: none; display: flex; align-items: center; gap: 4px; min-height: 44px; padding-top: calc(16px + env(safe-area-inset-top)); }
  /* Back is outlined like every icon button, its edge on the page's left edge. */
  .pagehead.hasback { gap: 12px; }
  .pagehead .back { flex: none; color: var(--ink); }
  h1 { flex: 0 1 auto; min-width: 0; margin: 0; font: 700 22px/1.2 var(--font); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .right { flex: 1; min-width: 0; display: flex; align-items: center; justify-content: flex-end; gap: 12px; padding-left: 12px; }
</style>
