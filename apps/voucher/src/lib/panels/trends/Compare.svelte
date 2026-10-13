<script lang="ts">
  // Did that change work? Pick a Marker (a rule change, a new term, a dose
  // change) and this compares the 14 Days before it with the 14 after,
  // skipping the first 3 after it while things settle. Then it checks luck:
  // how often two stretches the same length, anywhere else in your history,
  // differ by as much just from ordinary ups and downs. A change that random
  // stretches often match isn't evidence yet. The switcher in the title's
  // place steps through the Markers; the lines under the table say what was
  // compared and how likely luck is.
  import TrendCard from "$core/components/TrendCard.svelte";
  import { fitsSlot } from "$core/fit.svelte";
  import { dayOfMoment, notes } from "$core/notes.svelte";
  import type { DayTotal } from "$core/types";
  import { shortDate } from "$core/time";
  import { MEASURES, SETTLE, measureOf, luck, same as alike, show, sides } from "$core/beforeAfter";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  $effect(() => { notes.load(); });

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

  const at = $derived(marker ? index.get(dayOfMoment(marker.at)) ?? null : null);
  const around = $derived(at === null ? { before: [], after: [] } : sides(days, at));
  const before = $derived(around.before);
  const after = $derived(around.after);
  const rows = $derived(MEASURES.filter((m) => m.table).map((m) => ({ ...m, a: m.of(before, {}), b: m.of(after, {}) })).filter((r) => r.a !== null && r.b !== null));

  /** How often other same-length stretches differ in Vouchers a Day by as much. */
  const luckNow = $derived(at === null ? null : luck(days, at, measureOf("earned")!));
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
  {#if luckNow}<span class="luck" class:unusual={luckNow.share <= 10}>{#if luckNow.share <= 10}<b>Likely real</b>: a swing this big shows up in only {luckNow.share}% of other stretches.{:else}<b>Could be chance</b>: swings this big show up in {luckNow.share}% of other stretches.{/if}</span>{/if}
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
        {@const same = alike(r, r.a!, r.b!)}
        {@const good = same || r.better === "neither" ? null : (up === (r.better === "up"))}
        <span class="name">{r.name}</span>
        <b class="mono">{show(r.a!, r)}</b>
        <b class="mono">{show(r.b!, r)}</b>
        <span class="arrow" class:good={good === true} class:bad={good === false} class:neutral={!same && good === null}>{same ? "=" : up ? "▲" : "▼"}</span>
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
  .arrow.bad { color: var(--worse-text); }
  /* A change that's neither good nor bad (events): its arrow in ink. */
  .arrow.neutral { color: var(--ink); }
  /* The luck sentence gets a line of its own under the first. */
  .luck { display: block; margin-top: 4px; }
  /* Beats the foot's own bold colour. */
  :global(.foot) .luck.unusual b { color: var(--voucher); }
</style>
