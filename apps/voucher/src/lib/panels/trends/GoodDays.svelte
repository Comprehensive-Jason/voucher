<script lang="ts">
  // Does doing one thing make another easier? For each source, the Days it
  // earned against the Days it didn't, and the Days just after: did another
  // source earn more, or did Distraction time or unlocking run lower? Plain
  // averages, no guessing at causes. A finding shows only when both groups
  // have at least 8 Days and the difference is at least a quarter of that
  // measure's usual level; the largest first, at most six. The goal itself is
  // left out, since finishing more always meets it sooner.
  import TrendCard from "../../components/TrendCard.svelte";
  import { styleOf } from "../../sources";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const MIN = 8, SHARE = 0.25;
  // Finished Days the log still holds.
  const days = $derived(history.slice(0, -1).filter((d) => d.hours && d.hours.length));
  const mean = (v: number[]) => v.reduce((a, b) => a + b, 0) / v.length;
  const one = (v: number) => v.toFixed(1).replace(/\.0$/, "");

  type Finding = { text: string; detail: string; size: number };
  const findings = $derived.by((): Finding[] => {
    const sources = [...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))];
    const name = (id: string) => styleOf(id).name;
    // What a Day can be better at: each source's Vouchers, and less Distraction time and unlocking.
    const outcomes = [
      ...sources.map((id) => ({ id, label: `${name(id)} Vouchers`, value: (d: DayTotal) => d.by_source?.[id] ?? 0, more: true, unit: "" })),
      { id: "~used", label: "minutes in Distractions", value: (d: DayTotal) => (d.used ? Object.values(d.used).reduce((a, b) => a + b, 0) : NaN), more: false, unit: " min" },
      { id: "~unlocked", label: "minutes unlocked", value: (d: DayTotal) => d.unlocked_minutes ?? NaN, more: false, unit: " min" },
    ];
    const out: Finding[] = [];
    const byDay = new Map(days.map((d) => [d.day, d]));
    const prevOf = (d: DayTotal) => byDay.get(new Date(Date.parse(`${d.day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    for (const a of sources) {
      const did = (d: DayTotal | undefined) => !!d && (d.by_source?.[a] ?? 0) > 0;
      for (const lag of [0, 1]) {
        // Same Day: Days with a against without. Next Day: Days after a Day with a against after one without.
        const pairs = days.map((d) => ({ d, cause: lag ? prevOf(d) : d })).filter((p) => p.cause);
        for (const o of outcomes) {
          if (o.id === a) continue;
          const yes = pairs.filter((p) => did(p.cause)).map((p) => o.value(p.d)).filter((v) => !Number.isNaN(v));
          const no = pairs.filter((p) => !did(p.cause)).map((p) => o.value(p.d)).filter((v) => !Number.isNaN(v));
          if (yes.length < MIN || no.length < MIN) continue;
          const y = mean(yes), n = mean(no), usual = mean([...yes, ...no]);
          const diff = y - n;
          if (!usual || Math.abs(diff) < SHARE * usual || Math.abs(diff) < 0.5) continue;
          // Only the helpful direction: more of a source, or less Distraction time and unlocking.
          if (diff > 0 !== o.more) continue;
          const when = lag ? `the Day after ${name(a)}` : `Days with ${name(a)}`;
          out.push({
            text: `${when}: ${one(Math.abs(diff))}${o.unit} ${o.more ? "more" : "fewer"} ${o.label} (${one(y)}${o.unit} against ${one(n)}${o.unit})`,
            detail: `${yes.length} Days with, ${no.length} without`,
            size: Math.abs(diff) / usual,
          });
        }
      }
    }
    return out.sort((x, y) => y.size - x.size).slice(0, 6);
  });
</script>

<TrendCard title="What goes with a good Day">
  {#if days.length < 30}
    <p class="empty">Needs about a month of Days to say anything; {days.length} so far.</p>
  {:else if !findings.length}
    <p class="empty">Nothing stands out yet: no activity goes with another doing better.</p>
  {:else}
    <div class="list" class:fit>
      {#each findings as f (f.text)}
        <div class="finding"><span class="text">{f.text}</span><span class="detail">{f.detail}</span></div>
      {/each}
    </div>
  {/if}
  {#snippet foot()}Goes with, not causes: patterns in your Days so far, from plain averages.{/snippet}
</TrendCard>

<style>
  .list { display: flex; flex-direction: column; gap: 6px; }
  .list.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .finding { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; border-radius: 10px; background: #1f2226; }
  .text { font-size: 13.5px; line-height: 1.4; color: var(--ink); }
  .detail { font: 500 11px var(--mono); color: var(--muted); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; }
</style>
