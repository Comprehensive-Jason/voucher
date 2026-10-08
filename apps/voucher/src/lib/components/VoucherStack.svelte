<script lang="ts">
  // The Bank as a stack of Vouchers. Drag the right-hand part of the top Voucher
  // to the right to tear off `count` Vouchers; the stub's + and − set `count`.
  import type { Mode } from "../types";

  let { mode, bank, unlockMinutes, room = null, curfewStart = "22:00", ontear }: {
    mode: Mode;
    bank: number;
    unlockMinutes: number;
    /** Minutes a tear could still add before Curfew (null: no limit known). */
    room?: number | null;
    curfewStart?: string;
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

  // After a tear, the Bank the stack shows runs ahead of the Ledger's answer,
  // so the stack can move at once; it lets go once the answer matches, or
  // after a few seconds if the Ledger said something else.
  let expected = $state<number | null>(null);
  const shown = $derived(expected ?? bank);
  $effect(() => { if (expected !== null && bank === expected) expected = null; });
  // Vouchers drawn behind the top one: the stack counts down with the Bank.
  const behind = (n: number) => (n >= 3 ? 2 : n >= 2 ? 1 : 0);
  // An empty Bank shows the empty slot at once, even while an Unlock runs.
  const empty = $derived(mode !== "curfew" && shown === 0);

  // The stack: the top Voucher (level 0) and up to two behind it, each 12 px
  // narrower on both sides and higher up. Every one is a stub and a right
  // half with the same notches and holes, so the ones behind can tear too.
  const LEVEL_TOP = [22, 10, 0, -10, -20, -30];
  const levelBox = (k: number) => `left: ${12 * k}px; right: ${12 * k}px; top: ${LEVEL_TOP[Math.min(k, 5)]}px`;
  const levelColor = (k: number) => mode === "curfew"
    ? (k === 0 ? "var(--night-voucher)" : k === 1 ? "#242e63" : "#1b2350")
    : (k === 0 ? "var(--voucher)" : k === 1 ? "var(--voucher-deep)" : "var(--voucher-deeper)");

  // After a tear the stack refills as a cascade: the next Voucher rises into
  // the top slot and each one behind moves up a place, STAGGER_MS apart
  // (MOVE_MS each); stubs of torn Vouchers fade, and new ones fade in at the
  // back. Then the new top Voucher's words fade in (FADE_MS).
  const MOVE_MS = 300;
  const STAGGER_MS = 70;
  const FADE_MS = 250;
  let phase = $state<"rest" | "rising" | "settling">("rest");
  let moves = $state<{ to: number; from: number; seen: boolean }[]>([]);
  let leavingStubs = $state<number[]>([]);

  // An Unlock never runs into Curfew: tears stop at what fits before it, and
  // once the running Unlock reaches it the Voucher says so instead of
  // pretending to tear. The last Voucher that fits may buy fewer minutes.
  const fits = $derived(room == null ? Infinity : Math.ceil(room / unlockMinutes));
  const capped = $derived(mode !== "curfew" && !empty && fits === 0);
  const minutes = $derived(room == null ? count * unlockMinutes : Math.min(count * unlockMinutes, room));

  const tearable = $derived(mode !== "curfew" && !empty && !capped);
  // Tearing several at once picks the Vouchers behind the top one, one per
  // press of +: a picked right half brightens (it stays in line, so its tear
  // line still meets its stub's). Up to the
  // two drawn behind are shown picked; the count says the rest. Picked halves
  // follow the drag with a slight lag (still behind the top stub) and fly off
  // after the top one, each a moment later and at its own angle.
  const pickedBack = $derived(tearable ? Math.min(count - 1, behind(shown)) : 0);
  function backTransform(k: number): string {
    if (k > pickedBack) return "none";
    if (torn) return `translate(${320 - 22 * k}px, ${-44 - 10 * k}px) rotate(${18 - 4 * k}deg)`;
    const t = dx * (1 - 0.08 * k);
    return `translate(${t}px, ${-t / 14}px) rotate(${t / 12 - k * 1.2 * Math.min(1, dx / 40)}deg)`;
  }
  const running = $derived(mode === "running");
  // Keep the chosen count within what the Bank holds.
  $effect(() => { const most = Math.max(1, Math.min(shown, fits)); if (count > most) count = most; });

  function down(e: PointerEvent) {
    if (!tearable) return;
    dragging = true;
    startX = e.clientX;
    body?.setPointerCapture(e.pointerId);
  }
  // Dragging the right-hand half past 40% of its width tears it then and
  // there, held or not; let go before that and it springs back.
  const TEAR_AT = 0.4;
  function move(e: PointerEvent) {
    if (!dragging) return;
    dx = Math.max(0, e.clientX - startX);
    if (body && dx > body.offsetWidth * TEAR_AT) up();
  }
  function up() {
    if (!dragging) return;
    dragging = false;
    if (body && dx > body.offsetWidth * TEAR_AT) {
      torn = true;
      const torn_ = count;
      const after = shown - torn_;
      const before = behind(shown);
      // With several, wait for the last picked half to finish its flight.
      const handOff = 260 + pickedBack * 45;
      setTimeout(() => {
        ontear(torn_);
        expected = after;
        setTimeout(() => { if (expected === after) expected = null; }, 4000);
        torn = false; dx = 0; count = 1;
        if (after > 0) {
          // Level `to` after the tear is the Voucher that was `torn_` levels further back.
          moves = Array.from({ length: behind(after) + 1 }, (_, to) => ({ to, from: to + torn_, seen: to + torn_ <= before }));
          leavingStubs = Array.from({ length: Math.min(torn_ - 1, before) }, (_, i) => i + 1);
          phase = "rising";
          const rise = MOVE_MS + (moves.length - 1) * STAGGER_MS;
          setTimeout(() => { phase = "settling"; setTimeout(() => (phase = "rest"), FADE_MS); }, rise);
        }
      }, handOff);
    } else {
      dx = 0;
    }
  }
</script>

<div class="stack" style="--perforation: {perforation}">
  {#if empty}
    <div class="none">
      <div class="nonetitle">No Vouchers to tear</div>
      <div class="nonesub">The next one you earn lands here</div>
    </div>
  {:else}
  {#if phase === "rest"}
    {#each Array.from({ length: behind(shown) }, (_, i) => behind(shown) - i) as k (k)}
      <div class="back" class:night={mode === "curfew"} style="{levelBox(k)}; --c: {levelColor(k)}">
        <div class="bstub"></div>
        <div class="bhalf" class:picked={k <= pickedBack} class:dragging class:torn
          style="transform: {backTransform(k)}; transition-delay: {torn ? k * 45 : 0}ms"></div>
      </div>
    {/each}
  {:else}
    {#each leavingStubs as k (k)}
      <div class="back leaving" style="{levelBox(k)}; --c: {levelColor(k)}"><div class="bstub"></div></div>
    {/each}
    {#each [...moves].reverse() as m (m.to)}
      <div class="back moving" style="--from-x: {12 * m.from}px; --from-y: {LEVEL_TOP[Math.min(m.from, 5)]}px; --to-x: {12 * m.to}px; --to-y: {LEVEL_TOP[m.to]}px; --from-o: {m.seen ? 1 : 0}; --from-c: {levelColor(m.from)}; --to-c: {levelColor(m.to)}; --delay: {m.to * STAGGER_MS}ms">
        <div class="bstub"></div><div class="bhalf"></div>
      </div>
    {/each}
  {/if}
  <div class="voucher" class:night={mode === "curfew"}>
    <div class="stub">
      {#if mode === "curfew"}
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
        <span class="cap stubcap">Curfew</span>
      {:else}
        <button class="step" aria-label="One Voucher more" disabled={!tearable || count >= Math.min(shown, fits)} onclick={() => count++}>
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
    <div class="bridge" class:away={dragging || torn || dx > 0 || phase !== "rest"}></div>
    <div
      class="body"
      class:dragging
      class:torn
      class:hidden={phase === "rising"}
      bind:this={body}
      style="transform: translate({torn ? 320 : dx}px, {torn ? -40 : -dx / 14}px) rotate({torn ? 18 : dx / 12}deg); {dragging && body ? `opacity: ${1 - (0.35 * dx) / (body.offsetWidth * TEAR_AT)}` : ''}"
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
      {#if capped}
        <div class="cap bodycap">This Unlock runs to Curfew</div>
        <div class="mono minutes">{curfewStart}</div>
        <div class="hint"><span>Your Vouchers stay in the Bank</span></div>
      {:else}
      <div class="cap bodycap">{running ? "Extend this Unlock" : "All distractions"}</div>
      <div class="mono minutes">{running ? "+" : ""}{minutes} min</div>
      <div class="hint">
        {#if mode === "curfew"}
          <span>Can't be torn tonight</span>
        {:else}
          <span>{running ? "Drag right to tear another" : "Drag right to tear"}</span>
          <svg aria-hidden="true" width="36" height="16" viewBox="0 0 36 16" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M3 2l6 6-6 6" opacity=".3" /><path d="M15 2l6 6-6 6" opacity=".6" /><path d="M27 2l6 6-6 6" /></svg>
        {/if}
      </div>
      {/if}
    </div>
  </div>
  {/if}
</div>

<style>
  .stack { position: relative; height: 140px; touch-action: pan-y; user-select: none; -webkit-user-select: none; --move: .3s; }
  .none { position: absolute; left: 0; right: 0; top: 22px; height: 116px; border-radius: 16px; border: 2px dashed #3a3f45; animation: arrive .2s ease both; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; text-align: center; }
  .nonetitle { font-size: 17px; font-weight: 700; }
  .nonesub { font-size: 13px; color: var(--muted); }
  /* The Vouchers behind the top one: a stub and a right half each, notched
     and holed like the top one, so picked ones can tear with it. */
  .back { position: absolute; height: 116px; display: flex; }
  .bstub, .bhalf { height: 100%; background: var(--c); }
  .bstub {
    width: 30%; border-radius: 16px 0 0 16px;
    -webkit-mask: var(--perforation) calc(100% + 2px) 0/4px 116px no-repeat, radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    -webkit-mask-composite: xor, source-over;
    mask: var(--perforation) calc(100% + 2px) 0/4px 116px no-repeat, radial-gradient(circle 11px at 100% 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 100% 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    mask-composite: exclude, add;
  }
  .bhalf {
    flex: 1; margin-left: -2px; border-left: 2px solid transparent; background-clip: padding-box;
    border-radius: 0 16px 16px 0; transform-origin: 0 100%;
    transition: transform .25s ease, opacity .25s ease, background-color .22s ease;
    -webkit-mask: var(--perforation) 0 0/4px 116px no-repeat, radial-gradient(circle 11px at 2px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 2px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    -webkit-mask-composite: xor, source-over;
    mask: var(--perforation) 0 0/4px 116px no-repeat, radial-gradient(circle 11px at 2px 0, transparent 98%, #000) top/100% 51% no-repeat, radial-gradient(circle 11px at 2px 100%, transparent 98%, #000) bottom/100% 51% no-repeat;
    mask-composite: exclude, add;
  }
  /* Picked to tear: brighter, and above the next column so
     it flies in front of it (but still under the top stub, z-index 6). */
  .bhalf.picked { position: relative; z-index: 4; background-color: color-mix(in oklab, var(--voucher) 70%, var(--c)); }
  .bhalf.dragging { transition: background-color .22s ease; }
  .bhalf.torn { opacity: 0; }
  /* The cascade after a tear: each level slides from where it was to its new
     place, taking on its new colour. */
  .back.moving { animation: settle-in var(--move) cubic-bezier(.2, .8, .2, 1) var(--delay) both; }
  .back.moving > * { animation: retint var(--move) cubic-bezier(.2, .8, .2, 1) var(--delay) both; }
  .back.leaving { animation: leave .18s ease forwards; }
  @keyframes settle-in {
    from { left: var(--from-x); right: var(--from-x); top: var(--from-y); opacity: var(--from-o); }
    to { left: var(--to-x); right: var(--to-x); top: var(--to-y); opacity: 1; }
  }
  @keyframes retint { from { background-color: var(--from-c); } to { background-color: var(--to-c); } }
  @keyframes leave { to { opacity: 0; } }
  @keyframes arrive { from { opacity: 0; } }
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
  /* The top stub stays above everything that moves, so halves torn from
     behind stay hidden under it until they're clear of it. */
  .stub { position: relative; z-index: 6; }
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
  /* Above everything while it moves, so a torn half flying right passes in
     front of the tablet's next column, not behind it. */
  .body { position: relative; z-index: 5; }
  .body.dragging { transition: none; cursor: grabbing; }
  .body.torn { opacity: 0; }
  /* Hidden while the next Voucher rises; then its words fade in. */
  .body.hidden { opacity: 0; transition: none; }
  .bodycap { color: inherit; }
  .minutes { font-size: 34px; font-weight: 700; line-height: 1; }
  .hint { display: flex; justify-content: space-between; align-items: center; font-size: 13px; font-weight: 700; }
</style>
