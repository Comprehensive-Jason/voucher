<script lang="ts">
  // "Toward the next Voucher": each switched-on source's progress. Todoist and
  // ClickUp share one Tasks row; other sources fill a bar toward their rate.
  // At one Voucher per task there is nothing to fill, since each task earns
  // at once, so that row shows a tally of today's task Vouchers instead.
  import { styleOf } from "../sources";
  import ProgressFill from "./ProgressFill.svelte";
  import type { SourceProgress } from "../types";

  let { sources }: { sources: SourceProgress[] } = $props();

  const ORDER = ["tasks", "obsidian", "workout", "steps", "readwise", "moonreader", "anki"];

  const rows = $derived.by(() => {
    const on = sources.filter((s) => s.on);
    const tasks = on.filter((s) => s.kind === "tasks");
    const out: { key: string; name: string; color: string; detail: string; progress: number; earned: number; tally?: number }[] = [];
    if (tasks.length) {
      const earned = tasks.reduce((n, s) => n + s.earned, 0);
      const every = Math.max(...tasks.map((s) => s.every));
      const progress = every === 1 ? 0 : Math.max(...tasks.map((s) => s.progress / s.every));
      const rate = every === 1 ? "+1 each" : `1 per ${every}`;
      out.push({ key: "tasks", ...styleOf("tasks"), detail: `${rate} · ${earned} today`, progress, earned,
        tally: every === 1 ? earned : undefined });
    }
    for (const s of on.filter((s) => s.kind !== "tasks")) {
      const unit = s.kind === "workout" ? "zone min" : s.kind === "steps" ? "steps" : "min";
      out.push({ key: s.id, ...styleOf(s.id), detail: `${s.progress} / ${s.every} ${unit}`, progress: s.progress / s.every, earned: s.earned });
    }
    const rank = (k: string) => (ORDER.includes(k) ? ORDER.indexOf(k) : ORDER.length);
    return out.sort((a, b) => rank(a.key) - rank(b.key));
  });
</script>

<section>
  <div class="cap">Toward the next Voucher</div>
  {#each rows as s (s.key)}
    <div class="src">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s.color} stroke-width="2"><circle cx="12" cy="12" r="8" /></svg>
      <span class="name">{s.name}</span>
      <span class="mono detail">{s.detail}</span>
      <span></span>
      {#if s.tally !== undefined}
        <div class="tally wide" aria-label="{s.tally} today">
          {#each { length: s.tally } as _}<i style="background: {s.color}"></i>{/each}
        </div>
      {:else}
        <div class="bar wide"><ProgressFill value={s.progress} laps={s.earned} color={s.color} /></div>
      {/if}
    </div>
  {/each}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .src { display: grid; grid-template-columns: 22px 1fr auto; column-gap: 10px; row-gap: 5px; align-items: center; }
  .name { font-size: 14px; font-weight: 500; }
  .detail { font-size: 12px; color: var(--muted); }
  .wide { grid-column: 2 / 4; }
  /* One segment per task Voucher, on the same 6 px track as the bars. Each
     is 18 px until the track fills, then they narrow to fit, down to 3 px
     (about 45 on a phone); past that the rest are clipped. */
  .tally { height: 6px; border-radius: 3px; background: var(--line); display: flex; gap: 3px; overflow: hidden; }
  .tally i { flex: 0 1 18px; min-width: 3px; border-radius: 3px; transform-origin: left; animation: grow .35s ease both; }
  @keyframes grow { from { transform: scaleX(0); } }
</style>
