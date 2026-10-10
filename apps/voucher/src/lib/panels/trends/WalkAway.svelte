<script lang="ts">
  // When I hit a blocked app, how often do I turn back? A "blocked open" is
  // opening an app on a blocklist while nothing is unlocked; "walked away"
  // means that time ended without an Unlock. One bar per Day of the week
  // holding the picked Day: its height is the opens, its green part the
  // walk-aways and its salmon part the Unlocks, with both numbers on it. A
  // badge over the bars gives the week's share walked away, and the week
  // before's beside it, so the card needs no line under it.
  import TrendCard from "../../components/TrendCard.svelte";
  import Legend from "../../components/Legend.svelte";
  import { mondayOf } from "../../trends";
  import { selection } from "../../selection.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const shift = (d: string, n: number) => new Date(Date.parse(`${d}T12:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);
  const today = $derived(history.at(-1)?.day ?? "");
  const monday = $derived(mondayOf(selection.day ?? today));
  const byDay = $derived(new Map(history.map((d) => [d.day, d])));
  const week = $derived(Array.from({ length: 7 }, (_, i) => { const day = shift(monday, i); const d = byDay.get(day); return { day, opens: d?.opens ?? 0, walked: Math.min(d?.walked ?? 0, d?.opens ?? 0), future: day > today }; }));
  const totals = (start: string) => {
    let opens = 0, walked = 0;
    for (let i = 0; i < 7; i++) { const d = byDay.get(shift(start, i)); opens += d?.opens ?? 0; walked += Math.min(d?.walked ?? 0, d?.opens ?? 0); }
    return { opens, walked };
  };
  const now = $derived(totals(monday));
  const before = $derived(totals(shift(monday, -7)));
  const pct = (t: { opens: number; walked: number }) => (t.opens ? Math.round((t.walked / t.opens) * 100) : 0);
  const most = $derived(Math.max(1, ...week.map((d) => d.opens)));
  const DAY = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
  const any = $derived(history.some((d) => d.opens));
  /** Salmon for Unlocks, dimmed so the walk-aways' green still reads on top. */
  const UNLOCKED = "color-mix(in srgb, var(--spend) 40%, transparent)";
</script>

<TrendCard title="Walk-away wins" date={{ day: selection.day ?? today, today, oldest: history[0]?.day, unit: "week", onpick: (d) => selection.set("walkaway", { day: d === today ? null : d, picked: false }) }}>
  {#if !any}
    <p class="empty">Opens of blocked apps show here once the phone reports them.</p>
  {:else}
    <div class="week" class:fit>
      <!-- The week's share, in a lane of its own above the bars so a tall bar never runs into it. -->
      {#if now.opens}
        <div class="badge" title="Walked away {now.walked} of {now.opens} {now.opens === 1 ? 'time' : 'times'}{before.opens ? `; the week before, ${before.walked} of ${before.opens}` : ''}">
          <b>{pct(now)}% walked away</b>{#if before.opens}<span>{pct(before)}% the week before</span>{/if}
        </div>
      {/if}
      {#each week as d, i (d.day)}
        <div class="day" class:future={d.future} title="{d.day}: walked away {d.walked} of {d.opens}">
          {#if d.opens}<span class="n">{d.walked}/{d.opens}</span>{/if}
          <div class="bar" style="background: {d.opens ? UNLOCKED : 'var(--line)'}; height: {(d.opens / most) * 100}%"><i style="height: {d.opens ? (d.walked / d.opens) * 100 : 0}%"></i></div>
          <span class="label" class:chosen={d.day === (selection.day ?? today)}>{DAY[i]}</span>
        </div>
      {/each}
    </div>
    <Legend items={[{ kind: "box", color: "var(--voucher)", label: "Walked away" }, { kind: "box", color: UNLOCKED, label: "Unlocked instead" }]} />
  {/if}
</TrendCard>

<style>
  /* The bottom margin leaves room for the weekday labels hanging under the
     bars; the top padding is the badge's lane over the bars' own labels. */
  .week { position: relative; height: 130px; margin-bottom: 14px; display: grid; grid-template-columns: repeat(7, 1fr); gap: 8px; align-items: end; border-bottom: 1px solid #3a3f45; padding-top: 34px; }
  .badge { position: absolute; top: 0; left: 0; right: 0; display: flex; align-items: baseline; gap: 8px; min-width: 0; white-space: nowrap; }
  .badge b { padding: 1px 8px; border-radius: 999px; background: var(--unlocked-bg); color: var(--voucher); font: 700 12px/18px var(--mono); }
  .badge span { font: 500 11px var(--mono); color: var(--muted); overflow: hidden; text-overflow: ellipsis; }
  .week.fit { flex: 1; min-height: 90px; height: auto; }
  .day { position: relative; height: 100%; display: flex; flex-direction: column; justify-content: flex-end; align-items: center; }
  .day.future { opacity: .3; }
  .n { font: 600 10px var(--mono); color: var(--ink); margin-bottom: 3px; }
  /* Dim salmon (set inline, shared with the legend) for the opens unlocked
     instead; green, from the bottom, for the walk-aways; a grey stub for none. */
  .bar { width: 70%; min-height: 2px; border-radius: 4px 4px 0 0; display: flex; flex-direction: column; justify-content: flex-end; overflow: hidden; }
  .bar i { display: block; background: var(--voucher); }
  .label { position: absolute; bottom: -18px; font: 500 var(--axis-size) var(--mono); color: var(--axis-ink); }
  .label.chosen { color: var(--ink); font-weight: 700; }
</style>
