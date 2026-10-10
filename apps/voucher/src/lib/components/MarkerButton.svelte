<script lang="ts">
  // Adds a Marker: something that changed (a new term, a dose, a rule), so
  // Before and after can compare the Days either side of it. In the Markers'
  // own colour, filled: the cream their flags have on every chart, so it
  // stands out from the grey buttons and means only this. `tall` fills the height of
  // whatever it sits beside, with its label under the flag.
  let { tall = false, onclick }: { tall?: boolean; onclick?: () => void } = $props();
</script>

<button class="marker" class:tall {onclick} aria-label="Add a Marker">
  <svg width={tall ? 26 : 18} height={tall ? 26 : 18} viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 21V4" /><path d="M5 4h11l-2 4 2 4H5" fill="currentColor" fill-opacity=".25" /></svg>
  <span>{tall ? "Add Marker" : "Marker"}</span>
</button>

<style>
  .marker { flex: none; height: 44px; padding: 0 14px 0 12px; border-radius: 14px; display: inline-flex; align-items: center; gap: 8px; cursor: pointer;
    font: 700 14px var(--font); color: var(--ground); background: var(--marker); border: 0;
    transition: background-color var(--t-quick), scale var(--t-quick) var(--ease-out); }
  .marker:active { scale: .97; }
  .marker:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
  .tall { height: auto; align-self: stretch; width: 96px; padding: 12px 8px; flex-direction: column; justify-content: center; gap: 8px; border-radius: 16px; font-size: 13px; text-align: center; }
</style>
