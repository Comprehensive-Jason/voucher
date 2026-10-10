<script lang="ts">
  // What pulls me? The reasons tapped after Unlocks ("Why now?") over the
  // last four weeks, most common first, and the top one for each part of the
  // Day, so a pattern (bored afternoons, tired evenings) shows. A reason
  // turns an Unlock from a lapse into information. The line under it names
  // the most common one.
  import TrendCard from "../../components/TrendCard.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const all = $derived(history.slice(-28).flatMap((d) => d.reasons ?? []));
  const name = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
  const counts = $derived.by(() => {
    const m = new Map<string, number>();
    for (const [, r] of all) m.set(r, (m.get(r) ?? 0) + 1);
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  });
  const most = $derived(Math.max(1, ...counts.map((c) => c[1])));
  const PARTS = [{ name: "Morning", from: 6, to: 12 }, { name: "Afternoon", from: 12, to: 17 }, { name: "Evening", from: 17, to: 22 }, { name: "Night", from: 22, to: 30 }];
  const parts = $derived(PARTS.map((p) => {
    const m = new Map<string, number>();
    for (const [h, r] of all) { const hh = h < 6 ? h + 24 : h; if (hh >= p.from && hh < p.to) m.set(r, (m.get(r) ?? 0) + 1); }
    const top = [...m.entries()].sort((a, b) => b[1] - a[1])[0];
    return { name: p.name, top: top ? name(top[0]) : null, n: [...m.values()].reduce((a, b) => a + b, 0) };
  }));
</script>

{#snippet summary()}
  <b>{all.length}</b> {all.length === 1 ? "reason" : "reasons"} in four weeks; most often <b>{name(counts[0][0]).toLowerCase()}</b>.
{/snippet}

<TrendCard title="Why you unlock" foot={all.length ? summary : undefined}>
  {#if !all.length}
    <p class="empty">Tap a reason after an Unlock ("Why now?") and the pattern shows here.</p>
  {:else}
    <div class="bars" class:fit>
      {#each counts as [r, n] (r)}
        <div class="reason"><span class="name">{name(r)}</span><span class="track"><i style="width: {(n / most) * 100}%"></i></span><b class="mono">{n}</b></div>
      {/each}
    </div>
    <div class="parts">
      {#each parts as p}<div class:none={!p.top}><span class="cap">{p.name}</span><b>{p.top ?? "–"}</b></div>{/each}
    </div>
  {/if}
</TrendCard>

<style>
  .bars { display: flex; flex-direction: column; gap: 6px; }
  .bars.fit { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .reason { flex: none; display: grid; grid-template-columns: 110px minmax(0, 1fr) 26px; gap: 8px; align-items: center; font-size: 13px; }
  .name { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 10px; border-radius: 5px; background: #22262a; overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: 5px; background: var(--spend); transition: width var(--t-move) var(--ease-out); }
  .reason b { text-align: right; font-size: 12px; color: var(--muted); }
  .parts { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 6px; }
  .parts div { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: #1f2226; min-width: 0; }
  .parts b { font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .parts .none b { color: var(--muted); }
  .parts .cap { color: var(--muted); }
</style>
