<script lang="ts">
  // The notices that concern all of Rules: Protection off or partly on, the
  // Loosenings waiting for the morning (one card, or a Review sheet for
  // several), and the grace period after setup. `row` lays them side by side
  // for the tablet's Rules header; otherwise they stack, as on the phone's
  // Rules. `compact` stacks them with each warning on one line, its fix
  // beside it, for the foot of the tablet's Today column.
  import { onMount } from "svelte";
  import { fixProtection, missingProtection, protection } from "../api";
  import GraceBanner from "./GraceBanner.svelte";
  import WaitingChanges from "./WaitingChanges.svelte";
  import type { Protection } from "../types";
  import { reveal } from "../motion";
  import { POLL_MS } from "../live.svelte";

  let { row = false, compact = false }: { row?: boolean; compact?: boolean } = $props();
  /** Notices open out in a column, and fade in place in a row. */
  const axis = $derived(row ? "x" as const : "y" as const);

  let guard = $state<Protection | null>(null);
  const missing = $derived(missingProtection(guard));

  onMount(() => {
    const check = () => protection().then((g) => (guard = g));
    check();
    // Today's column stays open for days, so look again on its poll.
    const poll = setInterval(check, POLL_MS);
    return () => clearInterval(poll);
  });
</script>

<div class="notices" class:row class:compact>
  {#if missing}
    <div class="warn {missing.level}" transition:reveal={{ axis }}>
      <div class="warnbody">
      <div class="warnhead">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M12 8v5M12 16v.01" /></svg>
        <span>{missing.title}</span>
      </div>
      <div class="warntext">{missing.text}</div>
      </div>
      <button class="btn fix" class:small={row || compact} onclick={() => missing && fixProtection(missing.part)}>{missing.action}</button>
    </div>
  {/if}

  <WaitingChanges {axis} />
  <GraceBanner {axis} />
</div>

<style>
  .notices { display: flex; flex-direction: column; gap: 10px; }
  .notices:not(:has(> *)) { display: none; }
  /* The tablet header: side by side, each as wide as its share. */
  .row { flex-direction: row; align-items: stretch; }
  .row > :global(*) { flex: 1 1 0; min-width: 0; }
  .row .warn, .compact .warn { flex-direction: row; align-items: center; gap: 12px; padding: 10px 12px 10px 16px; }
  .row .warn .warnbody, .compact .warn .warnbody { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .row .warn .warntext, .compact .warn .warntext { font-size: 13px; }
  .warnbody { display: flex; flex-direction: column; gap: 10px; }
  .warn { border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .warn.off { background: var(--danger-bg); border: 1px solid var(--danger-line); --tone: var(--danger); }
  .warn.partial { background: var(--goal-bg); border: 1px solid var(--goal-line); --tone: var(--goal); }
  .warnhead { display: flex; align-items: center; gap: 10px; color: var(--tone); font-size: 16px; font-weight: 700; }
  .warntext { font-size: 14px; line-height: 1.4; }
  /* The fix, in the warning's own color. */
  .warn .fix { flex: none; border-color: transparent; background: var(--tone); color: var(--ground); }
</style>
