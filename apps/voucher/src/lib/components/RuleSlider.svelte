<script lang="ts">
  // A rule's slider. The green fill shows how strict the rule is: it runs from
  // the knob to the loose end, so the stricter the setting, the more green.
  // The hatched part is the room left on the strict side. Moving toward the
  // strict end applies now; moving toward the loose end waits for 06:00 and
  // leaves a dashed ghost knob where the pending value will land.
  // `kind="goal"` draws a plain amber fill instead, with no strict or loose side.
  // `strict="right"` flips the sides, for rates where a bigger number is
  // stricter (more minutes per Voucher). `small` is the compact source slider.
  let { min, max, step = 1, value, pending = null, kind = "limit", strict = "left", small = false, onpreview, onchange }: {
    min: number; max: number; step?: number; value: number; pending?: number | null;
    kind?: "limit" | "goal"; strict?: "left" | "right"; small?: boolean;
    /** Told the value the knob is snapped to while dragging, for the label to show; null when let go. */
    onpreview?: (value: number | null) => void;
    onchange: (value: number) => void;
  } = $props();

  let track: HTMLDivElement;
  let dragging = $state<number | null>(null);
  const shown = $derived(dragging ?? value);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;

  function at(e: PointerEvent): number {
    const r = track.getBoundingClientRect();
    const raw = min + ((e.clientX - r.left) / r.width) * (max - min);
    return Math.min(max, Math.max(min, Math.round(raw / step) * step));
  }
  function down(e: PointerEvent) { track.setPointerCapture(e.pointerId); dragging = at(e); onpreview?.(dragging); }
  function move(e: PointerEvent) {
    if (dragging === null) return;
    const v = at(e);
    if (v !== dragging) { dragging = v; onpreview?.(v); }
  }
  function up() {
    if (dragging === null) return;
    const v = dragging;
    dragging = null;
    onpreview?.(null);
    if (v !== value) onchange(v);
  }
</script>

<div
  class="track"
  class:small
  bind:this={track}
  onpointerdown={down}
  onpointermove={move}
  onpointerup={up}
  onpointercancel={up}
  role="slider"
  tabindex="0"
  aria-valuemin={min}
  aria-valuemax={max}
  aria-valuenow={shown}
>
  {#if kind === "goal"}
    <div class="rail" style="left: 0; right: 0; background: var(--line)"></div>
    <div class="rail" style="left: 0; width: {pct(shown)}%; background: var(--goal)"></div>
  {:else if strict === "left"}
    <div class="rail room" style="left: 0; width: {pct(value)}%"></div>
    <div class="rail strictness" style="left: {pct(value)}%; right: 0"></div>
  {:else}
    <div class="rail strictness" style="left: 0; width: {pct(value)}%"></div>
    <div class="rail room" style="left: {pct(value)}%; right: 0"></div>
  {/if}
  {#if pending !== null}<div class="ghost" style="left: {pct(pending)}%"></div>{/if}
  <div class="knob" class:goal={kind === "goal"} style="left: {pct(shown)}%"></div>
</div>

<style>
  .track { position: relative; height: 28px; touch-action: none; cursor: pointer; }
  .rail { position: absolute; top: 11px; height: 6px; border-radius: 3px; }
  .strictness { background: var(--voucher); }
  .room { background: repeating-linear-gradient(135deg, #3a3f45 0 4px, #22262a 4px 8px); }
  .knob { position: absolute; top: 2px; width: 24px; height: 24px; margin-left: -12px; border-radius: 50%; background: var(--ink); box-shadow: 0 0 0 4px rgba(61, 220, 132, .25); }
  .knob.goal { box-shadow: 0 0 0 4px rgba(255, 181, 71, .25); }
  .small .knob { top: 4px; width: 20px; height: 20px; margin-left: -10px; box-shadow: none; }
  .small .ghost { top: 4px; width: 18px; height: 18px; margin-left: -9px; }
  .ghost { position: absolute; top: 2px; width: 22px; height: 22px; margin-left: -11px; border-radius: 50%; border: 2px dashed var(--goal); }
</style>
