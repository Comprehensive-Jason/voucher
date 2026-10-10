<script lang="ts">
  // The phone's tab bar: Today, Trends, and Rules. While Trends is open its
  // tab grows into a pill holding the page selector (1, 2, 3 ...), with the
  // tablet page bar's sliding highlight: its leading edge goes first and the
  // trailing edge follows, and a tap jumps straight to the page. Swiping the
  // pages moves it too (phonepages.svelte.ts).
  import { phonePages } from "../phonepages.svelte";
  // "log" is still accepted from the layout, though the Log is now a card among Trends' pages.
  let { active }: { active: "today" | "trends" | "log" | "rules" } = $props();
  const tabs = [
    { id: "today", href: "/", label: "Today", path: "M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" },
    { id: "trends", href: "/trends", label: "Trends", path: "M5 20V11M12 20V4M19 20v-6" },
    { id: "rules", href: "/rules", label: "Rules", path: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" },
  ] as const;
  const paging = $derived(active === "trends");
  const n = $derived(phonePages.count);
</script>

<nav class:paging>
  {#each tabs as t (t.id)}
    <!-- One box per tab, so Trends' can grow (and the others give way) smoothly. -->
    <div class="tab" class:grow={t.id === "trends" && paging}>
      {#if t.id === "trends" && paging}
        <div class="pages" role="tablist" aria-label="Pages of charts">
          <div class="track">
            <!-- One highlight behind the numbers, stretching over both pages while a swipe sits across two. -->
            <span class="thumb" class:right={phonePages.right} style="left: {(phonePages.a / n) * 100}%; right: {((n - 1 - phonePages.b) / n) * 100}%"></span>
            {#each Array(n) as _, i (i)}
              {@const on = i >= phonePages.a && i <= phonePages.b}
              <button role="tab" aria-selected={on} aria-label="Page {i + 1}" class:on onclick={() => phonePages.go?.(i)}>{i + 1}</button>
            {/each}
          </div>
        </div>
      {:else}
        <a href={t.href} class:on={t.id === active} aria-current={t.id === active ? "page" : undefined}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={t.path} /></svg>
          {t.label}
        </a>
      {/if}
    </div>
  {/each}
</nav>

<style>
  nav { display: flex; align-items: center; gap: 4px; border-top: 1px solid var(--divider); padding: 4px 8px calc(10px + env(safe-area-inset-bottom)); }
  .tab { flex: 1 1 0; min-width: 0; min-height: 48px; display: flex; align-items: center; transition: flex-grow var(--t-move) var(--ease-out); }
  /* Trends' tab takes the room the page numbers need. */
  .tab.grow { flex-grow: 3.2; }
  .pages { animation: pagesin var(--t-base) var(--ease-out); }
  @keyframes pagesin { from { opacity: 0; } }
  a { flex: 1; align-self: stretch; text-decoration: none; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: none; border: 0; color: var(--muted); font: 500 12px var(--font); transition: color var(--t-quick); }
  /* The highlight fades from tab to tab, as ZoomSwitch's does. */
  a.on { color: var(--voucher); }
  .pages { width: 100%; padding: 3px; border-radius: 999px; background: var(--raised); border: 1px solid var(--line); }
  /* The numbers share the track evenly, so the highlight's edges sit at whole fractions of it. */
  .track { position: relative; display: flex; }
  .thumb { position: absolute; top: 0; bottom: 0; border-radius: 999px; background: var(--line); transition: left var(--t-move) var(--ease-out), right var(--t-move) var(--ease-out) 90ms; }
  /* The edge on the side it's heading leads; the far edge follows a beat later, in one stretch and shrink. */
  .thumb.right { transition: right var(--t-move) var(--ease-out), left var(--t-move) var(--ease-out) 90ms; }
  .pages button { position: relative; flex: 1 1 0; min-width: 0; height: 34px; padding: 0; border: 0; border-radius: 999px; background: none; color: var(--muted); font: 700 13px var(--mono); cursor: pointer; transition: color var(--t-base); }
  .pages button.on { color: var(--ink); }
</style>
