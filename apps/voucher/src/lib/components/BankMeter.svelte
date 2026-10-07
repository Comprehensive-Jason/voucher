<script lang="ts">
  import type { Mode } from "../types";
  let { mode, bank, limit, goalDone, goalTarget }: {
    mode: Mode; bank: number; limit: number; goalDone: number; goalTarget: number;
  } = $props();
  const cells = $derived(Array.from({ length: limit }, (_, i) => i < bank));
  const toGo = $derived(Math.max(0, goalTarget - goalDone));
</script>

<section>
  <div class="count">
    <span class="mono big" class:full={mode === "full"} class:night={mode === "curfew"} class:empty={mode === "empty"}>{bank}</span>
    <span class="of">of {limit} in the Bank{mode === "full" ? ": full" : ""}</span>
  </div>
  <div class="cells" style="grid-template-columns: repeat({limit}, minmax(0, 1fr))">
    {#each cells as on}
      <i class:on class:full={mode === "full"} class:night={mode === "curfew"}></i>
    {/each}
  </div>
  <div class="goal">
    {#if toGo === 0}
      <span>Today {goalDone} of {goalTarget}: goal met</span><span class="mono">streak +1</span>
    {:else}
      <span>Today {goalDone} of {goalTarget} toward your goal</span><span class="mono">{toGo} to go</span>
    {/if}
  </div>
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .big { font-size: 56px; font-weight: 700; line-height: 1; }
  .big.full { color: var(--goal); }
  .big.night { color: var(--night-ink); }
  .big.empty { color: var(--muted); }
  .of { font-size: 15px; color: var(--muted); }
  .cells { display: grid; gap: 3px; }
  .cells i { height: 14px; border-radius: 3px; background: var(--line); }
  .cells i.on { background: var(--voucher); }
  .cells i.on.full { background: var(--goal); }
  .cells i.on.night { background: var(--night); }
  .goal { display: flex; justify-content: space-between; font-size: 13px; color: var(--goal); }
</style>
