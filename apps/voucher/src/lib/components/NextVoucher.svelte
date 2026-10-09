<script lang="ts">
  // "Toward the next Voucher": each switched-on source's progress, one row
  // per source group, closest to its next Voucher first. At one Voucher per
  // task there is nothing to fill, since each task earns at once, so Tasks
  // shows a tally of today's task Vouchers instead and stays pinned on top.
  //
  // Rows slide to their new places as progress changes; a row moving up is
  // raised onto a card until it lands, so you can see which one moved. When a
  // source earns, its row plays it out (see celebrate.svelte.ts): the list
  // scrolls to it, the bar fills, the marker pings once and flashes with the
  // bar, and its count crossfades to "+1 Voucher" as the Bank counts it. Then
  // the bar empties to what's left over and the row slides to its new place.
  import { onDestroy, tick, untrack } from "svelte";
  import { flip } from "svelte/animate";
  import { styleOf } from "../sources";
  import { WIN_HOLD_MS, wins } from "../celebrate.svelte";
  import { MOTION, easeOut } from "../motion";
  import Marker from "./Marker.svelte";
  import ProgressFill from "./ProgressFill.svelte";
  import ScrollCue from "./ScrollCue.svelte";
  import type { SourceProgress } from "../types";

  /** `bank` tells a kept Voucher from one a full Bank lost. */
  let { sources, bank = 0 }: { sources: SourceProgress[]; bank?: number } = $props();

  type Row = { key: string; name: string; color: string; detail: string; full: string; fraction: number; earned: number; tally?: number };
  const rows = $derived.by(() => {
    const on = sources.filter((s) => s.on);
    const tasks = on.filter((s) => s.kind === "tasks");
    const out: Row[] = [];
    if (tasks.length) {
      const earned = tasks.reduce((n, s) => n + s.earned, 0);
      const every = Math.max(...tasks.map((s) => s.every));
      const fraction = every === 1 ? 0 : Math.max(...tasks.map((s) => s.progress / s.every));
      const rate = every === 1 ? "+1 each" : `1 per ${every}`;
      out.push({ key: "tasks", ...styleOf("tasks"), detail: `${rate} · ${earned} today`, full: `${rate} · ${earned} today`, fraction, earned,
        tally: every === 1 ? earned : undefined });
    }
    for (const s of on.filter((s) => s.kind !== "tasks")) {
      const unit = s.kind === "workout" ? "zone min" : s.kind === "steps" ? "steps" : "min";
      const n = (v: number) => v.toLocaleString("en-US");
      out.push({ key: s.id, ...styleOf(s.id), detail: `${n(s.progress)} / ${n(s.every)} ${unit}`, full: `${n(s.every)} / ${n(s.every)} ${unit}`,
        fraction: s.progress / s.every, earned: s.earned });
    }
    return out;
  });
  const byKey = $derived(Object.fromEntries(rows.map((r) => [r.key, r])));

  // Rows playing out a Voucher: shown full (with the earned count from before)
  // until it's counted, then released.
  let frozen = $state<Record<string, number>>({});
  let won = $state<Record<string, boolean>>({});
  /** Rows whose Voucher a full Bank lost: they say so instead of "+1 Voucher". */
  let lost = $state<Record<string, boolean>>({});
  let seen: Record<string, number> | null = null;
  let seenBank = 0;
  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  $effect.pre(() => {
    const now = Object.fromEntries(rows.map((r) => [r.key, r.earned]));
    const bankNow = bank;
    untrack(() => {
      const gained: Record<string, number> = {};
      if (seen) for (const [key, earned] of Object.entries(now)) {
        const more = earned - (seen[key] ?? earned);
        if (more > 0) gained[key] = more;
      }
      if (Object.keys(gained).length) {
        // Only Vouchers the Bank kept are held back from it (before it draws,
        // so it never counts early); any a full Bank lost say so on the row.
        const total = Object.values(gained).reduce((a, b) => a + b, 0);
        const kept = Math.min(total, Math.max(0, bankNow - seenBank));
        for (const key of Object.keys(gained)) {
          if (!(key in frozen)) frozen[key] = seen![key];
          if (kept < total) lost[key] = true;
        }
        wins.held += kept;
        play(gained, kept);
      }
      seen = now;
      seenBank = bankNow;
    });
  });

  async function play(gained: Record<string, number>, kept: number) {
    const keys = Object.keys(gained);
    await tick();
    reveal(keys);
    // Let a bar finish filling before anything plays (a tally has no fill).
    await wait(keys.some((k) => k !== "tasks") ? MOTION.move + 140 : MOTION.base);
    // The words, the Bank's count, and its green all start together and last
    // as long as each other.
    for (const k of keys) won[k] = true;
    wins.held = Math.max(0, wins.held - kept);
    if (kept) wins.lit++;
    await wait(WIN_HOLD_MS);
    if (kept) wins.lit = Math.max(0, wins.lit - 1);
    for (const k of keys) { delete won[k]; delete frozen[k]; delete lost[k]; }
  }
  // Nothing stays held back once Today is gone.
  onDestroy(() => { wins.held = 0; wins.lit = 0; });

  // Closest to a Voucher first, Tasks pinned on top. Neighbours only swap
  // once one is 3 points ahead, so near-ties don't flicker back and forth.
  const MOVE_MS = MOTION.move;
  const shownFraction = (k: string) => (k === "tasks" ? Infinity : k in frozen ? 1 : byKey[k]?.fraction ?? 0);
  let order = $state<string[]>([]);
  let lifted = $state<Record<string, boolean>>({});
  let lastFractions: Record<string, number> = {};
  $effect.pre(() => {
    const keys = rows.map((r) => r.key);
    const fractions = Object.fromEntries(keys.map((k) => [k, shownFraction(k)]));
    untrack(() => {
      const before = order;
      const next = before.length
        ? [...before.filter((k) => keys.includes(k)), ...keys.filter((k) => !before.includes(k))]
        : [...keys].sort((a, b) => fractions[b] - fractions[a]);
      for (let pass = 0; pass < next.length; pass++) {
        for (let i = 1; i < next.length; i++) {
          if (fractions[next[i]] - fractions[next[i - 1]] >= 0.03) [next[i - 1], next[i]] = [next[i], next[i - 1]];
        }
      }
      const previous = lastFractions;
      const grew = (k: string) => fractions[k] > (previous[k] ?? fractions[k]);
      lastFractions = fractions;
      if (next.join() === before.join()) return;
      // A row that moves up because its own progress grew is raised until it
      // lands. Rows that only shift up because another row dropped are not.
      if (before.length) for (const [i, k] of next.entries()) {
        const was = before.indexOf(k);
        if (was > i && grew(k)) { lifted[k] = true; setTimeout(() => delete lifted[k], MOVE_MS + 60); }
      }
      order = next;
    });
  });

  // On the tablet the list scrolls on its own: bring a row that's earning
  // into view (ScrollCue shows how many rows are out of view each way).
  let list = $state<HTMLDivElement>();
  function reveal(keys: string[]) {
    if (!list || list.scrollHeight <= list.clientHeight) return;
    const els = keys.map((k) => list!.querySelector<HTMLElement>(`[data-key="${k}"]`)).filter((el): el is HTMLElement => !!el);
    if (!els.length) return;
    const first = els.reduce((a, b) => (a.offsetTop < b.offsetTop ? a : b));
    const top = list.scrollTop, bottom = top + list.clientHeight;
    if (first.offsetTop < top || first.offsetTop + first.offsetHeight > bottom) {
      list.scrollTo({ top: Math.max(0, first.offsetTop - first.offsetHeight), behavior: "smooth" });
    }
  }
</script>

<section class="next">
  <div class="cap">Toward the next Voucher</div>
  <div class="frame">
    <ScrollCue target={list} />
    <!-- On the tablet only this list scrolls; the heading above it stays put. -->
    <div class="list" bind:this={list}>
      {#each order.filter((k) => byKey[k]) as key (key)}
        {@const s = byKey[key]}
        {@const held = key in frozen}
        <div class="src" class:lift={lifted[key]} class:won={won[key]} data-key={key} style="--c: {s.color}" animate:flip={{ duration: MOVE_MS, easing: easeOut }}>
          <span class="mk"><Marker kind="source" color={s.color} /><span class="ring"></span></span>
          <span class="name">{s.name}</span>
          <span class="mono detail"><span class="cnt">{held && s.tally === undefined ? s.full : s.detail}</span><span class="plus" class:lostit={lost[key]}>{lost[key] ? "Bank full" : "+1 Voucher"}</span></span>
          <span></span>
          {#if s.tally !== undefined}
            <div class="tally wide" aria-label="{s.tally} today">
              {#each { length: s.tally } as _}<i style="background: {s.color}"></i>{/each}
            </div>
          {:else}
            <div class="bar wide"><ProgressFill value={held ? 1 : s.fraction} laps={held ? frozen[key] : s.earned} color={s.color} /></div>
          {/if}
        </div>
      {/each}
    </div>
  </div>
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .frame { position: relative; display: flex; flex-direction: column; min-height: 0; flex: 1; }
  .list { position: relative; display: flex; flex-direction: column; }
  .mk { position: relative; display: flex; align-items: center; justify-content: center; }
  .src { position: relative; isolation: isolate; display: grid; grid-template-columns: 22px 1fr auto; column-gap: 10px; row-gap: 5px; align-items: center; padding: 5px 0; transition: scale var(--t-base) var(--ease-out); }
  /* A backdrop 6 px past the row on each side, as much room as above and below. */
  .src::before { content: ""; position: absolute; inset: 0 -6px; border-radius: 12px; z-index: -1; transition: background-color var(--t-base), box-shadow var(--t-base); }
  /* Raised while it moves up past the others. */
  .src.lift { z-index: 2; scale: 1.04; }
  .src.lift::before { background: #1c1f23; box-shadow: 0 8px 22px rgba(0, 0, 0, .6); }
  .name { font-size: 14px; font-weight: 500; }
  /* The count and "+1 Voucher" share one spot and crossfade. */
  .detail { font-size: 12px; color: var(--muted); display: grid; justify-items: end; }
  .detail > span { grid-area: 1 / 1; white-space: nowrap; transition: opacity var(--t-base) ease, transform var(--t-base) var(--ease-out); }
  .plus { color: var(--voucher); font-weight: 700; opacity: 0; transform: translateY(7px); }
  .plus.lostit { color: var(--goal); }
  .won .cnt { opacity: 0; transform: translateY(-7px); }
  .won .plus { opacity: 1; transform: none; }
  /* One ring off the marker; the marker and the bar flash together. */
  .ring { position: absolute; width: 12px; height: 12px; border-radius: 4px; border: 2px solid var(--c); opacity: 0; pointer-events: none; }
  .won .ring { animation: ring var(--t-emphasis) ease-out; }
  @keyframes ring { 0% { transform: scale(1); opacity: .9; } 100% { transform: scale(3.2); opacity: 0; } }
  .won .mk :global(.marker), .won .bar :global(i), .won .tally i:last-child { animation: flash var(--t-emphasis) ease; }
  @keyframes flash { 25% { filter: brightness(1.9) drop-shadow(0 0 6px var(--c)); } }
  .wide { grid-column: 2 / 4; }
  /* Visible, so the flash's glow isn't cut off at the track. */
  .bar { height: 6px; border-radius: 3px; background: var(--line); position: relative; overflow: visible; }
  .bar :global(i) { position: absolute; left: 0; top: 0; bottom: 0; border-radius: 3px; }
  /* One segment per task Voucher, on the same 6 px track as the bars. Each
     is 18 px until the track fills, then they narrow to fit, down to 3 px
     (about 45 on a phone); past that the rest are clipped. */
  .tally { height: 6px; border-radius: 3px; background: var(--line); display: flex; gap: 3px; overflow: hidden; }
  .tally i { flex: 0 1 18px; min-width: 3px; border-radius: 3px; transform-origin: left; animation: grow var(--t-move) var(--ease-out) both; }
  @keyframes grow { from { transform: scaleX(0); } }
</style>
