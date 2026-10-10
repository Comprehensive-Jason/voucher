<script lang="ts">
  import type { Mode } from "../types";
  import { wins } from "../celebrate.svelte";
  import { untrack } from "svelte";
  import { MOTION } from "../motion";
  import StreakPill from "./StreakPill.svelte";
  // The Bank, then today's progress toward the Daily goal with the Streak it feeds.
  let { mode, bank, limit, goalDone, goalTarget, streakDays }: {
    mode: Mode; bank: number; limit: number; goalDone: number; goalTarget: number; streakDays: number;
  } = $props();
  // Vouchers just earned are counted when their row says "+1 Voucher".
  const shown = $derived(Math.max(0, bank - wins.held));
  const cells = $derived(Array.from({ length: limit }, (_, i) => i < shown));
  // The count pops when it goes up.
  let pop = $state(false);
  let last = untrack(() => shown);
  // Cells fill from the left as Vouchers land and drain as they're torn, one
  // after another when several change at once: the nearest to the edge first.
  let from = $state(untrack(() => shown));
  $effect(() => {
    const now = shown;
    untrack(() => {
      if (now > last) { pop = false; requestAnimationFrame(() => (pop = true)); }
      from = last;
      last = now;
    });
  });
  const STAGGER_MS = MOTION.stagger;
  const delayOf = (i: number) => (shown > from ? (i - from) * STAGGER_MS : shown < from ? (from - 1 - i) * STAGGER_MS : 0);
  const toGo = $derived(Math.max(0, goalTarget - goalDone));
</script>

<section>
  <div class="count">
    <span class="mono big" class:pop class:lit={wins.lit > 0 && mode !== "curfew"} class:full={mode === "full"} class:night={mode === "curfew"} class:empty={mode === "empty"} onanimationend={() => (pop = false)}>{shown}</span>
    <span class="of">of {limit} in the Bank{mode === "full" ? ": full" : ""}</span>
  </div>
  <div class="cells" style="grid-template-columns: repeat({limit}, minmax(0, 1fr))">
    {#each cells as on, i}
      <i><b class:on class:full={mode === "full"} class:night={mode === "curfew"} style="transition-delay: {delayOf(i)}ms"></b></i>
    {/each}
  </div>
  <div class="goal">
    {#if toGo === 0}
      <span class="what">Daily goal met: {goalDone} of {goalTarget}</span>
    {:else}
      <span class="what">Daily goal: {goalDone} of {goalTarget}</span><span class="mono">{toGo} to go</span>
    {/if}
    <StreakPill days={streakDays} />
  </div>
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .big { font-size: 56px; font-weight: 700; line-height: 1; display: inline-block; transform-origin: left bottom; }
  /* Green for as long as a row says "+1 Voucher", with a pop as it lands. */
  .big { transition: color var(--t-base) ease; }
  .big.pop { animation: pop var(--t-move) var(--ease-out); }
  @keyframes pop { 40% { transform: scale(1.18); } }
  .big.full { color: var(--goal); }
  .big.night { color: var(--night-ink); }
  .big.empty { color: var(--muted); }
  /* After the colours above, so a Voucher landing shows green even as it fills the Bank. */
  .big.lit { color: var(--voucher); }
  .of { font-size: 15px; color: var(--muted); }
  .cells { display: grid; gap: 3px; }
  .cells i { height: 14px; border-radius: 3px; background: var(--line); overflow: hidden; }
  /* Each cell's colour grows in from the left when a Voucher lands, and
     shrinks back to the left when one is torn. */
  .cells b { display: block; height: 100%; background: var(--voucher); transform: scaleX(0); transform-origin: left; transition: transform var(--t-move) var(--ease-out), background-color var(--t-base); }
  .cells b.on { transform: scaleX(1); }
  .cells b.full { background: var(--goal); }
  .cells b.night { background: var(--night); }
  .goal { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--goal); }
  .what { flex: 1; min-width: 0; }
</style>
