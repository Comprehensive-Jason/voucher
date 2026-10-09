<script lang="ts">
  import type { Mode } from "../types";
  import { wins } from "../celebrate.svelte";
  import { untrack } from "svelte";
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
  $effect(() => {
    const now = shown;
    if (now > last) { pop = false; requestAnimationFrame(() => (pop = true)); }
    last = now;
  });
  const toGo = $derived(Math.max(0, goalTarget - goalDone));
</script>

<section>
  <div class="count">
    <span class="mono big" class:pop class:full={mode === "full"} class:night={mode === "curfew"} class:empty={mode === "empty"} onanimationend={() => (pop = false)}>{shown}</span>
    <span class="of">of {limit} in the Bank{mode === "full" ? ": full" : ""}</span>
  </div>
  <div class="cells" style="grid-template-columns: repeat({limit}, minmax(0, 1fr))">
    {#each cells as on}
      <i class:on class:full={mode === "full"} class:night={mode === "curfew"}></i>
    {/each}
  </div>
  <div class="goal">
    {#if toGo === 0}
      <span class="what">Today's goal met: {goalDone} of {goalTarget}</span>
    {:else}
      <span class="what">Today's goal: {goalDone} of {goalTarget}</span><span class="mono">{toGo} to go</span>
    {/if}
    <span class="streak">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
      {streakDays > 0 ? `${streakDays} day streak` : "No streak"}
    </span>
  </div>
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .big { font-size: 56px; font-weight: 700; line-height: 1; display: inline-block; transform-origin: left bottom; }
  .big.pop { animation: pop .45s ease; }
  @keyframes pop { 40% { transform: scale(1.18); color: var(--voucher); } }
  .big.full { color: var(--goal); }
  .big.night { color: var(--night-ink); }
  .big.empty { color: var(--muted); }
  .of { font-size: 15px; color: var(--muted); }
  .cells { display: grid; gap: 3px; }
  .cells i { height: 14px; border-radius: 3px; background: var(--line); }
  .cells i.on { background: var(--voucher); }
  .cells i.on.full { background: var(--goal); }
  .cells i.on.night { background: var(--night); }
  .goal { display: flex; align-items: center; gap: 10px; font-size: 13px; color: var(--goal); }
  .what { flex: 1; min-width: 0; }
  .streak { display: flex; align-items: center; gap: 5px; padding: 3px 9px; border-radius: 999px; background: var(--goal-bg); font-size: 12px; font-weight: 700; white-space: nowrap; }
</style>
