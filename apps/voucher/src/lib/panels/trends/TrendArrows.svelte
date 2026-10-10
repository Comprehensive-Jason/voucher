<script lang="ts">
  // What's going better, and what needs a look? Each measure's average over
  // the last 4 weeks against the 12 weeks before. One shows only when the
  // change is bigger than its usual week-to-week wobble (one standard
  // deviation of its weekly averages) and at least 10%. "Keep it going" is
  // the good direction, "Worth a look" the other; biggest changes first, 3
  // of each, the rest behind "more". With under 16 weeks of history it
  // compares the last 2 weeks with everything before, and says so.
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "../../notes.svelte";
  import { clock } from "../../time";
  import { clockOfHours } from "../../trends";
  import { styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const fit = fitsSlot();
  let showAll = $state(false);
  const days = $derived(history.slice(0, -1));
  const long = $derived(days.length >= 112);
  const recentN = $derived(long ? 28 : 14);
  const recent = $derived(days.slice(-recentN));
  const base = $derived(long ? days.slice(-112, -28) : days.slice(0, -14));

  type Measure = { name: string; value: (d: DayTotal) => number | null; up: boolean; show: (v: number) => string };
  const measures = $derived.by((): Measure[] => {
    const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");
    const list: Measure[] = [
      { name: "Vouchers earned a Day", value: (d) => d.earned, up: true, show: one },
      { name: "Goal Days a week", value: (d) => (d.goal_met ? 7 : 0), up: true, show: one },
      { name: "Minutes unlocked a Day", value: (d) => d.unlocked_minutes ?? null, up: false, show: (v) => `${Math.round(v)} min` },
      { name: "Distraction minutes a Day", value: (d) => (measured(d) ? Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) : null), up: false, show: (v) => `${Math.round(v)} min` },
      { name: "First unlock", value: (d) => { if (!d.first_tear) return null; const [h, m] = clock(d.first_tear, timeZone).split(":").map(Number); return (h < 6 ? h + 24 : h) + m / 60; }, up: true, show: clockOfHours },
    ];
    for (const id of new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))) {
      list.push({ name: `${styleOf(id).name} a Day`, value: (d) => (d.hours && d.hours.length ? d.by_source?.[id] ?? 0 : null), up: true, show: one });
    }
    return list;
  });
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const changes = $derived.by(() => {
    if (recent.length < 7 || base.length < 14) return [];
    const out = [];
    for (const m of measures) {
      const vals = (list: DayTotal[]) => list.map(m.value).filter((v): v is number => v !== null);
      const r = vals(recent), b = vals(base);
      if (r.length < 5 || b.length < 10) continue;
      const now = mean(r), then = mean(b);
      // Weekly averages of the earlier span, for its usual wobble.
      const weeks: number[] = [];
      for (let i = 0; i + 7 <= b.length; i += 7) weeks.push(mean(b.slice(i, i + 7)));
      const sd = weeks.length > 1 ? Math.sqrt(mean(weeks.map((w) => (w - mean(weeks)) ** 2))) : 0;
      const diff = now - then;
      if (Math.abs(diff) <= sd || (then !== 0 && Math.abs(diff / then) < 0.1)) continue;
      out.push({ ...m, now, then, size: then ? Math.abs(diff / then) : 1, good: diff > 0 === m.up });
    }
    return out.sort((a, b) => b.size - a.size);
  });
  const good = $derived(changes.filter((c) => c.good));
  const bad = $derived(changes.filter((c) => !c.good));
</script>

<TrendCard title="Trend arrows">
  {#if days.length < 21}
    <p class="empty">A few weeks of Days show what's changing; {days.length} so far.</p>
  {:else if !changes.length}
    <p class="empty">Nothing has moved beyond its usual week-to-week wobble.</p>
  {:else}
    <div class="groups" class:fit>
      {#each [["Keep it going", good], ["Worth a look", bad]] as [title, list]}
        {#if (list as typeof changes).length}
          <div class="group">
            <span class="cap">{title}</span>
            {#each (list as typeof changes).slice(0, showAll ? 99 : 3) as c (c.name)}
              <div class="change" class:good={c.good}>
                <span class="arrow">{c.now > c.then ? "▲" : "▼"}</span>
                <span class="name">{c.name}</span>
                <span class="mono vals">{c.show(c.then)} → <b>{c.show(c.now)}</b></span>
              </div>
            {/each}
          </div>
        {/if}
      {/each}
      {#if !showAll && (good.length > 3 || bad.length > 3)}<button class="more" onclick={() => (showAll = true)}>More</button>{/if}
    </div>
  {/if}
  {#snippet foot()}{long ? "Last 4 weeks against the 12 before." : "Last 2 weeks against everything before: 16 weeks of history make this steadier."}{/snippet}
</TrendCard>

<style>
  .groups { display: flex; flex-direction: column; gap: 12px; }
  .groups.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .group { display: flex; flex-direction: column; gap: 4px; }
  .change { display: grid; grid-template-columns: 16px minmax(0, 1fr) auto; align-items: center; gap: 8px; padding: 6px 0; border-top: 1px solid var(--divider); font-size: 13.5px; }
  .arrow { font-size: 11px; color: var(--spend); }
  .change.good .arrow { color: var(--voucher); }
  .name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .vals { font-size: 12px; color: var(--muted); }
  .vals b { color: var(--ink); }
  .more { align-self: flex-start; height: 30px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: #1f2226; color: var(--muted); font: 700 12px var(--font); cursor: pointer; }
</style>
