<script lang="ts">
  // Streaks: how does this one compare with my others, and where do streaks
  // tend to end? Above them, the two numbers that matter more after a miss:
  // goal Days in the last two weeks, and how long a lapse usually lasts (and
  // whether lapses are getting shorter), so a miss reads as information. A
  // column for each length from 1 Day to your best, as tall as the number of
  // streaks that reached it, so the drop from one column to the next is where
  // streaks end. Today's length is green and labelled "now", your best
  // outlined in gold and labelled "best", and the length finished streaks
  // usually reach is labelled "usual end". With a streak running, a badge at
  // the top right gives the odds, from finished streaks, of it reaching the
  // next milestone. The chart says it all, so the card has no line under it.
  import TrendCard from "../../components/TrendCard.svelte";
  import { goalRuns } from "../../trends";
  import { fitsSlot } from "../../fit.svelte";
  import type { DayTotal } from "../../types";

  let { history }: { history: DayTotal[] } = $props();
  const fit = fitsSlot();
  const runs = $derived(goalRuns(history));
  const lastDay = $derived(history.at(-1)?.day);
  const yesterday = $derived(history.at(-2)?.day);
  /** The run still going: it ends today, or yesterday while today's goal is still open. */
  const current = $derived(runs.at(-1) && (runs.at(-1)!.end === lastDay || runs.at(-1)!.end === yesterday) ? runs.at(-1)! : null);
  const finished = $derived(current ? runs.slice(0, -1) : runs);
  const best = $derived(Math.max(1, ...runs.map((r) => r.length)));
  /** How many streaks (finished or not) reached each length, 1 to best. */
  const reached = $derived(Array.from({ length: best }, (_, i) => runs.filter((r) => r.length >= i + 1).length));
  const tallest = $derived(Math.max(1, ...reached));

  const MILESTONES = [3, 7, 14, 21, 30, 45, 60, 90, 120, 180, 365];
  const odds = $derived.by(() => {
    if (!current) return null;
    const goal = MILESTONES.find((m) => m > current.length);
    const from = finished.filter((r) => r.length >= current.length);
    if (!goal || from.length < 3) return { goal, share: null, n: from.length };
    return { goal, share: from.filter((r) => r.length >= goal).length / from.length, n: from.length };
  });
  // ---- Bouncing back ----
  /** Settled Days: today only once its goal is met, since it can still be. */
  const settled = $derived(history.at(-1)?.goal_met ? history : history.slice(0, -1));
  const lately = $derived(settled.slice(-14).filter((d) => d.goal_met).length);
  /** Lengths of finished lapses: missed Days in a row, ended by a goal Day. */
  const lapses = $derived.by(() => {
    const out: number[] = [];
    let run = 0, seenGoal = false;
    for (const d of settled) {
      if (d.goal_met) { if (run && seenGoal) out.push(run); run = 0; seenGoal = true; }
      else run++;
    }
    return out;
  });
  const middle = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : null; };
  const lapse = $derived(middle(lapses));
  /** The last six lapses against the ones before, once there are enough of both. */
  const recent = $derived(lapses.length >= 9 ? middle(lapses.slice(-6)) : null);
  const earlier = $derived(lapses.length >= 9 ? middle(lapses.slice(0, -6)) : null);
  const days = (n: number) => `${n} ${n === 1 ? "Day" : "Days"}`;

  /** Where finished streaks usually stop: the middle length. */
  const typical = $derived.by(() => {
    const s = finished.map((r) => r.length).sort((a, b) => a - b);
    return s.length ? s[Math.floor(s.length / 2)] : null;
  });

  // ---- Labels over the columns ----
  let bw = $state(0), bh = $state(0);
  const GAP = 2, LH = 12, BADGE = 20, TALL = 120;
  /** Mono labels at 10px run about 6px a character. */
  const textWidth = (t: string) => t.length * 6.2 + 4;
  const badge = $derived.by(() => {
    if (!current || !odds?.goal || odds.share === null || odds.share === undefined) return null;
    const p = Math.round(odds.share * 100);
    return { text: `${p}% reach Day ${odds.goal}`, title: `${p}% of the ${odds.n} streaks that reached Day ${current.length} lasted to Day ${odds.goal}` };
  });
  type Label = { kind: string; text: string; day: number; left: number; width: number; row: number; y: number; mid: number; top: number };
  /** Each label sits just above its column, kept inside the chart; one that
   *  would overlap another, or a taller column beside it, is lifted, with a
   *  thin stem down to its own column. `colH` is the columns' height. */
  const place = (colH: number): Label[] => {
    const want = [
      ...(current ? [{ kind: "now", text: "now", day: current.length }] : []),
      { kind: "best", text: "best", day: best },
      ...(typical !== null ? [{ kind: "usual", text: "usual end", day: typical }] : []),
    ];
    const colW = (bw - GAP * (best - 1)) / best;
    const out: Label[] = [];
    // A label wider than its column sits above every column it spans, not just its own.
    const base = (l: { left: number; width: number }) => {
      const from = Math.max(0, Math.floor(l.left / (colW + GAP))), to = Math.min(best - 1, Math.floor((l.left + l.width) / (colW + GAP)));
      return (Math.max(...reached.slice(from, to + 1)) / tallest) * colH + 2;
    };
    for (const w of want) {
      const width = textWidth(w.text);
      const mid = (w.day - 1) * (colW + GAP) + colW / 2;
      const left = Math.min(Math.max(0, mid - width / 2), Math.max(0, bw - width));
      let row = 0;
      const clash = (o: Label) => left < o.left + o.width && left + width > o.left && Math.abs(base({ left, width }) + row * LH - (base(o) + o.row * LH)) < LH;
      while (out.some(clash)) row++;
      out.push({ ...w, left, width, row, y: 0, mid, top: (reached[w.day - 1] / tallest) * colH });
    }
    return out.map((l) => ({ ...l, y: base(l) + l.row * LH }));
  };
  /** Headroom over the tallest column: the stacked labels, then the badge. */
  const padFor = (ls: Label[]) => (Math.max(0, ...ls.map((l) => l.row)) + 1) * LH + 2 + (badge ? BADGE : 0);
  // Two passes: the labels' rows set the headroom, which sets the columns' height they sit on.
  const layout = $derived.by(() => {
    if (bw <= 0) return { labels: [] as Label[], pad: LH + 2 + (badge ? BADGE : 0) };
    // Off the tablet the columns keep their 120px and the chart grows by the headroom.
    if (!fit) { const labels = place(TALL); return { labels, pad: padFor(labels) }; }
    const first = place(Math.max(0, bh - padFor([])));
    const labels = place(Math.max(0, bh - padFor(first)));
    return { labels, pad: padFor(labels) };
  });
</script>

<TrendCard title="Streaks">
  {#if !runs.length}
    <p class="empty">A goal Day starts the first streak.</p>
  {:else}
    <div class="stats">
      <div><b>{lately} of {Math.min(14, settled.length)}</b><span>goal Days lately</span></div>
      {#if lapse !== null}
        <div><b>{days(recent ?? lapse)}</b><span>{#if recent !== null && earlier !== null && recent !== earlier}typical lapse, {recent < earlier ? "down" : "up"} from {earlier}{:else}a lapse usually lasts{/if}</span></div>
      {/if}
    </div>
    <div class="bars" class:fit role="img" aria-label="How many streaks reached each length" bind:clientWidth={bw} bind:clientHeight={bh} style="padding-top: {layout.pad}px{fit ? '' : `; height: ${TALL + layout.pad}px`}">
      {#each reached as n, i}
        <div class="col" title="{n} {n === 1 ? 'streak' : 'streaks'} reached Day {i + 1}">
          <i class:now={current && current.length === i + 1} class:best={i + 1 === best} style="height: {(n / tallest) * 100}%"></i>
        </div>
      {/each}
      <!-- Labels over the columns, placed in pixels so they never overlap. -->
      {#each layout.labels as l (l.kind)}
        <span class="tag {l.kind}" style="left: {l.left}px; width: {l.width}px; bottom: {l.y}px">{l.text}</span>
        {#if l.y - l.top > 6}<span class="stem {l.kind}" style="left: {l.mid}px; bottom: {l.top + 1}px; height: {l.y - l.top - 2}px"></span>{/if}
      {/each}
      {#if badge}<span class="badge" title={badge.title}>{badge.text}</span>{/if}
    </div>
    <div class="axis"><span>1 Day</span><span>{days(best)}</span></div>
  {/if}
</TrendCard>

<style>
  /* The top padding (set inline) is the labels' and the badge's headroom. */
  .bars { position: relative; display: flex; align-items: flex-end; gap: 2px; border-bottom: 1px solid #3a3f45; }
  .bars.fit { flex: 1; min-height: 40px; height: auto; }
  .col { flex: 1 1 0; min-width: 0; height: 100%; display: flex; align-items: flex-end; }
  .col i { display: block; width: 100%; min-height: 2px; border-radius: 3px 3px 0 0; background: #2fb36b; opacity: .5; transition: height var(--t-move) var(--ease-out); }
  .col i.now { background: var(--voucher); opacity: 1; }
  .col i.best { outline: 2px solid var(--goal); outline-offset: -2px; opacity: 1; }
  .tag { position: absolute; text-align: center; font: 600 10px/12px var(--mono); color: var(--muted); white-space: nowrap; pointer-events: none; }
  .stem { position: absolute; width: 1px; background: currentColor; color: var(--muted); opacity: .6; pointer-events: none; }
  .tag.now, .stem.now { color: var(--voucher); }
  .tag.best, .stem.best { color: var(--goal); }
  .badge { position: absolute; top: 0; right: 0; padding: 1px 7px; border-radius: 999px; background: var(--unlocked-bg); color: var(--voucher); font: 700 11px/16px var(--mono); white-space: nowrap; }
  .axis { display: flex; justify-content: space-between; font: 500 var(--axis-size) var(--mono); color: var(--axis-ink); }
</style>
