<script lang="ts">
  // Did that change work? Pick a Marker (a rule change, a new term, a dose
  // change) and this compares the 14 Days before it with the 14 after,
  // skipping the first 3 after it while things settle. Then it checks luck:
  // how often two stretches the same length, anywhere else in your history,
  // differ by as much just from ordinary ups and downs. A change that random
  // stretches often match isn't evidence yet.
  import TrendCard from "../../components/TrendCard.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import { dayOfMoment, notes } from "../../notes.svelte";
  import { measured } from "../../notes.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  $effect(() => { notes.load(); });

  const SPAN = 14, SETTLE = 3;
  /** Settled Days only: today is still going. */
  const days = $derived(history.slice(0, -1));
  const index = $derived(new Map(days.map((d, i) => [d.day, i])));
  /** Markers with at least a week of Days before them, newest first. */
  const choices = $derived(notes.markers.filter((m) => (index.get(dayOfMoment(m.at)) ?? -1) >= 7).slice().reverse());
  let pickedAt = $state<string | null>(null);
  /** Untouched, the newest Marker with enough Days after it to compare. */
  const ready = (m: { at: string }) => (index.get(dayOfMoment(m.at)) ?? Infinity) + SETTLE + 5 <= days.length;
  const marker = $derived(choices.find((m) => m.at === pickedAt) ?? choices.find(ready) ?? choices[0] ?? null);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  type Measure = { name: string; of: (w: DayTotal[]) => number | null; unit: string; better: "up" | "down"; digits?: number };
  const MEASURES: Measure[] = [
    { name: "Vouchers a Day", of: (w) => mean(w.map((d) => d.earned)), unit: "", better: "up", digits: 1 },
    { name: "Goal Days", of: (w) => (w.length ? (w.filter((d) => d.goal_met).length / w.length) * 100 : null), unit: "%", better: "up" },
    { name: "Distraction a Day", of: (w) => mean(w.filter(measured).map((d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0))), unit: " min", better: "down" },
    { name: "Unlocked a Day", of: (w) => mean(w.map((d) => d.unlocked_minutes ?? 0)), unit: " min", better: "down" },
    { name: "Walked away", of: (w) => { const o = w.reduce((a, d) => a + (d.opens ?? 0), 0); return o ? (w.reduce((a, d) => a + (d.walked ?? 0), 0) / o) * 100 : null; }, unit: "%", better: "up" },
    { name: "Longest focus", of: (w) => middle(w.filter((d) => d.stretches?.length).map((d) => Math.max(...d.stretches!))), unit: " min", better: "up" },
  ];

  const at = $derived(marker ? index.get(dayOfMoment(marker.at)) ?? null : null);
  const before = $derived(at === null ? [] : days.slice(Math.max(0, at - SPAN), at));
  const after = $derived(at === null ? [] : days.slice(at + SETTLE, at + SETTLE + SPAN));
  const rows = $derived(MEASURES.map((m) => ({ ...m, a: m.of(before), b: m.of(after) })).filter((r) => r.a !== null && r.b !== null));
  const show = (v: number, m: Measure) => `${m.digits ? v.toFixed(m.digits).replace(/\.0$/, "") : Math.round(v)}${m.unit}`;

  /** How often other same-length stretches differ in Vouchers a Day by as much. */
  const luck = $derived.by(() => {
    if (at === null || after.length < 5) return null;
    const n = after.length;
    const observed = Math.abs((mean(after.map((d) => d.earned)) ?? 0) - (mean(before.map((d) => d.earned)) ?? 0));
    let total = 0, asBig = 0;
    for (let p = SPAN; p + SETTLE + n <= days.length; p++) {
      if (Math.abs(p - at) < SPAN) continue;
      const diff = Math.abs((mean(days.slice(p + SETTLE, p + SETTLE + n).map((d) => d.earned)) ?? 0) - (mean(days.slice(p - SPAN, p).map((d) => d.earned)) ?? 0));
      total++;
      if (diff >= observed - 1e-9) asBig++;
    }
    return total >= 10 ? { share: Math.round((asBig / total) * 100), total } : null;
  });
  const label = (m: { at: string; text: string }) => `${dayOfMoment(m.at).slice(5)}  ${m.text}`;
</script>

<TrendCard title="Before and after">
  {#snippet tools()}
    {#if choices.length}
      <select aria-label="Marker to compare around" value={marker?.at} onchange={(e) => (pickedAt = e.currentTarget.value)}>
        {#each choices as m (m.at)}<option value={m.at}>{label(m)}</option>{/each}
      </select>
    {/if}
  {/snippet}
  {#if !choices.length}
    <p class="empty">Add a Marker in the Log (a new term, a dose change), or change a rule, and this compares the two weeks either side of it.</p>
  {:else if after.length < 5}
    <p class="empty">Too soon after "{marker?.text}": the after side needs {SETTLE + 5} Days, and it has {Math.max(0, days.length - (at ?? 0))}. Check back in a few Days.</p>
  {:else}
    <p class="lead">{before.length} Days before "{marker?.text}", against {after.length} after, leaving out {SETTLE} settling-in Days.</p>
    <div class="table" class:fit>
      <span></span><span class="cap h">Before</span><span class="cap h">After</span><span></span>
      {#each rows as r (r.name)}
        {@const up = r.b! > r.a!}
        {@const same = Math.abs(r.b! - r.a!) < (r.unit === "%" ? 2 : 0.15 * Math.max(1, Math.abs(r.a!)))}
        {@const good = same ? null : (up === (r.better === "up"))}
        <span class="name">{r.name}</span>
        <b class="mono">{show(r.a!, r)}</b>
        <b class="mono">{show(r.b!, r)}</b>
        <span class="arrow" class:good={good === true} class:bad={good === false}>{same ? "=" : up ? "▲" : "▼"}</span>
      {/each}
    </div>
    {#if luck}
      <p class="luck" class:unusual={luck.share <= 10}>
        {#if luck.share <= 10}A swing in Vouchers a Day this big happened in only <b>{luck.share}%</b> of other stretches, so it's likely more than chance.
        {:else}Swings this big in Vouchers a Day happen in <b>{luck.share}%</b> of other stretches, so this could be ordinary ups and downs.{/if}
      </p>
    {/if}
  {/if}
</TrendCard>

<style>
  select { max-width: 190px; height: 32px; padding: 0 8px; border-radius: 10px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 600 12px var(--font); }
  .lead { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .table { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 20px; gap: 6px 14px; align-items: center; font-size: 13.5px; }
  .table.fit { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; align-content: start; }
  .h { text-align: right; color: var(--muted); }
  .name { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .table b { text-align: right; font-size: 13.5px; }
  .table b:nth-of-type(2n) { color: var(--ink); }
  .arrow { text-align: center; font-size: 11px; color: var(--muted); }
  .arrow.good { color: var(--voucher); }
  .arrow.bad { color: var(--spend); }
  .luck { margin: 0; font-size: 12.5px; line-height: 1.45; color: var(--muted); }
  .luck b { color: var(--ink); font-family: var(--mono); }
  .luck.unusual b { color: var(--voucher); }
  .empty { margin: 0; color: var(--muted); font-size: 13px; line-height: 1.45; }
</style>
