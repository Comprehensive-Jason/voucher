<script lang="ts">
  // The Bank as a stack of Vouchers. Drag the right-hand part of the top Voucher
  // to the right to tear off `count` Vouchers; the stub's + and − set `count`.
  import type { Mode } from "../types";

  let { mode, bank, unlockMinutes, ontear }: {
    mode: Mode;
    bank: number;
    unlockMinutes: number;
    ontear: (count: number) => void;
  } = $props();

  let count = $state(1);
  let dx = $state(0);
  let dragging = $state(false);
  let torn = $state(false);
  let startX = 0;
  let body = $state<HTMLDivElement>();

  // The tear line is a row of holes cut out of the Voucher, like the notches,
  // so whatever is behind (the next Voucher, or the page) shows through. The
  // notches end at y 11 and 105: eight 7.25 px dashes leave nine equal 4 px
  // gaps, one at each notch and seven between dashes. Each half cuts its own
  // half of every hole, so a torn-off body carries its half away.
  const holes = Array.from({ length: 8 }, (_, i) =>
    `<rect x='.75' y='${15 + i * 11.25}' width='2.5' height='7.25' rx='1.25'/>`).join("");
  const perforation = `url("data:image/svg+xml,${encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' width='4' height='116'>${holes}</svg>`)}")`;

  const tearable = $derived(mode !== "curfew" && mode !== "empty" && bank > 0);
  const running = $derived(mode === "running");
  // Keep the chosen count within what the Bank holds.
  $effect(() => { if (count > Math.max(1, bank)) count = Math.max(1, bank); });

  function down(e: PointerEvent) {
    if (!tearable) return;
    dragging = true;
    startX = e.clientX;
    body?.setPointerCapture(e.pointerId);
  }
  function move(e: PointerEvent) {
    if (dragging) dx = Math.max(0, e.clientX - startX);
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    // Past 40% of the Voucher's width counts as a tear; anything less springs back.
    if (body && dx > body.offsetWidth * 0.4) {
      torn = true;
      setTimeout(() => { ontear(count); torn = false; dx = 0; count = 1; }, 260);
    } else {
      dx = 0;
    }
  }
</script>

<div class="stack">
  {#if mode === "empty"}
    <div class="none">
      <div class="nonetitle">No Vouchers to tear</div>
      <div class="nonesub">The next one you earn lands here</div>
    </div>
  {:else}
  {#if bank > 1}
    <div class="layer far" class:night={mode === "curfew"}></div>
    <div class="layer near" class:night={mode === "curfew"}></div>
  {/if}
  <div class="voucher" class:night={mode === "curfew"} style="--perforation: {perforation}">
    <div class="stub">
      {#if mode === "curfew"}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
        <span class="cap stubcap">Curfew</span>
      {:else}
        <button class="step" aria-label="One Voucher more" disabled={!tearable || count >= bank} onclick={() => count++}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
        </button>
        <div class="mono count">{tearable ? count : 0}</div>
        <button class="step" aria-label="One Voucher fewer" disabled={!tearable || count <= 1} onclick={() => count--}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M6 12h12" /></svg>
        </button>
      {/if}
    </div>
    <!-- Where the seam falls between pixels, the two halves' soft edges leave a
         faint hairline. This strip, holed like the Voucher, covers it while the
         Voucher is at rest, and gets out of the way once a drag begins. -->
    <div class="bridge" class:away={dragging || torn || dx > 0}></div>
    <div
      class="body"
      class:dragging
      class:torn
      bind:this={body}
      style="transform: translate({torn ? 320 : dx}px, {torn ? -40 : -dx / 14}px) rotate({torn ? 18 : dx / 12}deg)"
      onpointerdown={down}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
      role="slider"
      aria-label="Drag right to tear"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(dx)}
      tabindex="0"
    >
      <div class="cap bodycap">{running ? "Extend this Unlock" : "All distractions"}</div>
      <div class="mono minutes">{running ? "+" : ""}{count * unlockMinutes} min</div>
      <div class="hint">
        {#if mode === "curfew"}
          <span>Can't be torn tonight</span>
        {:else}
          <span>{running ? "Drag right to tear another" : "Drag right to tear"}</span>
          <svg aria-hidden="true" width="36" height="16" viewBox="0 0 36 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2l6 6-6 6" opacity=".3" /><path d="M15 2l6 6-6 6" opacity=".6" /><path d="M27 2l6 6-6 6" /></svg>
        {/if}
      </div>
    </div>
  </div>
  {/if}
</div>

<style>
  .stack { position: relative; height: 140px; touch-action: pan-y; }
  .none { position: absolute; left: 0; right: 0; top: 22px; height: 116px; border-radius: 16px; border: 2px dashed #3a3f45; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .nonetitle { font-size: 17px; font-weight: 700; }
  .nonesub { font-size: 13px; color: var(--muted); }
  .layer { position: absolute; height: 116px; border-radius: 16px; }
  .far { left: 24px; right: 24px; top: 0; background: var(--voucher-deeper); }
  .near { left: 12px; right: 12px; top: 10px; background: var(--voucher-deep); }
  .layer.night.far { background: #1b2350; }
  .layer.night.near { background: #242e63; }
  .voucher {
    position: absolute; left: 0; right: 0; top: 22px; height: 116px; display: flex; color: var(--voucher-ink);
  }
  .stub, .body { background: var(--voucher); height: 100%; }
  .night .stub, .night .body { background: var(--night-voucher); color: #e8ebff; }
  .stub {
    width: 30%; border-radius: 16px 0 0 16px; padding: 6px 8px; display: flex; flex-direction: column;
    align-items: stretch; justify-content: center; gap: 2px;
    /* Mask layers: the holes, cut (exclude) from the two notched halves, which
       overlap and add up so no hairline shows where they meet. */
    -webkit-mask: var(--perforation) calc(100% + 2px) 0/4px 116px no-repeat, radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    -webkit-mask-composite: xor, source-over;
    mask: var(--perforation) calc(100% + 2px) 0/4px 116px no-repeat, radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    mask-composite: exclude, add;
  }
  .night .stub { align-items: center; gap: 8px; }
  .bridge {
    position: absolute; top: 0; left: calc(30% - 1px); width: 2px; height: 100%; background: var(--voucher);
    pointer-events: none; transition: visibility 0s .25s;
    -webkit-mask: var(--perforation) -1px 0/4px 116px no-repeat, radial-gradient(circle 11px at 1px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 1px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    -webkit-mask-composite: xor, source-over;
    mask: var(--perforation) -1px 0/4px 116px no-repeat, radial-gradient(circle 11px at 1px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 1px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    mask-composite: exclude, add;
  }
  .night .bridge { background: var(--night-voucher); }
  /* Gone at once when a drag starts; back only after the body springs home. */
  .bridge.away { visibility: hidden; transition: none; }
  .stubcap { color: var(--night-ink); }
  .step {
    height: 34px; padding: 0; border: 0; border-radius: 10px; background: rgba(7, 23, 13, .14);
    color: var(--voucher-ink); display: flex; align-items: center; justify-content: center; cursor: pointer;
  }
  .step:disabled { opacity: .35; cursor: default; }
  .count { font-size: 22px; font-weight: 700; line-height: 28px; text-align: center; }
  .body {
    /* The body starts 2 px left of the seam behind a transparent border, so its
       visible edge and half-holes come from the mask. A tilted box edge is
       smoothed from the raw fill, ignoring the mask, and left a faint line. */
    flex: 1; margin-left: -2px; border-left: 2px solid transparent; background-clip: padding-box;
    border-radius: 0 16px 16px 0; padding: 16px 18px; display: flex; flex-direction: column;
    justify-content: space-between; cursor: grab; touch-action: none; transform-origin: 0 100%;
    transition: transform .25s ease, opacity .25s ease;
    -webkit-mask: var(--perforation) 0 0/4px 116px no-repeat, radial-gradient(circle 11px at 2px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 2px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    -webkit-mask-composite: xor, source-over;
    mask: var(--perforation) 0 0/4px 116px no-repeat, radial-gradient(circle 11px at 2px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 2px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    mask-composite: exclude, add;
  }
  .body.dragging { transition: none; cursor: grabbing; }
  .body.torn { opacity: 0; }
  .bodycap { color: inherit; }
  .minutes { font-size: 34px; font-weight: 700; line-height: 1; }
  .hint { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; }
</style>
