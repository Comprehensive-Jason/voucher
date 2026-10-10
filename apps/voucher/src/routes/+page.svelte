<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the Today column stays put on the left, and the rest is a row of columns
  // that scrolls sideways, two in view at a time, holding the charts and the
  // Log in whatever arrangement was chosen here (see arrangement.svelte.ts).
  import { onMount, tick } from "svelte";
  import { fade } from "svelte/transition";
  import { arrangement, PANELS, ROWS, type PanelId } from "$lib/arrangement.svelte";
  import { fillSlots } from "$lib/fit.svelte";
  import { EASE, ms } from "$lib/motion";
  import { deviceUsage, ledger } from "$lib/api";
  import { Live, POLL_MS } from "$lib/live.svelte";
  import { wide } from "$lib/wide.svelte";
  import { historyDays } from "$lib/time";
  import TodayColumn from "$lib/panels/TodayColumn.svelte";
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import TrendLines from "$lib/panels/trends/TrendLines.svelte";
  import WhenYouEarn from "$lib/panels/trends/WhenYouEarn.svelte";
  import PaceToGoal from "$lib/panels/trends/PaceToGoal.svelte";
  import MorningRunway from "$lib/panels/trends/MorningRunway.svelte";
  import HabitStrength from "$lib/panels/trends/HabitStrength.svelte";
  import StreakLadder from "$lib/panels/trends/StreakLadder.svelte";
  import SourceStreaks from "$lib/panels/trends/SourceStreaks.svelte";
  import PersonalRecords from "$lib/panels/trends/PersonalRecords.svelte";
  import type { DayTotal, DeviceUsage, Status } from "$lib/types";

  const live = new Live();
  // The strip's panels fill their slots (thirds of a column).
  fillSlots();
  let status = $state<Status | null>(null);
  let history = $state<DayTotal[]>([]);
  let usage = $state<DeviceUsage | null>(null);
  // Tapping a Day in the history grid scrolls the hour chart to it.
  let focus = $state<{ day: string; at: number } | null>(null);
  let shownDay = $state<string | undefined>();

  // The tablet's other columns refresh less often than the Voucher stack.
  async function loadWide() {
    try {
      status = await ledger<Status>("GET", "/status");
      history = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(status.today.day, status.first_day)}`);
      usage = await deviceUsage();
    } catch { /* the Today column shows the error */ }
  }

  onMount(() => live.start());

  // ---- Arranging ----
  // Hold a panel's heading (or, while arranging, any panel) and drag it: the
  // others make room as it passes, as on a phone's home screen. While
  // arranging, panels jiggle, and each shows its size buttons and Hide.
  let arranging = $state(false);
  let strip = $state<HTMLDivElement>();
  /** Every panel's place in the grid: its column, first row, and height in thirds. */
  const placed = $derived(arrangement.columns.flatMap((column, col) => {
    let row = 0;
    return column.map((id) => { const size = arrangement.size(id); const p = { id, col, row, size }; row += size; return p; });
  }));
  const slotOf = (id: PanelId) => strip?.querySelector<HTMLElement>(`.slot[data-id="${id}"]`) ?? null;

  /** Each change animates the panels' real layout, not pictures of them:
   *  every panel is measured before and after, then slides from where it was
   *  and, if its height changed, grows or shrinks to the new one, with its
   *  contents laid out afresh each frame. Panels coming back fade in. The
   *  panel being dragged follows the finger instead. */
  async function rearrange(change: () => void) {
    const slots = () => new Map([...(strip?.querySelectorAll<HTMLElement>(".slot[data-id]") ?? [])].map((el) => [el.dataset.id!, el]));
    const before = new Map([...slots()].map(([id, el]) => [id, el.getBoundingClientRect()]));
    change();
    await tick();
    const timing = { duration: ms("move"), easing: EASE.out };
    for (const [id, el] of slots()) {
      if (id === dragging?.id) continue;
      const was = before.get(id), now = el.getBoundingClientRect();
      if (!was) { el.animate([{ opacity: 0, transform: "scale(.96)" }, { opacity: 1, transform: "none" }], timing); continue; }
      const dx = was.left - now.left, dy = was.top - now.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1 && Math.abs(was.height - now.height) < 1) continue;
      el.animate([
        { transform: `translate(${dx}px, ${dy}px)`, height: `${was.height}px` },
        { transform: "none", height: `${now.height}px` },
      ], timing);
    }
  }
  /** A hidden panel fades and shrinks away first, then the rest close the gap. */
  async function hide(id: PanelId) {
    await slotOf(id)?.animate([{ opacity: 1, transform: "none" }, { opacity: 0, transform: "scale(.96)" }], { duration: ms("base"), easing: EASE.in, fill: "forwards" }).finished;
    rearrange(() => arrangement.hide(id));
  }

  // ---- Dragging ----
  const HOLD_MS = 450;
  /** A press on a heading that becomes a drag if held. */
  let pressing: { id: PanelId; x: number; y: number; pointer: number; timer: number } | null = null;
  /** The panel following the finger: where the finger holds it, and where the finger is. */
  let dragging = $state<{ id: PanelId; ox: number; oy: number; x: number; y: number; pointer: number } | null>(null);

  function onPress(e: PointerEvent, id: PanelId) {
    const target = e.target as HTMLElement;
    if (target.closest("button, a, input")) return;
    if (arranging) { startDrag(id, e.clientX, e.clientY, e.pointerId); return; }
    // Only a heading starts arranging, so a hold on a chart or a list does its own thing.
    if (!target.closest(".cardhead, header")) return;
    const press = { id, x: e.clientX, y: e.clientY, pointer: e.pointerId, timer: 0 };
    press.timer = window.setTimeout(() => {
      pressing = null;
      arranging = true;
      navigator.vibrate?.(12);
      swallowClick();
      startDrag(id, press.x, press.y, press.pointer);
    }, HOLD_MS);
    pressing = press;
  }
  /** The release that ends a long press isn't also a tap on what's under it. */
  function swallowClick() {
    const stop = (ev: Event) => { ev.preventDefault(); ev.stopPropagation(); };
    window.addEventListener("click", stop, { capture: true, once: true });
    setTimeout(() => window.removeEventListener("click", stop, { capture: true }), 600);
  }
  function startDrag(id: PanelId, x: number, y: number, pointer: number) {
    const el = slotOf(id);
    if (!el) return;
    const r = el.getBoundingClientRect();
    dragging = { id, ox: x - r.left, oy: y - r.top, x, y, pointer };
    try { el.setPointerCapture(pointer); } catch { /* the window's listeners still follow it */ }
    follow();
    requestAnimationFrame(edgeScroll);
  }
  /** Keeps the dragged panel under the finger, wherever the grid has put it. */
  function follow() {
    const d = dragging, el = d && slotOf(d.id);
    if (!d || !el || !strip) return;
    const box = strip.getBoundingClientRect();
    const left = box.left - strip.scrollLeft + el.offsetLeft, top = box.top + el.offsetTop;
    el.style.transform = `translate(${d.x - d.ox - left}px, ${d.y - d.oy - top}px) scale(1.03)`;
  }
  /** Where the drop would put it, shown while dragging and applied on release:
   *  into a column with room (at the finger's height), a column of its own
   *  (near the side of a full column, or past the last), or a trade of places
   *  with a panel the same height. Positions are in the strip's own pixels. */
  type Target = { change: () => void; ghost?: { left: number; top: number; width: number; height: number }; bar?: number; swap?: PanelId };
  let target = $state<Target | null>(null);
  function retarget() {
    const d = dragging;
    if (!d || !strip) return;
    const snaps = [...strip.querySelectorAll<HTMLElement>(":scope > .snap")];
    const box = strip.getBoundingClientRect();
    const x = d.x - box.left + strip.scrollLeft, y = d.y - box.top;
    const width = snaps[0] ? (strip.querySelector<HTMLElement>(".endcol")?.offsetWidth ?? 0) : 0;
    const gap = 20, rowH = (strip.clientHeight - gap * (ROWS - 1)) / ROWS;
    const heightOf = (thirds: number) => thirds * rowH + (thirds - 1) * gap;
    const size = arrangement.size(d.id);
    const from = arrangement.columns.findIndex((c) => c.includes(d.id));
    const col = snaps.findIndex((el) => x < el.offsetLeft + width + 12);
    // Past the last column: a column of its own at the end.
    if (col < 0) {
      const last = arrangement.columns.at(-1)!;
      target = from === arrangement.columns.length - 1 && last.length === 1 ? null
        : { change: () => arrangement.place(d.id, arrangement.columns.length, 0), ghost: { left: strip.querySelector<HTMLElement>(".endcol")!.offsetLeft, top: 0, width, height: heightOf(size) } };
      return;
    }
    const left = snaps[col].offsetLeft, rel = (x - left) / width;
    const others = arrangement.columns[col].filter((p) => p !== d.id);
    if (arrangement.fits(d.id, col) && rel >= 0.15 && rel <= 0.85) {
      const at = others.filter((p) => { const el = slotOf(p); return el && el.offsetTop + el.offsetHeight / 2 < y; }).length;
      const top = others.slice(0, at).reduce((n, p) => n + arrangement.size(p), 0);
      const same = from === col && arrangement.columns[col].indexOf(d.id) === at;
      target = same ? null : { change: () => arrangement.place(d.id, col, at), ghost: { left, top: top * (rowH + gap), width, height: heightOf(size) } };
      return;
    }
    if (rel < 0.15 || rel > 0.85) {
      const at = rel < 0.15 ? col : col + 1;
      const alone = from >= 0 && arrangement.columns[from].length === 1 && (from === at || from === at - 1);
      target = alone ? null : { change: () => arrangement.column(d.id, at), bar: rel < 0.15 ? left - 12 : left + width + 12 };
      return;
    }
    const over = others.find((p) => { const el = slotOf(p); return el && y >= el.offsetTop && y < el.offsetTop + el.offsetHeight; });
    target = over && arrangement.size(over) === size ? { change: () => arrangement.swap(d.id, over), swap: over } : null;
  }
  /** Held at either edge of the strip while dragging (a quarter second, so
   *  passing near it doesn't count), the strip scrolls. */
  let edgeSince = 0;
  function edgeScroll(now: number) {
    const d = dragging;
    if (!d || !strip) { edgeSince = 0; return; }
    const box = strip.getBoundingClientRect();
    const by = d.x > box.right - 36 ? 14 : d.x < box.left + 36 ? -14 : 0;
    if (!by) edgeSince = 0;
    else if (!edgeSince) edgeSince = now;
    else if (now - edgeSince > 250) { strip.scrollLeft += by; follow(); retarget(); }
    requestAnimationFrame(edgeScroll);
  }
  function onMove(e: PointerEvent) {
    if (pressing && e.pointerId === pressing.pointer && Math.hypot(e.clientX - pressing.x, e.clientY - pressing.y) > 10) {
      clearTimeout(pressing.timer);
      pressing = null;
    }
    if (!dragging || e.pointerId !== dragging.pointer) return;
    dragging.x = e.clientX;
    dragging.y = e.clientY;
    follow();
    retarget();
  }
  function onRelease(e: PointerEvent) {
    if (pressing && e.pointerId === pressing.pointer) { clearTimeout(pressing.timer); pressing = null; }
    if (!dragging || e.pointerId !== dragging.pointer) return;
    const el = slotOf(dragging.id), drop = target;
    target = null;
    if (!el) { dragging = null; return; }
    // Everything, the dragged panel too, slides from where it is to its new
    // place (or back to its old one): measured with the drag's offset, which
    // then comes off.
    rearrange(() => { dragging = null; el.style.transform = ""; drop?.change(); });
  }
  // Once a drag is under way the finger mustn't scroll the strip too.
  $effect(() => {
    const el = strip;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  });

  // How many columns sit off to the right, for the cue at the edge.
  let more = $state(0);
  function measureMore() {
    if (!strip) return;
    const right = strip.getBoundingClientRect().right;
    more = [...strip.querySelectorAll<HTMLElement>(":scope > .snap")].filter((c) => c.getBoundingClientRect().left >= right - 8).length;
  }
  $effect(() => {
    const el = strip;
    if (!el) return;
    arrangement.columns;
    measureMore();
    const resized = new ResizeObserver(measureMore);
    resized.observe(el);
    return () => resized.disconnect();
  });
  $effect(() => {
    if (!wide.on) return;
    loadWide();
    const timer = setInterval(loadWide, import.meta.env.DEV ? POLL_MS : 60_000);
    return () => clearInterval(timer);
  });
</script>

{#if wide.on}
  {#snippet panel(id: PanelId)}
    {#if id === "log"}<div class="logcard"><LogPanel compact /></div>
    {:else if status}
      {#if id === "earned"}<HourChart today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} {focus} bind:shownDay tall />
      {:else if id === "heat"}<Heatmap {history} goal={status.today.goal} firstDay={status.first_day} selected={shownDay} onpick={(day) => (focus = { day, at: Date.now() })} keyBelow={false} />
      {:else if id === "distraction"}<HourChart measure="distraction" today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} {focus} blocklists={status.settings.blocklists} device={usage} tall />
      {:else if id === "trend"}<TrendLines {history} goal={status.today.goal} />
      {:else if id === "when"}<WhenYouEarn {history} />
      {:else if id === "pace"}<PaceToGoal {history} today={status.today} timeZone={status.settings.time_zone} />
      {:else if id === "runway"}<MorningRunway {history} timeZone={status.settings.time_zone} />
      {:else if id === "strength"}<HabitStrength {history} />
      {:else if id === "ladder"}<StreakLadder {history} />
      {:else if id === "streaks"}<SourceStreaks {history} sources={status.today.sources} />
      {:else if id === "records"}<PersonalRecords {history} timeZone={status.settings.time_zone} />{/if}
    {/if}
  {/snippet}
  <div class="wide">
    <section class="col today"><TodayColumn {live} wide /></section>
    <div class="stripwrap">
      <div class="strip" role="group" aria-label="Charts" class:arranging class:dragging={!!dragging} bind:this={strip} onscroll={measureMore}
        onpointermove={onMove} onpointerup={onRelease} onpointercancel={onRelease}
        style="--rows: {ROWS}; --cols: {arrangement.columns.length}">
        <!-- One invisible marker per column for the strip to stop on. -->
        {#each arrangement.columns as _, col (col)}<span class="snap" style="grid-column: {col + 1}"></span>{/each}
        <!-- Panels in one keyed list, placed on the grid, so one being dragged
             into another column stays the same element under the finger. -->
        {#each placed as p (p.id)}
          {@const id = p.id}
          <div class="slot" role="group" aria-label={PANELS[id].name} class:lifted={dragging?.id === id} class:swapping={dragging && target?.swap === id} data-id={id}
            style="grid-column: {p.col + 1}; grid-row: {p.row + 1} / span {p.size}; --jiggle: {(p.col * 3 + p.row) % 4}"
            onpointerdown={(e) => onPress(e, id)}>
            {@render panel(id)}
            {#if arranging}
              <!-- While arranging: its name, its size (if it has a choice), and Hide. Drag it anywhere. -->
              <div class="tools" role="group" aria-label="Arrange {PANELS[id].name}">
                <span class="pname">{PANELS[id].name}</span>
                {#if PANELS[id].max > PANELS[id].min}
                  <div class="sizes" role="group" aria-label="Height">
                    {#each [1, 2, 3].filter((n) => n >= PANELS[id].min && n <= PANELS[id].max) as n}
                      <button class:on={arrangement.size(id) === n} aria-pressed={arrangement.size(id) === n} onclick={() => rearrange(() => arrangement.resize(id, n))}>{n === 3 ? "Full" : `${n}/3`}</button>
                    {/each}
                  </div>
                {/if}
                <button class="hide" aria-label="Hide {PANELS[id].name}" onclick={() => hide(id)}>Hide</button>
              </div>
            {/if}
          </div>
        {/each}
        <!-- Where a drop would land. -->
        {#if dragging && target?.ghost}<div class="ghost" style="left: {target.ghost.left}px; top: {target.ghost.top}px; width: {target.ghost.width}px; height: {target.ghost.height}px"></div>{/if}
        {#if dragging && target?.bar !== undefined}<div class="bar" style="left: {target.bar - 2}px"></div>{/if}
        <!-- The end of the row: hidden panels come back here. -->
        <div class="endcol" style="grid-column: {arrangement.columns.length + 1}">
          {#if arranging}
            {#each arrangement.hidden as id (id)}
              <button class="add" onclick={() => rearrange(() => arrangement.show(id))}>+ {PANELS[id].name}</button>
            {/each}
            <button class="reset" onclick={() => rearrange(() => arrangement.reset())}>Back to the default</button>
          {:else}
            <button class="arrange" onclick={() => (arranging = true)}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></svg>
              Arrange
            </button>
            <span class="hint">Or hold any card's heading</span>
          {/if}
        </div>
      </div>
      {#if arranging}
        <button class="donepill" onclick={() => (arranging = false)} transition:fade={{ duration: ms("base") }}>Done</button>
      {:else if more}
        <button class="morecue" onclick={() => strip?.scrollBy({ left: strip.clientWidth / 2, behavior: "smooth" })} transition:fade={{ duration: ms("base") }}>{more} more
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg></button>
      {/if}
    </div>
  </div>
{:else}
  <main><TodayColumn {live} /></main>
{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  /* The Today column takes a third of the width and stays put; the strip
     beside it scrolls, with two columns in view. */
  .wide { height: 100%; display: flex; gap: 24px; padding: calc(28px + env(safe-area-inset-top)) 0 28px 28px; box-sizing: border-box; }
  .wide > .today { flex: 0 0 calc((100% - 28px - 48px) / 3); }
  .stripwrap { position: relative; flex: 1; min-width: 0; display: flex; }
  /* One grid: a column per arrangement column (two in view), three equal
     rows, and the end tile after them. */
  .strip { --colw: calc((100% - 24px) / 2); position: relative; flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(var(--cols), var(--colw)) var(--colw); grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); column-gap: 24px; row-gap: 20px; overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none; padding-right: 28px; }
  .strip::-webkit-scrollbar { display: none; }
  /* The strip can't snap while a drag scrolls it. */
  .strip.dragging { scroll-snap-type: none; }
  .snap { grid-row: 1; align-self: start; height: 0; scroll-snap-align: start; pointer-events: none; }
  .slot { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; }
  .slot > :global(.card), .slot > :global(.logcard) { flex: 1; min-height: 0; overflow: hidden; }
  /* Arranging: panels sit still under their buttons, a touch on one drags it
     rather than scrolling, and they jiggle to say they can move. */
  .arranging .slot { touch-action: none; animation: jiggle 280ms ease-in-out infinite alternate; animation-delay: calc(var(--jiggle) * -70ms); }
  .arranging .slot > :global(*:not(.tools)) { pointer-events: none; opacity: .5; }
  .slot > :global(*:not(.tools)) { transition: opacity var(--t-base); }
  @keyframes jiggle { from { rotate: -0.3deg; } to { rotate: 0.3deg; } }
  /* Drop markers: a dashed place in a column, a bar between columns, or the panel it would trade with. */
  .ghost { position: absolute; z-index: 4; border-radius: 18px; border: 2px dashed var(--voucher); background: rgba(61, 220, 132, .08); pointer-events: none; transition: left var(--t-quick) var(--ease-out), top var(--t-quick) var(--ease-out), height var(--t-quick) var(--ease-out); }
  .bar { position: absolute; z-index: 4; top: 0; bottom: 0; width: 4px; border-radius: 2px; background: var(--voucher); pointer-events: none; }
  .slot.swapping { outline: 2px dashed var(--voucher); outline-offset: 4px; border-radius: 18px; }
  .slot.lifted { z-index: 10; animation: none; filter: drop-shadow(0 14px 28px rgba(0, 0, 0, .6)); }
  .tools { position: absolute; inset: 0; z-index: 5; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 12px; border-radius: 18px; border: 2px dashed #3a3f45; cursor: grab; animation: toolsin var(--t-base) var(--ease-out); }
  @keyframes toolsin { from { opacity: 0; } }
  .pname { font: 700 15px var(--font); color: var(--ink); }
  .tools .hide { height: 36px; padding: 0 14px; border-radius: 12px; border: 1px solid var(--line); background: #1f2226; color: var(--muted); font: 700 13px var(--font); cursor: pointer; }
  .sizes { display: flex; padding: 2px; border-radius: 12px; background: #1f2226; border: 1px solid var(--line); }
  .sizes button { height: 34px; min-width: 52px; border: 0; border-radius: 10px; background: none; color: var(--muted); font: 700 13px var(--font); cursor: pointer; transition: background-color var(--t-quick), color var(--t-quick); }
  .sizes button.on { background: var(--line); color: var(--ink); }
  /* A whole column wide, so the row still stops on a column's edge at its end. */
  .endcol { grid-row: 1 / -1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; }
  .endcol > button { width: 100%; max-width: 240px; min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 14px var(--font); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; }
  .endcol .add { border-style: dashed; }
  .endcol .reset { color: var(--muted); font-weight: 500; font-size: 13px; }
  .endcol .arrange { color: var(--muted); }
  .endcol .hint { font-size: 12px; color: #6f757b; }
  .donepill { position: absolute; right: 28px; bottom: -32px; z-index: 6; height: 30px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--voucher); color: #0e0f11; font: 700 13px var(--font); box-shadow: 0 6px 18px rgba(0, 0, 0, .5); cursor: pointer; }
  /* Columns off to the right: how many, and a tap to slide one over. */
  /* Just under the cards, in the page's bottom margin, so it covers nothing. */
  .morecue { position: absolute; right: 28px; bottom: -27px; z-index: 6; height: 24px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 700 12px var(--font); display: flex; align-items: center; gap: 6px; box-shadow: 0 6px 18px rgba(0, 0, 0, .5); cursor: pointer; }
  .col { display: flex; flex-direction: column; gap: 20px; min-width: 0; min-height: 0; }
  /* Everything in the Today column keeps its size; the list of sources takes
     what's left and scrolls under its fixed heading when it's long. */
  .today > :global(*) { flex: none; }
  .today > :global(section.next) { flex: 1 1 0; min-height: 0; }
  .today :global(section.next .frame) { flex: 1; min-height: 0; }
  /* 16 px of room at the sides (and 4 at the ends), so a raised row's card
     is never clipped by the scrolling edge. */
  .today :global(section.next .list) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: none; margin: 0 -16px; padding: 4px 16px; }
  .logcard { flex: 1; min-height: 0; overflow: hidden; display: flex; flex-direction: column; border-radius: 18px; background: var(--surface); border: 1px solid var(--line); padding: 0 18px 12px; }
</style>
