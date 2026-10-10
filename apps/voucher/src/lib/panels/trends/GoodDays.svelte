<script lang="ts">
  // What do my best Days have in common? Plain counting, no guessing at
  // causes: for each yes/no fact about a Day (a source before noon, the first
  // unlock after 14:00, a weekday, an hour or more in Distractions), how often
  // the goal was met on Days with it against Days without it. A finding shows
  // only when both groups have at least 8 Days and the gap is 20 points or
  // more; the stars say how sure, from the smaller group's size. It says
  // "goes with", never "causes".
  import TrendCard from "../../components/TrendCard.svelte";
  import { clock } from "../../time";
  import { styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history, timeZone }: { history: DayTotal[]; timeZone: string } = $props();
  const fit = fitsSlot();
  const MIN = 8, GAP = 0.2;
  const WEEKDAYS = ["Mondays", "Tuesdays", "Wednesdays", "Thursdays", "Fridays", "Saturdays", "Sundays"];
  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));

  const findings = $derived.by(() => {
    const facts = new Map<string, (d: DayTotal) => boolean>();
    const sources = new Set(days.flatMap((d) => Object.keys(d.source_hours ?? {})));
    for (const id of sources) {
      const name = styleOf(id).name;
      facts.set(`${name} before noon`, (d) => (d.source_hours?.[id] ?? []).slice(6, 12).some((n) => n > 0));
      facts.set(`any ${name}`, (d) => (d.by_source?.[id] ?? 0) > 0);
    }
    const firstHour = (d: DayTotal) => (d.first_tear ? Number(clock(d.first_tear, timeZone).slice(0, 2)) : 99);
    facts.set("no unlock before 14:00", (d) => { const h = firstHour(d); return h >= 14 || h < 6; });
    facts.set("an hour or more in Distractions", (d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) >= 60);
    WEEKDAYS.forEach((w, i) => facts.set(w, (d) => (new Date(`${d.day}T12:00:00Z`).getUTCDay() + 6) % 7 === i));
    const out = [];
    for (const [name, test] of facts) {
      const yes = days.filter(test), no = days.filter((d) => !test(d));
      if (yes.length < MIN || no.length < MIN) continue;
      const a = yes.filter((d) => d.goal_met).length / yes.length, b = no.filter((d) => d.goal_met).length / no.length;
      if (Math.abs(a - b) < GAP) continue;
      const n = Math.min(yes.length, no.length);
      out.push({ name, a, b, n, stars: n >= 30 ? 3 : n >= 15 ? 2 : 1 });
    }
    return out.sort((x, y) => Math.abs(y.a - y.b) - Math.abs(x.a - x.b)).slice(0, 6);
  });
  const pct = (v: number) => `${Math.round(v * 100)}%`;
</script>

<TrendCard title="What goes with a good Day">
  {#if days.length < 30}
    <p class="empty">Needs about two months of Days to say anything; {days.length} so far.</p>
  {:else if !findings.length}
    <p class="empty">Nothing stands out yet: no fact makes a goal Day 20 points likelier or less likely.</p>
  {:else}
    <div class="list" class:fit>
      {#each findings as f (f.name)}
        <div class="finding">
          <div class="text">Days with <b>{f.name}</b>: goal met {pct(f.a)}, against {pct(f.b)} without</div>
          <div class="meta">
            <span class="bar"><i class:down={f.a < f.b} style="width: {Math.abs(f.a - f.b) * 100}%"></i></span>
            <span class="stars" title="{f.n} Days in the smaller group">{"★".repeat(f.stars)}{"☆".repeat(3 - f.stars)}</span>
          </div>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet foot()}Goes with, not causes: a pattern in your Days so far.{/snippet}
</TrendCard>

<style>
  .list { display: flex; flex-direction: column; gap: 8px; }
  .list.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .finding { padding: 8px 10px; border-radius: 10px; background: #1f2226; display: flex; flex-direction: column; gap: 6px; }
  .text { font-size: 13px; line-height: 1.4; color: var(--muted); }
  .text b { color: var(--ink); font-weight: 600; }
  .meta { display: flex; align-items: center; gap: 10px; }
  .bar { flex: 1; height: 6px; border-radius: 3px; background: var(--line); overflow: hidden; }
  .bar i { display: block; height: 100%; border-radius: 3px; background: var(--voucher); }
  .bar i.down { background: var(--spend); }
  .stars { font-size: 11px; letter-spacing: 1px; color: var(--goal); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
