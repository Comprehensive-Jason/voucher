<script lang="ts">
  // The heading of every dated card: its name on top, in the same style as
  // every other card's title, and under it the date switcher, ‹ label ›. One
  // look everywhere; the card decides what a step is.
  let { label, caption, back, forward, onback, onforward }: { label: string; caption?: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void } = $props();
</script>

<div class="dated">
  {#if caption}<span class="cap title">{caption}</span>{/if}
  <div class="datenav">
    <button class="nav" aria-label="Earlier" disabled={!back} onclick={onback}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <span class="cap label">{label}</span>
    <button class="nav" aria-label="Later" disabled={!forward} onclick={onforward}>
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
    </button>
  </div>
</div>

<style>
  .dated { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
  .title { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* The left arrow's glyph lines up with the title above it. */
  .datenav { display: flex; align-items: center; margin-left: -7px; min-width: 0; }
  .nav { flex: none; width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 6px; background: none; color: var(--muted); cursor: pointer; transition: opacity var(--t-base), color var(--t-base); }
  .nav:disabled { opacity: .3; cursor: default; }
  .nav:not(:disabled):active { color: var(--ink); }
  .label { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 2px; }
</style>
