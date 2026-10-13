<script lang="ts" module>
  /** One key in a chart's legend: what the mark looks like, and what it means. */
  export type LegendItem = {
    /** line: a solid stroke; dash: a dotted stroke; box: a filled square; outline: a dashed hollow square;
     *  frame: a solid hollow square; corner: a square with a Marker's corner tick (heat grids); tick: a short upright mark (Habit strength's goal Days); opentick: a hollow one (an estimate); dot: a filled circle; flag: a Marker; usual: a dashed
     *  vertical line; hatch: unwatched time; goalbar: a green bar with the gold
     *  Daily goal tick across it (Vouchers earned); split: a bar in a few colors side by side (`colors`,
     *  such as Distraction by blocklist). */
    kind: "line" | "dash" | "box" | "outline" | "frame" | "corner" | "tick" | "opentick" | "dot" | "flag" | "usual" | "hatch" | "goalbar" | "split";
    color?: string;
    /** A split key's colors, left to right. */
    colors?: string[];
    label: string;
  };
</script>

<script lang="ts">
  // The legend under a chart, the same on every card: a row of keys, and
  // optionally a small note at the right ("7-day averages"). A `scale` draws
  // a Fewer-to-More run of colours instead, for heat grids. A flag key is a
  // hand-written Marker's colour unless given one (rule changes: --muted).
  // The keys are set as words in a line with balanced wrapping, so a legend
  // too long for one line splits into two even rows (3 and 3) rather than
  // leaving one or two keys alone on the second. The note comes first so it
  // floats to the first row's right end.
  let { items = [], scale, note }: { items?: LegendItem[]; scale?: { from: string; colors: string[]; to: string }; note?: string } = $props();
</script>

<div class="legend">
  {#if note}<span class="note">{note}</span>{/if}
  {#if scale}
    <span class="scale">{scale.from}{#each scale.colors as c}<i class="swatch" style="background: {c}"></i>{/each}{scale.to}</span>
  {/if}
  {#each items as it (it.label)}
    {#if it.kind === "flag"}
      <!-- A Marker's key is its flag, drawn as on the charts and the Marker button. -->
      <span><svg class="flagkey" width="10" height="12" viewBox="0 0 10 12" aria-hidden="true"><path d="M1.6 11.2V1" stroke={it.color ?? "var(--marker)"} stroke-width="1.6" stroke-linecap="round" /><path d="M1.6 1h7l-2 2.75 2 2.75h-7z" fill={it.color ?? "var(--marker)"} /></svg>{it.label}</span>
    {:else if it.kind === "split"}
      <span><i class="split">{#each it.colors ?? [] as c}<b style="background: {c}"></b>{/each}</i>{it.label}</span>
    {:else}
      <span><i class="{it.kind}" style="--c: {it.color ?? 'var(--muted)'}"></i>{it.label}</span>
    {/if}
  {/each}
</div>

<style>
  /* A block of inline keys, balanced across its rows. font-size: 0 keeps the
     spaces between keys from adding to the gaps; each key sets its own 12px.
     Rows are 22px apart, and the -3px margins give back the line's spare
     height above and below, so one row takes the 16px it did as a flex row. */
  .legend { display: block; text-wrap: balance; font-size: 0; line-height: 22px; margin-block: -3px; color: var(--muted); }
  .legend > span { display: inline-flex; align-items: center; vertical-align: middle; gap: 6px; margin-right: 14px; font-size: 12px; }
  .legend > span:last-child { margin-right: 0; }
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
  .flagkey { flex: none; }
  .tick { width: 2px; height: 9px; border-radius: 1px; background: var(--c); margin-inline: 4px; }
  .opentick { width: 4px; height: 10px; border-radius: 1px; border: 1.2px solid var(--c); box-sizing: border-box; margin-inline: 3px; }
  .usual { width: 2px; height: 12px; background: repeating-linear-gradient(180deg, var(--c) 0 3px, transparent 3px 5px); }
  /* Vouchers earned: part of a bar filled green, the gold goal tick standing over it. */
  .goalbar { width: 16px; height: 8px; border-radius: 2px; background: linear-gradient(90deg, var(--voucher) 0 70%, var(--heat-0) 70%); position: relative; }
  .goalbar::after { content: ""; position: absolute; left: 55%; top: -2px; width: 2px; height: 12px; background: var(--goal); }
  .split { width: 16px; height: 8px; border-radius: 2px; overflow: hidden; display: inline-flex; }
  .split b { flex: 1; }
  .hatch { width: 10px; height: 10px; border-radius: 3px; background: repeating-linear-gradient(135deg, rgba(255, 255, 255, .35) 0 2px, transparent 2px 4px); }
  /* Block layout has no auto margins along a row, so the note floats right. */
  .legend > .note { float: right; margin-right: 0; font-size: 11px; color: var(--axis-ink); }
</style>
