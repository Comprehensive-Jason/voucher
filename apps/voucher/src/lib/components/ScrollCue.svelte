<script lang="ts">
  // "↑ N above" and "↓ N below" over a scrolling list: how many of its rows
  // are out of view each way. Tap one to go to that end. Put it in a
  // positioned box around the list; the list itself must be positioned too,
  // so its rows' offsets are measured from its top.
  import { MOTION } from "../motion";
  let { target }: { target: HTMLElement | undefined } = $props();

  let above = $state(0);
  let below = $state(0);
  function measure() {
    if (!target) return;
    const top = target.scrollTop, bottom = top + target.clientHeight;
    const rows = [...target.children] as HTMLElement[];
    above = top < 2 ? 0 : rows.filter((el) => el.offsetTop + el.offsetHeight <= top + 6).length;
    below = bottom >= target.scrollHeight - 2 ? 0 : rows.filter((el) => el.offsetTop >= bottom - 6).length;
  }
  $effect(() => {
    const el = target;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    // Rows come, go, grow, and move (a sort's slide ends after the change).
    const resized = new ResizeObserver(measure);
    resized.observe(el);
    const changed = new MutationObserver(() => { measure(); setTimeout(measure, MOTION.move + 20); });
    changed.observe(el, { childList: true });
    return () => { el.removeEventListener("scroll", measure); resized.disconnect(); changed.disconnect(); };
  });
</script>

<button class="cue top" class:on={above > 0} tabindex={above > 0 ? 0 : -1} aria-hidden={above === 0} onclick={() => target?.scrollTo({ top: 0, behavior: "smooth" })}>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5M6 11l6-6 6 6" /></svg>
  {above} above
</button>
<button class="cue bottom" class:on={below > 0} tabindex={below > 0 ? 0 : -1} aria-hidden={below === 0} onclick={() => target?.scrollTo({ top: target.scrollHeight, behavior: "smooth" })}>
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M6 13l6 6 6-6" /></svg>
  {below} below
</button>

<style>
  .cue { position: absolute; left: 50%; z-index: 5; height: 26px; padding: 0 11px; border-radius: 999px; border: 1px solid var(--line); background: var(--raised); box-shadow: 0 4px 14px rgba(0, 0, 0, .5); color: var(--ink); font: 700 12px var(--font); display: flex; align-items: center; gap: 6px; cursor: pointer; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity var(--t-base), transform var(--t-base) var(--ease-out); }
  .top { top: 4px; transform: translate(-50%, -6px); }
  .bottom { bottom: 4px; transform: translate(-50%, 6px); }
  .cue.on { opacity: 1; pointer-events: auto; transform: translate(-50%, 0); }
  .cue:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
</style>
