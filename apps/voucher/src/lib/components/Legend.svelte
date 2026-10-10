<script lang="ts" module>
  /** One key in a chart's legend: what the mark looks like, and what it means. */
  export type LegendItem = {
    /** line: a solid stroke; dash: a dotted stroke; box: a filled square; outline: a dashed hollow square;
     *  frame: a solid hollow square; corner: a square with a Marker's corner tick (heat grids); dot: a filled circle; ring: a hollow circle; flag: a Marker; usual: a dashed
     *  vertical line; hatch: unwatched time. */
    kind: "line" | "dash" | "box" | "outline" | "frame" | "corner" | "dot" | "ring" | "flag" | "usual" | "hatch";
    color?: string;
    label: string;
  };
</script>

<script lang="ts">
  // The legend under a chart, the same on every card: a row of keys, and
  // optionally a small note at the right ("7-day averages"). A `scale` draws
  // a Fewer-to-More run of colours instead, for heat grids. A flag key is a
  // hand-written Marker's colour unless given one (rule changes: --muted).
  let { items = [], scale, note }: { items?: LegendItem[]; scale?: { from: string; colors: string[]; to: string }; note?: string } = $props();
</script>

<div class="legend">
  {#if scale}
    <span class="scale">{scale.from}{#each scale.colors as c}<i class="swatch" style="background: {c}"></i>{/each}{scale.to}</span>
  {/if}
  {#each items as it (it.label)}
    {#if it.kind === "flag"}
      <!-- A Marker's key is its flag, drawn as on the charts and the Marker button. -->
      <span><svg class="flagkey" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1.6 11.2V1" stroke={it.color ?? "var(--marker)"} stroke-width="1.6" stroke-linecap="round" /><path d="M1.6 1h7l-2 2.75 2 2.75h-7z" fill={it.color ?? "var(--marker)"} /></svg>{it.label}</span>
    {:else}
      <span><i class="{it.kind}" style="--c: {it.color ?? 'var(--muted)'}"></i>{it.label}</span>
    {/if}
  {/each}
  {#if note}<span class="note">{note}</span>{/if}
</div>

<style>
  .legend { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 14px; font-size: 12px; color: var(--muted); }
  .legend > span { display: inline-flex; align-items: center; gap: 6px; }
  .scale { gap: 4px !important; }
  i { display: inline-block; flex: none; }
  .swatch { width: 12px; height: 12px; border-radius: 3px; }
  .line { width: 14px; height: 3px; border-radius: 2px; background: var(--c); }
  .dash { width: 14px; height: 3px; background: repeating-linear-gradient(90deg, var(--c) 0 3px, transparent 3px 5px); }
  .box { width: 10px; height: 10px; border-radius: 3px; background: var(--c); }
  .outline { width: 10px; height: 10px; border-radius: 3px; border: 1.5px dashed var(--c); box-sizing: border-box; }
  /* A grid square with the corner tick a Marker's Day carries (Activity). */
  .corner { width: 10px; height: 10px; border-radius: 3px; background: var(--heat-0); position: relative; overflow: hidden; }
  .corner::after { content: ""; position: absolute; top: 0; right: 0; border-top: 6px solid var(--c); border-left: 6px solid transparent; }
  .frame { width: 10px; height: 10px; border-radius: 3px; border: 1.5px solid var(--c); box-sizing: border-box; }
  .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--c); }
  .ring { width: 8px; height: 8px; border-radius: 50%; border: 1.5px solid var(--c); box-sizing: border-box; }
  .flagkey { flex: none; }
  .usual { width: 2px; height: 12px; background: repeating-linear-gradient(180deg, var(--c) 0 3px, transparent 3px 5px); }
  .hatch { width: 10px; height: 10px; border-radius: 3px; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .35) 0 2px, transparent 2px 4px); }
  .note { margin-left: auto; font-size: 11px; color: var(--axis-ink); }
</style>
