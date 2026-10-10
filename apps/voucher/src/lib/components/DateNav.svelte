<script lang="ts">
  // The date switcher every dated card starts its header with, in place of a
  // title: ‹ label ›. One look everywhere; the card decides what a step is.
  let { label, back, forward, onback, onforward }: { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void } = $props();
</script>

<div class="datenav">
  <button class="nav" aria-label="Earlier" disabled={!back} onclick={onback}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  </button>
  <span class="cap label">{label}</span>
  <button class="nav" aria-label="Later" disabled={!forward} onclick={onforward}>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
</div>

<style>
  /* The left arrow sits at the card's edge, where the title would start. */
  .datenav { display: flex; align-items: center; margin-left: -8px; min-width: 0; }
  .nav { flex: none; width: 32px; height: 32px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 8px; background: none; color: var(--muted); cursor: pointer; transition: opacity var(--t-base), color var(--t-base); }
  .nav:disabled { opacity: .3; cursor: default; }
  .nav:not(:disabled):active { color: var(--ink); }
  .label { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
</style>
