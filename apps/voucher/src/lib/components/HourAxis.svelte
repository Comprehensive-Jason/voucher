<script lang="ts">
  // The hours under an hour-by-hour grid (06 to 03, every third hour), the
  // same on every card: Curfew's hours in the night colour. It sits outside
  // any scroller. `lead` is a first, empty column, and `gap` separates every
  // column (after `lead` too), so lead + gap is the distance from a row's
  // start to its first cell: 44 for 44px labels with a 2px gap, 90 for 84px
  // labels with an 8px gap.
  import { inCurfew } from "../curfew.svelte";
  let { lead, gap = 2 }: { lead: number; gap?: number } = $props();
  /** Column c is the clock hour c after the Day starts at 06:00. */
  const hourOf = (c: number) => (c + 6) % 24;
</script>

<div class="hours" style="grid-template-columns: {lead}px repeat(24, minmax(0, 1fr)); column-gap: {gap}px" aria-hidden="true">
  <span></span>{#each Array(24) as _, c}<span class:night={inCurfew(hourOf(c))}>{c % 3 === 0 ? String(hourOf(c)).padStart(2, "0") : ""}</span>{/each}
</div>

<style>
  .hours { display: grid; }
  span { font: 500 10px var(--mono); color: var(--muted); white-space: nowrap; }
  span.night { color: #7d8cff; }
</style>
