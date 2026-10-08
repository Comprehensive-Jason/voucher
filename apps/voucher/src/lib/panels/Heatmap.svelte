<script lang="ts">
  // Days as a grid, a column per week from Monday, twelve weeks in view.
  // Brightest means the goal was met. Swipe back through earlier weeks as far
  // as the Ledger's first Day; Days before it and Days to come stay blank.
  import type { DayTotal } from "../types";

  let { history, goal, keyBelow = true, firstDay }: {
    history: DayTotal[]; goal: number; keyBelow?: boolean;
    /** The Ledger's first Day; Days before it are blank, not "nothing earned". */
    firstDay?: string;
  } = $props();

  const cells = $derived.by(() => {
    const out: { level: number; blank: boolean; day?: string }[] = [];
    for (const d of history) {
      const level = d.goal_met ? 4 : d.earned === 0 ? 0 : Math.min(3, 1 + Math.floor((d.earned / goal) * 3));
      out.push({ level, blank: !!firstDay && d.day < firstDay, day: d.day });
    }
    while (out.length % 7) out.push({ level: 0, blank: true });
    return out;
  });

  // Open on the latest weeks, and stay there as weeks are added, unless scrolled back.
  let scroller = $state<HTMLDivElement>();
  let atEnd = true;
  $effect(() => {
    cells.length;
    if (scroller && atEnd) scroller.scrollLeft = scroller.scrollWidth;
  });
  function onScroll() {
    if (scroller) atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
  }
</script>

<section class="card" class:wide={!keyBelow}>
  <div class="head">
    <span class="cap">Vouchers earned, 12 weeks</span>
    {#if !keyBelow}<span class="cap earn">Brightest: {goal}+ (goal met)</span>{/if}
  </div>
  <div class="scroller" bind:this={scroller} onscroll={onScroll}>
    <div class="heat">
      {#each cells as c}<div class="h h{c.level}" class:blank={c.blank} title={c.day}></div>{/each}
    </div>
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
  /* Twelve week-columns fill the visible width; earlier weeks sit off to the
     left. The columns are sized against the scroller (a size container). */
  .scroller { container-type: inline-size; overflow-x: auto; scroll-snap-type: x proximity; overscroll-behavior-x: contain; scrollbar-width: thin; scrollbar-color: var(--line) transparent; }
  .heat {
    display: grid; grid-template-rows: repeat(7, auto); grid-auto-flow: column; gap: 4px;
    grid-auto-columns: calc((100cqw - 44px) / 12); width: max-content;
  }
  .h { aspect-ratio: 1; border-radius: 4px; background: #22262a; }
  .heat .h:nth-child(7n + 1) { scroll-snap-align: start; }
  .h1 { background: #1d4d33; } .h2 { background: #24804f; } .h3 { background: #2fb36b; } .h4 { background: #3ddc84; }
  .h.blank { background: transparent; }
  .heatkey { display: flex; justify-content: space-between; align-items: center; font-size: 12px; color: var(--muted); }
  .scale { display: flex; align-items: center; gap: 4px; }
  .scale i { width: 12px; display: inline-block; }
  .wide { padding: 18px; border-radius: 18px; }
</style>
