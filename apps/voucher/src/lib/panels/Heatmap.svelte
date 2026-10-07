<script lang="ts">
  // Twelve weeks of Days, a column per week from Monday. Brightest means the
  // goal was met; days still to come stay blank.
  import type { DayTotal } from "../types";

  let { history, goal, keyBelow = true }: { history: DayTotal[]; goal: number; keyBelow?: boolean } = $props();

  const cells = $derived.by(() => {
    const out: { level: number; future: boolean; day?: string }[] = [];
    for (const d of history) {
      const level = d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3));
      out.push({ level, future: false, day: d.day });
    }
    while (out.length % 7) out.push({ level: 0, future: true });
    return out;
  });
</script>

<section class="card" class:wide={!keyBelow}>
  <div class="head">
    <span class="cap">Vouchers earned, 12 weeks</span>
    {#if !keyBelow}<span class="cap earn">Brightest: {goal}+ (goal met)</span>{/if}
  </div>
  <div class="heat">
    {#each cells as c}<div class="h h{c.level}" class:future={c.future} title={c.day}></div>{/each}
  </div>
  {#if keyBelow}
    <div class="heatkey">
      <span class="scale">Fewer<i class="h"></i><i class="h h1"></i><i class="h h2"></i><i class="h h3"></i><i class="h h4"></i>More</span>
      <span>Brightest: {goal}+, goal met</span>
    </div>
  {/if}
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; gap: 12px; flex-wrap: wrap; }
  .earn { color: var(--voucher); }
  .heat { display: grid; grid-template-columns: repeat(12, minmax(0, 1fr)); grid-template-rows: repeat(7, auto); grid-auto-flow: column; gap: 4px; }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: #3ddc84; }
  .h.future { background: transparent; }
  .heatkey { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
  .scale { display: flex; align-items: center; gap: 4px; }
  .scale i { width: 12px; display: inline-block; }
  .wide { padding: 18px; border-radius: 18px; }
</style>
