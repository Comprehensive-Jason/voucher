<script lang="ts">
  // What pulls me? The reasons tapped after Unlocks ("Why now?") over the
  // last four weeks, one row each, most common first: a bar and its count,
  // then a cell for each part of the Day (Morning 06 to 12, Afternoon 12 to
  // 17, Evening 17 to 22, Night 22 to 06), shaded salmon by how many fell
  // there, so a pattern (bored afternoons, tired evenings) shows and a second
  // reason in a part still counts. A reason turns an Unlock from a lapse into
  // information. The most common reason's bar is in full colour, the rest
  // dimmer. The heading line over the rows gives the span and how many of
  // its Unlocks had a reason, so the card needs no line under it.
  import TrendCard from "../../components/TrendCard.svelte";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const span = $derived(history.slice(-28));
  const all = $derived(span.flatMap((d) => d.reasons ?? []));
  /** Unlocks in the span: one per Voucher torn, since "Why now?" follows each tear. */
  // Each tear is asked "Why now?" once, so tears (not Vouchers torn) are the Unlocks to count; an older Ledger without them falls back to Vouchers.
  const unlocks = $derived(span.reduce((n, d) => n + (d.tears ?? d.redeemed), 0));
  const name = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);
  const PARTS = [{ name: "Morning", short: "Morn", from: 6, to: 12 }, { name: "Afternoon", short: "Aft", from: 12, to: 17 }, { name: "Evening", short: "Eve", from: 17, to: 22 }, { name: "Night", short: "Night", from: 22, to: 30 }];
  /** The part of the Day a clock hour falls in; the hours after midnight belong to Night. */
  const partOf = (h: number) => { const hh = h < 6 ? h + 24 : h; return PARTS.findIndex((p) => hh >= p.from && hh < p.to); };
  const rows = $derived.by(() => {
    const m = new Map<string, number[]>();
    for (const [h, r] of all) {
      const cells = m.get(r) ?? [0, 0, 0, 0];
      const p = partOf(h);
      if (p >= 0) cells[p]++;
      m.set(r, cells);
    }
    return [...m.entries()].map(([r, cells]) => ({ r, cells, n: cells.reduce((a, b) => a + b, 0) })).sort((a, b) => b.n - a.n);
  });
  const most = $derived(Math.max(1, ...rows.map((x) => x.n)));
  const busiest = $derived(Math.max(1, ...rows.flatMap((x) => x.cells)));
  /** A cell's share of the busiest cell, as its salmon's strength (a quarter at the least, so one still shows). */
  const strength = (n: number) => Math.round(25 + 75 * (n / busiest));
</script>

<TrendCard title="Why you unlock">
  {#if !all.length}
    <p class="empty">Tap a reason after an Unlock ("Why now?") and the pattern shows here.</p>
  {:else}
    <div class="table" class:fit role="table" aria-label="Reasons for Unlocks by part of the Day, last 4 weeks">
      <!-- The span, and how many of its Unlocks had a reason, over the rows. -->
      <div class="mono cover"><span>Last 4 weeks</span>{#if unlocks}<span>Reason given for <b>{Math.min(all.length, unlocks)}</b> of <b>{unlocks}</b> {unlocks === 1 ? "Unlock" : "Unlocks"}</span>{/if}</div>
      <div class="line head" role="row">
        <span role="columnheader" class="span"></span>
        {#each PARTS as p}<span class="mono part" role="columnheader" title="{p.name}, {String(p.from % 24).padStart(2, '0')}:00 to {String(p.to % 24).padStart(2, '0')}:00"><span class="long">{p.name}</span><span class="short">{p.short}</span></span>{/each}
      </div>
      {#each rows as x (x.r)}
        <div class="line reason" class:top={x.n === most} role="row">
          <span class="name" role="rowheader">{name(x.r)}</span>
          <span class="track"><i style="width: {(x.n / most) * 100}%"></i></span>
          <b class="mono count">{x.n}</b>
          {#each x.cells as c, i}
            <span class="mono cell" class:strong={c / busiest > 0.6} role="cell" title="{name(x.r)}, {PARTS[i].name}: {c}"
              style={c ? `background: color-mix(in srgb, var(--spend) ${strength(c)}%, var(--raised))` : undefined}>{c || ""}</span>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</TrendCard>

<style>
  /* One grid for the heading and every reason, so the cells line up in columns. */
  .table { display: grid; grid-template-columns: 104px minmax(40px, 1fr) 22px repeat(4, minmax(30px, 54px)); column-gap: 8px; row-gap: 5px; align-content: start; }
  .table.fit { flex: 1; min-height: 0; overflow-y: auto; scrollbar-width: none; }
  .line { display: contents; }
  .head > span { font-size: var(--axis-size); color: var(--axis-ink); white-space: nowrap; align-self: end; padding-bottom: 1px; }
  .head .span { grid-column: span 3; }
  .cover { grid-column: 1 / -1; display: flex; justify-content: space-between; gap: 8px; font-size: var(--axis-size); color: var(--axis-ink); white-space: nowrap; }
  .cover span { overflow: hidden; text-overflow: ellipsis; }
  .cover b { color: var(--ink); font-weight: 700; }
  .head .part { text-align: center; overflow: hidden; }
  .head .short { display: none; }
  .reason > * { align-self: center; }
  .name { font-size: 13px; color: var(--ink); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .track { height: 10px; border-radius: 5px; background: var(--line); overflow: hidden; }
  .track i { display: block; height: 100%; border-radius: 5px; background: var(--spend); transition: width var(--t-move) var(--ease-out); }
  .count { text-align: right; font-size: 12px; color: var(--muted); }
  .cell { height: 22px; border-radius: 5px; background: var(--raised); display: flex; align-items: center; justify-content: center; font-size: 11px; font-weight: 600; color: var(--ink); }
  /* Dark figures on the strongest salmon, where light ones would wash out. */
  .cell.strong { color: var(--surface); }
  /* The most common reason (or reasons, on a tie) stands out; the rest step back. */
  .reason:not(.top) .track i { opacity: .4; }
  .reason:not(.top) .name { color: var(--muted); }
  .reason.top .count { color: var(--ink); }
  /* A phone-wide card: narrower names and cells, and the parts of the Day shortened. */
  @container card (max-width: 440px) {
    .table { grid-template-columns: 84px minmax(24px, 1fr) 20px repeat(4, minmax(26px, 40px)); column-gap: 6px; }
    .head .long { display: none; }
    .head .short { display: inline; }
  }
</style>
