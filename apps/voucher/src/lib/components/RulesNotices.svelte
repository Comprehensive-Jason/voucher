<script lang="ts">
  // The notices that concern all of Rules: Protection off or partly on, the
  // Loosenings waiting for the morning (one card, or a Review sheet for
  // several), and the grace period after setup. `row` lays them side by side
  // for the tablet's Rules header; otherwise they stack, as on the phone's
  // Rules and at the foot of the tablet's Today column. All three are the
  // shared .notice card (theme.css).
  import { onMount } from "svelte";
  import { fixProtection, missingProtection, protection } from "../api";
  import GraceBanner from "./GraceBanner.svelte";
  import WaitingChanges from "./WaitingChanges.svelte";
  import type { Protection } from "../types";
  import { reveal } from "../motion";
  import { POLL_MS } from "../live.svelte";

  let { row = false }: { row?: boolean } = $props();
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

<!-- Most serious first: Protection off, then the grace period (everything
     applies at once), then Loosenings waiting for the morning. -->
<div class="notices" class:row>
  {#if missing}
    <div class="notice {missing.level === 'off' ? 'danger' : 'goal'}" transition:reveal={{ axis }}>
      <div class="ntext">
        <span class="cap">{missing.title}</span>
        <span>{missing.text}</span>
      </div>
      <button class="btn small fix" onclick={() => missing && fixProtection(missing.part)}>{missing.action}</button>
    </div>
  {/if}
  <GraceBanner {axis} />
  <WaitingChanges {axis} />
</div>

<style>
  .notices { display: flex; flex-direction: column; gap: 10px; }
  .notices:not(:has(> *)) { display: none; }
  /* The tablet header: side by side, each as wide as its share. */
  .row { flex-direction: row; align-items: stretch; }
  .row > :global(*) { flex: 1 1 0; min-width: 0; }
</style>
