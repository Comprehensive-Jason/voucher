<script lang="ts">
  // Does doing one thing make another easier? For each source, the Days it
  // earned against the Days it didn't, and the Days just after: did another
  // source earn more, or did Distraction time or unlocking run lower? Plain
  // averages, no guessing at causes. A finding shows only when both groups
  // have at least 8 Days and the difference is at least a quarter of that
  // measure's usual level; the largest first, at most six. The goal itself is
  // left out, since finishing more always meets it sooner. Each finding is a
  // row to read at a glance: the source's dot and name, an arrow (with a
  // "+1d" chip when it's the Day after), what went better, then a filled
  // bar for Days with it over a hollow one for Days without, on the row's own
  // scale, and the difference as a badge. Counts and averages sit in the
  // row's tooltip. The line under it keys the bars and says these go with,
  // not cause.
  import TrendCard from "../../components/TrendCard.svelte";
  import { measured } from "../../notes.svelte";
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

  type Effect = { id: string; name: string; color: string; value: (d: DayTotal) => number; more: boolean; unit: string; what: string };
  type Finding = { cause: { name: string; color: string }; effect: Effect; nextDay: boolean; withAvg: number; withoutAvg: number; withN: number; withoutN: number; size: number };
  const findings = $derived.by((): Finding[] => {
    const sources = [...new Set(days.flatMap((d) => Object.keys(d.by_source ?? {})))];
    // What a Day can be better at: each source's Vouchers, and less Distraction
    // time (grey: it isn't an Unlock) and unlocking (salmon, Unlocks' colour).
    const effects: Effect[] = [
      ...sources.map((id) => ({ id, name: styleOf(id).short, color: styleOf(id).color, value: (d: DayTotal) => d.by_source?.[id] ?? 0, more: true, unit: "", what: `${styleOf(id).name} Vouchers` })),
      { id: "~used", name: "Distraction", color: "var(--muted)", value: (d: DayTotal) => (measured(d) ? Object.values(d.used ?? {}).reduce((a, b) => a + b, 0) : NaN), more: false, unit: " min", what: "minutes in Distractions" },
      { id: "~unlocked", name: "Unlocked", color: "var(--spend)", value: (d: DayTotal) => d.unlocked_minutes ?? NaN, more: false, unit: " min", what: "minutes unlocked" },
    ];
    const out: Finding[] = [];
    const byDay = new Map(days.map((d) => [d.day, d]));
    const prevOf = (d: DayTotal) => byDay.get(new Date(Date.parse(`${d.day}T12:00:00Z`) - 86_400_000).toISOString().slice(0, 10));
    for (const a of sources) {
      const did = (d: DayTotal | undefined) => !!d && (d.by_source?.[a] ?? 0) > 0;
      for (const lag of [0, 1]) {
        // Same Day: Days with a against without. Next Day: Days after a Day with a against after one without.
        const pairs = days.map((d) => ({ d, cause: lag ? prevOf(d) : d })).filter((p) => p.cause);
        for (const o of effects) {
          if (o.id === a) continue;
          const yes = pairs.filter((p) => did(p.cause)).map((p) => o.value(p.d)).filter((v) => !Number.isNaN(v));
          const no = pairs.filter((p) => !did(p.cause)).map((p) => o.value(p.d)).filter((v) => !Number.isNaN(v));
          if (yes.length < MIN || no.length < MIN) continue;
          const y = mean(yes), n = mean(no), usual = mean([...yes, ...no]);
          const diff = y - n;
          if (!usual || Math.abs(diff) < SHARE * usual || Math.abs(diff) < 0.5) continue;
          // Only the helpful direction: more of a source, or less Distraction time and unlocking.
          if (diff > 0 !== o.more) continue;
          out.push({ cause: { name: styleOf(a).short, color: styleOf(a).color }, effect: o, nextDay: !!lag, withAvg: y, withoutAvg: n, withN: yes.length, withoutN: no.length, size: Math.abs(diff) / usual });
        }
      }
    }
    return out.sort((x, y) => y.size - x.size).slice(0, 6);
  });
  /** The difference, signed: "+1.3" Vouchers, or "−12m" for minutes. */
  const delta = (f: Finding) => { const d = f.withAvg - f.withoutAvg; const v = f.effect.unit ? `${Math.round(Math.abs(d))}m` : one(Math.abs(d)); return `${d < 0 ? "−" : "+"}${v}`; };
  // On the tablet the list fills its slot; rows that don't fit fade out at the bottom, to scroll to.
  let list = $state<HTMLElement>();
  let more = $state(false);
  $effect(() => {
    // Reading the findings re-checks when they change.
    if (!list || !findings.length) return;
    const el = list;
    const check = () => (more = el.scrollHeight - el.scrollTop - el.clientHeight > 2);
    const ro = new ResizeObserver(check);
    ro.observe(el);
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => { ro.disconnect(); el.removeEventListener("scroll", check); };
  });
  const tip = (f: Finding) => `${f.nextDay ? `The Day after ${f.cause.name}` : `Days with ${f.cause.name}`}: ${one(f.withAvg)}${f.effect.unit} ${f.effect.what} against ${one(f.withoutAvg)}${f.effect.unit} (${f.withN} Days with, ${f.withoutN} without)`;
</script>

<TrendCard title="What goes with a good Day">
  {#if days.length < 30}
    <p class="empty">Needs about a month of Days to say anything; {days.length} so far.</p>
  {:else if !findings.length}
    <p class="empty">Nothing stands out yet: no activity goes with another doing better.</p>
  {:else}
    <div class="list" class:fit class:more bind:this={list}>
      {#each findings as f (tip(f))}
        {@const top = Math.max(f.withAvg, f.withoutAvg) || 1}
        <div class="finding" title={tip(f)}>
          <span class="who"><i style="background: {f.cause.color}"></i><span>{f.cause.name}</span></span>
          <span class="link" class:next={f.nextDay}>{#if f.nextDay}<span class="chip">+1d</span>{/if}→</span>
          <span class="who"><i style="background: {f.effect.color}"></i><span>{f.effect.name}</span></span>
          <span class="pair" aria-hidden="true">
            <i class="with" style="width: {(f.withAvg / top) * 100}%; background: {f.effect.color}"></i>
            <i class="without" style="width: {(f.withoutAvg / top) * 100}%; border-color: {f.effect.color}"></i>
          </span>
          <b class="delta">{delta(f)}</b>
        </div>
      {/each}
    </div>
  {/if}
  {#snippet foot()}<i class="key with"></i>with <i class="key without"></i>without. Goes with, not causes.{/snippet}
</TrendCard>

<style>
  /* The rows share the list's columns (subgrid), so names, arrows, and bars line up down the card. */
  .list { display: grid; grid-template-columns: minmax(0, max-content) auto minmax(0, max-content) minmax(28px, 1fr) auto; column-gap: 7px; row-gap: 4px; align-content: start; }
  .list.fit { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .list.more { mask-image: linear-gradient(to bottom, #000 calc(100% - 22px), transparent); }
  /* One row a finding: cause, link, effect, then the paired bars and the badge. */
  .finding { grid-column: 1 / -1; display: grid; grid-template-columns: subgrid; align-items: center; column-gap: 7px; padding: 7px 10px; border-radius: 10px; background: var(--raised); font-size: 13px; }
  .who { display: flex; align-items: center; gap: 6px; min-width: 0; color: var(--ink); }
  .who i { flex: none; width: 8px; height: 8px; border-radius: 50%; }
  .who span { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  /* Centred, so plain arrows line up with the ones carrying a chip. */
  .link { display: flex; align-items: center; justify-content: center; gap: 3px; color: var(--muted); font: 500 12px var(--mono); }
  .chip { padding: 0 4px; border-radius: 6px; background: var(--line); color: var(--ink); font: 600 10px/16px var(--mono); white-space: nowrap; }
  /* Days with: filled; Days without: hollow, in the same colour, on one scale. */
  .pair { width: 100%; max-width: 140px; justify-self: end; display: flex; flex-direction: column; gap: 3px; }
  .pair i { display: block; height: 6px; min-width: 2px; border-radius: 3px; box-sizing: border-box; }
  .pair .without { border: 1.5px solid; background: transparent; opacity: .8; }
  .delta { min-width: 4ch; text-align: right; font: 700 12px var(--mono); color: var(--voucher); }
  /* The bars' key, inline in the line under the card. */
  :global(.foot) .key { display: inline-block; width: 12px; height: 6px; margin: 0 4px 1px 0; border-radius: 3px; vertical-align: middle; }
  :global(.foot) .key.with { background: var(--muted); }
  :global(.foot) .key.without { margin-left: 4px; border: 1.5px solid var(--muted); }
</style>
