<script lang="ts">
  // The date switcher, ‹ label ›, as a pill the same height and shape as the
  // Today button beside it (the two are a pair). One look everywhere; the
  // card decides what a step is.
  let { label, back, forward, onback, onforward }: { label: string; back: boolean; forward: boolean; onback: () => void; onforward: () => void } = $props();
</script>

<div class="datenav">
  <button class="nav" aria-label="Earlier" disabled={!back} onclick={onback}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
  </button>
  <span class="label">{label}</span>
  <button class="nav" aria-label="Later" disabled={!forward} onclick={onforward}>
    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
</div>

<style>
  .datenav { flex: none; display: inline-flex; align-items: center; height: 28px; padding: 0 2px; border-radius: 999px; border: 1px solid var(--line); background: var(--raised); min-width: 0; max-width: 100%; }
  .nav { flex: none; width: 24px; height: 24px; padding: 0; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: none; color: var(--muted); cursor: pointer; transition: opacity var(--t-base), color var(--t-base), background-color var(--t-base); }
  .nav:disabled { opacity: .3; cursor: default; }
  .nav:not(:disabled):active { color: var(--ink); background: #2c3036; }
  /* The Today pill's type, so the pair reads as one set. */
  .label { font: 700 12px var(--font); color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; padding: 0 4px; }
</style>
