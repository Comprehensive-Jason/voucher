<script lang="ts">
  // What are my bests, to try to beat? Records only go up; one set today is
  // marked New.
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { goalRuns, mondayOf } from "../../trends";
  import { styleOf } from "../../sources";
  import type { DayTotal } from "../../types";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const today = $derived(history.at(-1)?.day);
  const best = <T,>(list: T[], score: (t: T) => number) => list.reduce<T | null>((a, b) => (a === null || score(b) > score(a) ? b : a), null);

  const records = $derived.by(() => {
    const out: { name: string; value: string; when: string; day?: string }[] = [];
    const most = best(history, (d) => d.earned);
    if (most && most.earned) out.push({ name: "Most Vouchers in a Day", value: String(most.earned), when: most.day, day: most.day });
    const run = best(goalRuns(history), (r) => r.length);
    if (run) out.push({ name: "Longest streak", value: `${run.length} Days`, when: `to ${run.end}`, day: run.end });
    const weeks = new Map<string, number>();
    for (const d of history) if (d.goal_met) weeks.set(mondayOf(d.day), (weeks.get(mondayOf(d.day)) ?? 0) + 1);
    const week = best([...weeks.entries()], ([, n]) => n);
    if (week) out.push({ name: "Most goal Days in a week", value: `${week[1]} of 7`, when: `week of ${week[0]}` });
    const late = best(history.filter((d) => d.first_tear), (d) => { const [h, m] = clock(d.first_tear!, timeZone).split(":").map(Number); return (h < 6 ? h + 24 : h) * 60 + m; });
    if (late) out.push({ name: "Latest first tear", value: clock(late.first_tear!, timeZone), when: late.day, day: late.day });
    const sources = history.flatMap((d) => Object.entries(d.by_source ?? {}).map(([id, n]) => ({ d, id, n })));
    const src = best(sources, (s) => s.n);
    if (src) out.push({ name: `Most from one source`, value: `${src.n} ${styleOf(src.id).name}`, when: src.d.day, day: src.d.day });
    // Among goal Days with Distraction time measured.
    const quiet = history.filter((d) => d.goal_met && d.used && Object.keys(d.used).length)
      .map((d) => ({ d, m: Object.values(d.used!).reduce((a, b) => a + b, 0) }));
    const q = best(quiet, (x) => -x.m);
    if (q) out.push({ name: "Least Distraction time on a goal Day", value: `${q.m} min`, when: q.d.day, day: q.d.day });
    return out;
  });
</script>

<TrendCard title="Personal records">
  <div class="list">
    {#each records as r (r.name)}
      <div class="rec">
        <span class="name">{r.name}{#if r.day === today}<em>New</em>{/if}</span>
        <b>{r.value}</b>
        <span class="when">{r.when}</span>
      </div>
    {:else}
      <p class="empty">Records show once there's a little history.</p>
    {/each}
  </div>
</TrendCard>

<style>
  .list { display: flex; flex-direction: column; }
  .rec { display: grid; grid-template-columns: minmax(0, 1fr) auto; grid-template-rows: auto auto; column-gap: 12px; padding: 7px 0; border-top: 1px solid var(--divider); }
  .rec:first-child { border-top: 0; }
  .name { font-size: 13.5px; display: flex; align-items: center; gap: 8px; }
  .name em { font: 700 10px var(--mono); font-style: normal; letter-spacing: .08em; text-transform: uppercase; color: #0e0f11; background: var(--goal); border-radius: 999px; padding: 1px 7px; }
  .rec b { grid-row: span 2; align-self: center; font: 700 16px var(--mono); color: var(--goal); text-align: right; }
  .when { font: 500 11px var(--mono); color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
