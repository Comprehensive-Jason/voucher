<script lang="ts">
  // A number set with − and + on either side of it, one look everywhere: a
  // goal's target, and any other number a sheet asks for. `format` shows the
  // value ("1h30", "23:30"); `wrap` makes it go round (a time of day) rather
  // than stop at `min` and `max`. Holding a button doesn't repeat: each tap
  // is one step, so a value never runs away.
  let { label, value, step = 1, min = 0, max = Infinity, wrap = false, format = String, unit = "", onchange }: {
    label: string;
    value: number;
    step?: number;
    min?: number;
    max?: number;
    wrap?: boolean;
    format?: (v: number) => string;
    /** Words after the value: "Vouchers", "a Day". */
    unit?: string;
    onchange: (v: number) => void;
  } = $props();

  function by(n: number) {
    let next = value + n * step;
    if (wrap) next = ((next - min) % (max - min) + (max - min)) % (max - min) + min;
    else next = Math.min(max, Math.max(min, next));
    if (next !== value) onchange(next);
  }
</script>

<div class="stepfield" role="group" aria-label={label}>
  <button class="iconbtn" aria-label="Less" disabled={!wrap && value - step < min} onclick={() => by(-1)}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M5 12h14" /></svg>
  </button>
  <output class="value" aria-live="polite"><b>{format(value)}</b>{#if unit}<span>{unit}</span>{/if}</output>
  <button class="iconbtn" aria-label="More" disabled={!wrap && value + step > max} onclick={() => by(1)}>
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>
  </button>
</div>

<style>
  .stepfield { display: flex; align-items: center; gap: 10px; }
  .value { flex: 1; min-width: 0; display: flex; align-items: baseline; justify-content: center; gap: 8px; height: 44px; padding: 0 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--raised); line-height: 44px; }
  .value b { font: 700 20px var(--mono); color: var(--ink); }
  .value span { font-size: 13px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
