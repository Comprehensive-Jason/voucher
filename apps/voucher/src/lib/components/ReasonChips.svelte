<script lang="ts">
  // "Why now?", just after an Unlock from this screen: one optional tap that
  // Trends' Why you unlock card counts. It goes after a minute and a half if
  // ignored, and a tap shows "Kept" before it goes. Unlocks from the phone's
  // notification, tile, or widget ask the same in a notification instead.
  import { slide, fade } from "svelte/transition";
  import { easeOut, ms } from "../motion";
  import { REASONS, giveReason } from "../notes.svelte";

  let { tornAt }: { tornAt: number } = $props();
  let open = $state(false);
  let picked = $state<string | null>(null);
  let timer: ReturnType<typeof setTimeout> | undefined;

  $effect(() => {
    if (!tornAt) return;
    open = true; picked = null;
    clearTimeout(timer);
    timer = setTimeout(() => (open = false), 90_000);
    return () => clearTimeout(timer);
  });

  async function pick(reason: string) {
    picked = reason;
    try { await giveReason(reason); } catch { /* optional; nothing to redo */ }
    clearTimeout(timer);
    timer = setTimeout(() => (open = false), 1200);
  }
</script>

{#if open}
  <div class="why" transition:slide={{ duration: ms("move"), easing: easeOut }}>
    <div class="inner">
      <span class="cap q">{picked ? "Kept" : "Why now?"}</span>
      <div class="chips">
        {#each REASONS as r (r)}
          <button class:on={picked === r} disabled={picked !== null && picked !== r} onclick={() => pick(r)}>{r}</button>
        {/each}
      </div>
      {#if !picked}<button class="skip" aria-label="Skip" in:fade={{ duration: ms("base") }} onclick={() => (open = false)}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
      </button>{/if}
    </div>
  </div>
{/if}

<style>
  .inner { position: relative; display: flex; flex-direction: column; gap: 8px; padding: 12px 40px 12px 14px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .q { color: var(--muted); }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chips button { height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 600 13px var(--font); cursor: pointer; transition: background-color var(--t-base), color var(--t-base), opacity var(--t-base), scale var(--t-quick) var(--ease-out); }
  .chips button:active { scale: .94; }
  .chips button.on { background: var(--ink); color: #0e0f11; }
  .chips button:disabled:not(.on) { opacity: .35; }
  .skip { position: absolute; top: 8px; right: 8px; width: 28px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
</style>
