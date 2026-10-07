<script lang="ts">
  // Curfew's two knobs on an 18:00 to 10:00 track, in 30-minute steps.
  // Widening Curfew applies now; narrowing it waits for 06:00.
  let { start, end, pending = null, onchange }: {
    /** Minutes after midnight. */
    start: number; end: number;
    pending?: { start: number; end: number } | null;
    onchange: (start: number, end: number) => void;
  } = $props();

  const FROM = 18 * 60, SPAN = 16 * 60, STEP = 30;
  // Position on the track: minutes since 18:00, wrapping past midnight.
  const pos = (m: number) => ((m - FROM + 1440) % 1440);
  const pct = (m: number) => (pos(m) / SPAN) * 100;

  let track: HTMLDivElement;
  let which = $state<"start" | "end" | null>(null);
  let drag = $state<{ start: number; end: number } | null>(null);
  const shown = $derived(drag ?? { start, end });

  function minutesAt(e: PointerEvent): number {
    const r = track.getBoundingClientRect();
    const p = Math.min(SPAN, Math.max(0, ((e.clientX - r.left) / r.width) * SPAN));
    return (FROM + Math.round(p / STEP) * STEP) % 1440;
  }
  function down(e: PointerEvent) {
    const m = minutesAt(e);
    // Grab whichever knob is closer.
    which = Math.abs(pos(m) - pos(start)) <= Math.abs(pos(m) - pos(end)) ? "start" : "end";
    track.setPointerCapture(e.pointerId);
    drag = { start, end };
    move(e);
  }
  function move(e: PointerEvent) {
    if (!which || !drag) return;
    const m = minutesAt(e);
    // Keep at least 30 minutes of Curfew, start before end.
    if (which === "start" && pos(m) < pos(drag.end)) drag = { ...drag, start: m };
    if (which === "end" && pos(m) > pos(drag.start)) drag = { ...drag, end: m };
  }
  function up() {
    if (!drag) return;
    const d = drag;
    drag = null; which = null;
    if (d.start !== start || d.end !== end) onchange(d.start, d.end);
  }
</script>

<div class="track" bind:this={track} onpointerdown={down} onpointermove={move} onpointerup={up} onpointercancel={up}
  role="slider" tabindex="0" aria-label="Curfew" aria-valuenow={shown.start}>
  <div class="rail loose" style="left: 0; right: 0"></div>
  <div class="rail night" style="left: {pct(shown.start)}%; width: {pct(shown.end) - pct(shown.start)}%"></div>
  {#if pending}
    <div class="ghost" style="left: {pct(pending.start)}%"></div>
    <div class="ghost" style="left: {pct(pending.end)}%"></div>
  {/if}
  <div class="knob" style="left: {pct(shown.start)}%"></div>
  <div class="knob" style="left: {pct(shown.end)}%"></div>
</div>

<style>
  .track { position: relative; height: 28px; touch-action: none; cursor: pointer; }
  .rail { position: absolute; top: 11px; height: 6px; border-radius: 3px; }
  .loose { background: repeating-linear-gradient(135deg, #3a3f45 0 4px, #22262a 4px 8px); }
  .night { background: var(--night); }
  .knob { position: absolute; top: 2px; width: 24px; height: 24px; margin-left: -12px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 4px rgba(125, 140, 255, .3); }
  .ghost { position: absolute; top: 2px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; border: 2px dashed var(--goal); }
</style>
