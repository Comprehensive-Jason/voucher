<script lang="ts">
  // The short message at the spot ($core/toast.svelte.ts): the danger notice's
  // look, compact, by what was tapped: above it, or below when there's no
  // room above. With nothing to point at it sits at the bottom centre, just
  // above the tab bar. It fades after HOLD_MS; a tap takes it down sooner.
  // Mounted once, in the layout, after the screens and before the tab bar.
  import { dismiss, toast } from "../toast.svelte";
  import { HOLD_MS, reveal } from "../motion";

  /** The gap between the bubble and what it points at, and its least margin from the screen's edges. */
  const GAP = 8;
  const EDGE = 16;

  $effect(() => {
    const id = toast.current?.id;
    if (!id) return;
    const timer = setTimeout(() => dismiss(id), HOLD_MS);
    return () => clearTimeout(timer);
  });

  /** Places the bubble by its anchor, as it appears, so it never shows elsewhere first. */
  function place(node: HTMLElement, anchor: Element) {
    const r = anchor.getBoundingClientRect();
    const w = node.offsetWidth, h = node.offsetHeight;
    const left = Math.min(Math.max(r.left + r.width / 2 - w / 2, EDGE), innerWidth - w - EDGE);
    const top = r.top - GAP - h >= EDGE ? r.top - GAP - h : Math.min(r.bottom + GAP, innerHeight - h - EDGE);
    node.style.left = `${left}px`;
    node.style.top = `${top}px`;
  }
</script>

<div class="dock" role="status" aria-live="polite">
  {#key toast.current?.id}
    {#if toast.current}
      {@const t = toast.current}
      {#if t.anchor}
        <button class="notice danger toast pinned" title={t.detail} use:place={t.anchor} onclick={() => dismiss(t.id)} transition:reveal={{ axis: "x" }}>
          <span class="ntext">{#if t.cap}<span class="cap">{t.cap}</span>{/if}<span>{t.text}</span></span>
        </button>
      {:else}
        <button class="notice danger toast docked" title={t.detail} onclick={() => dismiss(t.id)} transition:reveal={{ axis: "x" }}>
          <span class="ntext">{#if t.cap}<span class="cap">{t.cap}</span>{/if}<span>{t.text}</span></span>
        </button>
      {/if}
    {/if}
  {/key}
</div>

<style>
  /* A line with no height at the foot of the screen, just above the tab bar,
     for a bubble with nothing to point at. Above sheets and their scrim. */
  .dock { position: relative; flex: none; height: 0; margin-top: auto; z-index: 20; }
  /* The shared .notice, compact: one or two short lines, sized to its words. */
  .toast { width: max-content; max-width: min(340px, calc(100vw - 32px)); padding: 8px 14px; border-radius: 12px; font: inherit; text-align: left; cursor: pointer; box-shadow: 0 6px 20px var(--shadow); }
  .toast .ntext { font-size: 13.5px; gap: 2px; text-wrap: balance; }
  .pinned { position: fixed; }
  .docked { position: absolute; bottom: 12px; left: 50%; translate: -50% 0; }
</style>
