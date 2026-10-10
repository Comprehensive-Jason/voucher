<script lang="ts">
  // When I hit a blocked app, how often do I turn back? The last 20 times
  // as dots (green: walked away; grey: unlocked), since counts of things
  // are easier to feel than rates, and the last 7 Days as bars of opens with
  // the walked-away part filled.
  import TrendCard from "../../components/TrendCard.svelte";
  import type { DayTotal } from "../../types";
  import { fitsSlot } from "../../fit.svelte";
  const fit = fitsSlot();

  let { history }: { history: DayTotal[] } = $props();
  const days = $derived(history.filter((d) => d.opens));
  // The last 20 opens, newest Days first; within a Day, which ones were walked
  // away from isn't kept, so each Day's walk-aways lead.
  const last20 = $derived.by(() => {
    const out: boolean[] = [];
    for (const d of [...days].reverse()) {
      const walked = Math.min(d.walked ?? 0, d.opens!);
      for (let i = 0; i < d.opens! && out.length < 20; i++) out.push(i < walked);
      if (out.length >= 20) break;
    }
    return out.reverse();
  });
  const walkedOf20 = $derived(last20.filter(Boolean).length);
  const week = $derived(history.slice(-7));
  const most = $derived(Math.max(1, ...week.map((d) => d.opens ?? 0)));
  const DAY = ["M", "T", "W", "T", "F", "S", "S"];
</script>

<TrendCard title="Walk-away wins">
  {#if !days.length}
    <p class="empty">Blocked opens show here once the phone reports them.</p>
  {:else}
    <div class="dots" role="img" aria-label="{walkedOf20} of the last {last20.length} blocked opens walked away from">
      {#each last20 as w}<i class:won={w}></i>{/each}
    </div>
    <div class="week" class:fit>
      {#each week as d}
        <div class="day" title="{d.day}: {d.walked ?? 0} of {d.opens ?? 0} walked away">
          <div class="bar" style="height: {((d.opens ?? 0) / most) * 100}%"><i style="height: {d.opens ? ((d.walked ?? 0) / d.opens) * 100 : 0}%"></i></div>
          <span>{DAY[(new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7]}</span>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet foot()}
    {#if last20.length}<b>{walkedOf20} of the last {last20.length}</b> times you hit a blocked app, you walked away.{:else}Not enough history yet.{/if}
  {/snippet}
</TrendCard>

<style>
  .dots { display: grid; grid-template-columns: repeat(10, 1fr); gap: 6px; max-width: 320px; }
  .dots i { aspect-ratio: 1; border-radius: 50%; background: #3a3f45; }
  .dots i.won { background: var(--voucher); }
  .week { height: 70px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 6px; align-items: end; }
  .week.fit { flex: 1; min-height: 54px; height: auto; }
  .day { height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; gap: 4px; }
  .bar { width: 60%; border-radius: 3px 3px 0 0; background: #3a3f45; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; min-height: 2px; }
  .bar i { display: block; background: var(--voucher); }
  .day span { font: 500 10px var(--mono); color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
