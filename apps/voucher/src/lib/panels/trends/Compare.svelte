<script lang="ts">
  // Did that change work? Pick a Marker (a rule change, a new term, a dose
  // change) and this compares the 14 Days before it with the 14 after,
  // skipping the first 3 after it while things settle. Then it checks luck:
  // how often two stretches the same length, anywhere else in your history,
  // differ by as much just from ordinary ups and downs. A change that random
  // stretches often match isn't evidence yet. The switcher in the title's
  // place steps through the Markers; the lines under the table say what was
  // compared and how likely luck is.
  import TrendCard from "../../components/TrendCard.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import { dayOfMoment, notes } from "../../notes.svelte";
  import { measured } from "../../notes.svelte";
  import type { DayTotal } from "../../types";
  import { shortDate } from "../../time";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  $effect(() => { notes.load(); });

  const SPAN = 14, SETTLE = 3;
  /** Settled Days only: today is still going. */
  const days = $derived(history.slice(0, -1));
  const today = $derived(history.at(-1)?.day ?? "");
  const index = $derived(new Map(days.map((d, i) => [d.day, i])));
  /** Markers with at least a week of Days before them, newest first. */
  const choices = $derived(notes.markers.filter((m) => (index.get(dayOfMoment(m.at)) ?? -1) >= 7).slice().reverse());
  let pickedAt = $state<string | null>(null);
  /** Untouched, the newest Marker with enough Days after it to compare. */
  const ready = (m: { at: string }) => (index.get(dayOfMoment(m.at)) ?? Infinity) + SETTLE + 5 <= days.length;
  const marker = $derived(choices.find((m) => m.at === pickedAt) ?? choices.find(ready) ?? choices[0] ?? null);
  /** Where the shown Marker sits in `choices`: older ones come after it. */
  const pos = $derived(marker ? choices.indexOf(marker) : -1);

  const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
  const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  type Measure = { name: string; of: (w: DayTotal[]) => number | null; unit: string; better: "up" | "down"; digits?: number };
  const MEASURES: Measure[] = [
    { name: "Vouchers a Day", of: (w) => mean(w.map((d) => d.earned)), unit: "", better: "up", digits: 1 },
    { name: "Goal Days", of: (w) => (w.length ? (w.filter((d) => d.goal_met).length / w.length) * 100 : null), unit: "%", better: "up" },
    { name: "Distracted per Day", of: (w) => mean(w.filter(measured).map((d) => Object.values(d.used ?? {}).reduce((a, b) => a + b, 0))), unit: " min", better: "down" },
    { name: "Unlocked per Day", of: (w) => mean(w.map((d) => d.unlocked_minutes ?? 0)), unit: " min", better: "down" },
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
  /** The settling-in Days left out, as "09-14 to 09-16". */
  const settled = $derived.by(() => {
    if (at === null) return "";
    const from = days[at]?.day, to = days[Math.min(days.length - 1, at + SETTLE - 1)]?.day;
    return `${from ? shortDate(from, today) : ""} to ${to ? shortDate(to, today) : ""}`;
  });
  const label = (m: { at: string; text: string }) => `${shortDate(dayOfMoment(m.at), today)} ${m.text}`;
  /** Whether the table and its summary show (not an empty state). */
  const compared = $derived(choices.length > 0 && after.length >= 5);
</script>

{#snippet summary()}
  Left out {settled} to settle in.
  {#if luck}<span class="luck" class:unusual={luck.share <= 10}>{#if luck.share <= 10}<b>Likely real</b>: a swing this big shows up in only {luck.share}% of other stretches.{:else}<b>Could be chance</b>: swings this big show up in {luck.share}% of other stretches.{/if}</span>{/if}
{/snippet}

<TrendCard title="Before and after" nav={choices.length ? { label: marker ? label(marker) : "", back: pos >= 0 && pos < choices.length - 1, forward: pos > 0, onback: () => (pickedAt = choices[pos + 1].at), onforward: () => (pickedAt = choices[pos - 1].at) } : undefined} foot={compared ? summary : undefined}>
  {#if !choices.length}
    <p class="empty">Add a Marker in the Log (a new term, a dose change), or change a rule, and this compares the two weeks either side of it.</p>
  {:else if after.length < 5}
    <p class="empty">Too soon after "{marker?.text}": the after side needs {SETTLE + 5} Days, and it has {Math.max(0, days.length - (at ?? 0))}. Check back in a few Days.</p>
  {:else}
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
  {/if}
</TrendCard>

<style>
  .table { display: grid; grid-template-columns: minmax(0, 1fr) auto auto 20px; gap: 6px 14px; align-items: center; font-size: 13.5px; }
  /* In a tablet slot (a third to two thirds high) the table takes the spare
     height and scrolls, rather than being cut off at the card's edge. */
  .table.fit { flex: 1 1 0; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; align-content: start; }
  .table.fit::-webkit-scrollbar { display: none; }
  .h { text-align: right; color: var(--muted); }
  .name { color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .table b { text-align: right; font-size: 13.5px; }
  .table b:nth-of-type(2n) { color: var(--ink); }
  .arrow { text-align: center; font-size: 11px; color: var(--muted); }
  .arrow.good { color: var(--voucher); }
  .arrow.bad { color: var(--worse); }
  /* The luck sentence gets a line of its own under the first. */
  .luck { display: block; margin-top: 4px; }
  /* Beats the foot's own bold colour. */
  :global(.foot) .luck.unusual b { color: var(--voucher); }
</style>
