<script lang="ts" module>
  import type { DayTotal as Kept, DeviceUsage as KeptUsage, Status as KeptStatus } from "$core/types";
  /** What the tablet's columns last showed, so coming back from Rules shows
   *  it at once (then refreshes) instead of blank tiles for a few seconds. */
  const kept: { status: KeptStatus | null; history: Kept[]; usage: KeptUsage | null } = { status: null, history: [], usage: null };
</script>

<script lang="ts">
  // Today. On a phone: one column, with the tab bar below. On a wide screen:
  // the Today column stays put on the left, and the rest is a row of columns
  // that scrolls sideways, two in view at a time, holding the charts and the
  // Log in whatever arrangement was chosen here (see arrangement.svelte.ts).
  import { tick } from "svelte";
  import { page } from "$app/state";
  import { fade } from "svelte/transition";
  import { ROWS } from "$lib/arrangement.svelte";
  import { arrangement, PANELS, type PanelId } from "$lib/cards";
  import { fillSlots } from "$core/fit.svelte";
  import { EASE, ms } from "$core/motion";
  import { deviceUsage, ledger } from "$core/api";
  import { Live, POLL_MS } from "$lib/live.svelte";
  import { wide } from "$core/wide.svelte";
  import { sheet, whenIdle } from "$core/sheet.svelte";
  import { historyDays } from "$core/time";
  import TodayColumn from "$lib/panels/TodayColumn.svelte";
  import RulesNotices from "$lib/components/RulesNotices.svelte";
  import MarkerSheet from "$core/components/MarkerSheet.svelte";
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import { selection } from "$core/selection.svelte";
  import { setCurfew } from "$core/curfew.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import TrendLines from "$lib/panels/trends/TrendLines.svelte";
  import WhenYouEarn from "$lib/panels/trends/WhenYouEarn.svelte";
  import PaceToGoal from "$lib/panels/trends/PaceToGoal.svelte";
  import MorningRunway from "$lib/panels/trends/MorningRunway.svelte";
  import HabitStrength from "$lib/panels/trends/HabitStrength.svelte";
  import SourceStreaks from "$lib/panels/trends/SourceStreaks.svelte";
  import PersonalRecords from "$lib/panels/trends/PersonalRecords.svelte";
  import BestHours from "$lib/panels/trends/BestHours.svelte";
  import GoodDays from "$lib/panels/trends/GoodDays.svelte";
  import Replay from "$lib/panels/trends/Replay.svelte";
  import FocusStretches from "$lib/panels/trends/FocusStretches.svelte";
  import VerdictSheet from "$lib/components/VerdictSheet.svelte";
  import CardTab from "$core/components/CardTab.svelte";
  import ZoomSwitch from "$core/components/ZoomSwitch.svelte";
  import ScrollCue from "$core/components/ScrollCue.svelte";
  import { ABOUT } from "$lib/about";
  import AboutText from "$lib/components/AboutText.svelte";
  import Verdicts from "$lib/panels/trends/Verdicts.svelte";
  import Compare from "$lib/panels/trends/Compare.svelte";
  import Reasons from "$lib/panels/trends/Reasons.svelte";
  import Sleep from "$lib/panels/trends/Sleep.svelte";
  import CalendarLoad from "$lib/panels/trends/CalendarLoad.svelte";
  import Planned from "$lib/panels/trends/Planned.svelte";
  import PanelOptions from "$lib/components/PanelOptions.svelte";
  import type { DayTotal, DeviceUsage, Status } from "$core/types";

  /** The space between cards, both ways, in px (the CSS --gap). */
  const GAP = 20;
  const live = new Live();
  // The strip's panels fill their slots (thirds of a column).
  fillSlots();
  let status = $state.raw<Status | null>(kept.status);
  let history = $state.raw<DayTotal[]>(kept.history);
  let usage = $state<DeviceUsage | null>(kept.usage);

  // The tablet's other columns refresh less often than the Voucher stack.
  // An answer that hasn't changed is dropped, so the cards don't all redraw
  // (a long pause on the tablet) for nothing.
  /** The Marker button beside the status card opens the Marker choices. */
  let addingMarker = $state(false);
  /** Each answer as last shown, as text, so a new one is compared without
   *  turning the old one into text again (the history is long). */
  const shown = { status: "", history: "", usage: "" };
  /** True when `value` differs from what `key` last showed (and remembers it). */
  function changed(key: keyof typeof shown, value: unknown) {
    const text = JSON.stringify(value);
    if (text === shown[key]) return false;
    shown[key] = text;
    return true;
  }
  async function loadWide() {
    try {
      const s = await ledger<Status>("GET", "/status");
      if (changed("status", s)) { status = kept.status = s; setCurfew(s.settings.curfew_start, s.settings.curfew_end); }
      const h = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(s.today.day, s.first_day)}`);
      if (changed("history", h)) history = kept.history = h;
      const u = await deviceUsage();
      if (changed("usage", u)) usage = kept.usage = u;
    } catch { /* the Today column shows the error */ }
  }

  // ---- Arranging ----
  // Hold a panel's heading (or, while arranging, any panel) and drag it: the
  // others make room as it passes, as on a phone's home screen. While
  // arranging, panels jiggle, and each shows what it's for and how to read
  // it (lib/about.ts), with its size buttons and Hide along the bottom.
  let arranging = $state(false);
  let strip = $state<HTMLDivElement>();
  /** Each arranging panel's scrolling explanation, for its ScrollCue. */
  let abouts = $state<Partial<Record<PanelId, HTMLDivElement>>>({});
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
    // Upright, the cards are one column in Arrange's order; arranging happens on its side.
    if (wide.portrait) return;
    // While arranging, a press anywhere drags at once, except on the
    // explanation: a finger there may be scrolling it, so it drags only once
    // held, as a heading does outside arranging.
    if (arranging && !target.closest(".about")) { startDrag(id, e.clientX, e.clientY, e.pointerId); return; }
    // Only a heading starts arranging, so a hold on a chart or a list does its own thing.
    if (!arranging && !target.closest(".cardhead, header, .tab")) return;
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
  /** Where the drop would put it, shown while dragging and applied on release.
   *  Panels flow in reading order (down each column, then across), so the
   *  drop is a place in that order: on a panel's upper half, before it; on
   *  its lower half, after it; in empty space, after whatever comes before
   *  that spot. The dashed outline shows where it would end up once the
   *  panels flow again. Positions are in the strip's own pixels. */
  type Target = { at: number; ghost: { left: number; top: number; width: number; height: number } };
  let target = $state<Target | null>(null);
  function retarget() {
    const d = dragging;
    if (!d || !strip) return;
    const box = strip.getBoundingClientRect();
    const x = d.x - box.left + strip.scrollLeft, y = d.y - box.top;
    const pitch = colWidth() + GAP;
    const gap = 20, rowH = (strip.clientHeight - gap * (ROWS - 1)) / ROWS;
    const colUnder = Math.max(0, Math.floor(x / pitch));
    const others = arrangement.order.filter((p) => p !== d.id);
    const at = others.filter((p) => {
      const el = slotOf(p);
      if (!el) return false;
      const col = Math.round(el.offsetLeft / pitch);
      return col < colUnder || (col === colUnder && el.offsetTop + el.offsetHeight / 2 < y);
    }).length;
    const next = [...others];
    next.splice(at, 0, d.id);
    if (next.join() === arrangement.order.join()) { target = null; return; }
    // Where it would land.
    const cols = arrangement.flow(next);
    const col = cols.findIndex((c) => c.includes(d.id));
    const row = cols[col].slice(0, cols[col].indexOf(d.id)).reduce((n, p) => n + arrangement.size(p), 0);
    const size = arrangement.size(d.id);
    target = { at, ghost: { left: col * pitch, top: row * (rowH + gap), width: colWidth(), height: size * rowH + (size - 1) * gap } };
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
    rearrange(() => { dragging = null; el.style.transform = ""; if (drop) arrangement.move(el.dataset.id as PanelId, drop.at); });
  }
  // Once a drag is under way the finger mustn't scroll the strip too.
  $effect(() => {
    const el = strip;
    if (!el) return;
    const stop = (e: TouchEvent) => { if (dragging) e.preventDefault(); };
    el.addEventListener("touchmove", stop, { passive: false });
    return () => el.removeEventListener("touchmove", stop);
  });

  // ---- Pages ----
  // Two columns make a page, for the numbered bar under the strip; a swipe
  // stops at any column, and the bar lights the page mostly in view. The end
  // tile counts as a column.
  /** Columns in the strip: the panels', and while arranging, one more at the end for hidden panels. */
  const totalCols = $derived(arrangement.columns.length + (arranging ? 1 : 0));
  const pageCount = $derived(Math.max(1, Math.ceil(totalCols / 2)));
  /** One column's width: half the strip less the gap between the two. */
  const colWidth = () => (strip ? (strip.clientWidth - GAP) / 2 : 0);
  /** The pages in view, first and last: the same page when it sits square, two when the view straddles them. */
  let pages = $state({ a: 0, b: 0 });
  /** Which way the pill last moved, so its leading edge goes first and the trailing edge follows. */
  let pillRight = $state(true);
  /** The page a tap on the bar is heading to; the pill goes straight there instead of following the scroll past the pages between. */
  let heading: number | null = null;
  function setPages(a: number, b: number) {
    if (a === pages.a && b === pages.b) return;
    pillRight = b > pages.b || a > pages.a;
    pages = { a, b };
  }
  /** One page's width: two columns and the gap after them. */
  const pageWidth = () => 2 * (colWidth() + GAP);
  // ---- Drawing only what's near ----
  // Every column drawn costs every frame that redraws the dashboard (a
  // poll's answer, the clock, Rules sliding over it), and most of the strip
  // is out of view. So only the columns in view and one either side are
  // drawn; the rest keep their place and size but skip drawing
  // (content-visibility: hidden) until a scroll brings them near. A page
  // tapped on the bar draws its columns from the start of the scroll there.
  // While arranging, every column is drawn, since panels move between them.
  /** The first and last column drawn. */
  let near = $state({ a: 0, b: 3 });
  function updateNear() {
    if (!strip) return;
    const pitch = colWidth() + GAP;
    if (pitch <= GAP) return;
    let a = Math.floor(strip.scrollLeft / pitch) - 1, b = Math.ceil((strip.scrollLeft + strip.clientWidth) / pitch);
    if (heading !== null) { a = Math.min(a, heading * 2 - 1); b = Math.max(b, heading * 2 + 2); }
    if (a !== near.a || b !== near.b) near = { a, b };
  }
  $effect(() => {
    if (!strip) return;
    updateNear();
    const ro = new ResizeObserver(() => updateNear());
    ro.observe(strip);
    return () => ro.disconnect();
  });
  function onStripScroll() {
    updateNear();
    if (!strip || !pageWidth() || heading !== null) return;
    // At the end the strip can only show its last two columns: that's the last page, whole.
    const end = strip.scrollWidth - strip.clientWidth;
    if (strip.scrollLeft >= end - 2) { setPages(pageCount - 1, pageCount - 1); return; }
    const at = strip.scrollLeft / pageWidth();
    const a = Math.min(pageCount - 1, Math.floor(at + 0.04));
    setPages(a, Math.min(pageCount - 1, Math.max(a, Math.ceil(at - 0.04))));
  }
  function goPage(i: number) {
    if (!strip) return;
    heading = i;
    setPages(i, i);
    updateNear();
    // Back to following the scroll once it lands (or soon after, if it was already there).
    const land = () => { if (heading !== i) return; heading = null; onStripScroll(); };
    strip.addEventListener("scrollend", land, { once: true });
    setTimeout(land, 1500);
    strip.scrollTo({ left: Math.min(i * pageWidth(), strip.scrollWidth - strip.clientWidth), behavior: "smooth" });
  }
  // While Rules covers the dashboard, or slides over it or off it, the
  // dashboard holds still: no clock, no polls, so nothing on it redraws (on
  // the tablet, every redraw of the dashboard during a slide costs a frame).
  // Back on it, it asks again once the sheet has gone and the screen is idle.
  const covered = $derived(page.url.pathname !== "/");
  const still = $derived(wide.on && (covered || sheet.moving));
  // Uncovered, the clock jumps to now at once, in the first frame of the
  // slide back down (which redraws anyway), so what the sheet uncovers isn't
  // stale; it ticks again, and the Ledger is asked, once the slide is over.
  $effect(() => { if (!covered) live.now = Math.floor(Date.now() / 1000); });
  let resumed = false;
  $effect(() => {
    if (still) return;
    let stop: (() => void) | undefined;
    const cancel = resumed ? whenIdle(() => (stop = live.start())) : ((stop = live.start()), undefined);
    resumed = true;
    return () => { cancel?.(); stop?.(); };
  });
  $effect(() => {
    if (!wide.on || still) return;
    const cancel = kept.status ? whenIdle(loadWide) : (loadWide(), undefined);
    const timer = setInterval(loadWide, import.meta.env.DEV ? POLL_MS : 60_000);
    return () => { cancel?.(); clearInterval(timer); };
  });
</script>

{#if wide.on}
  <!-- Rules opens from the foot of the Today column, left of the page bar. -->
  {#snippet rulesButton()}
    <span class="footleft">
    <a class="iconbtn" href="/rules" aria-label="Rules" data-sveltekit-keepfocus>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
    </a>
    </span>
  {/snippet}
  {#snippet panel(id: PanelId)}
    {#if id === "log"}<div class="logcard tile"><LogPanel compact /></div>
    {:else if status}
      {#if id === "earned"}<HourChart today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} tall />
      {:else if id === "heat"}<Heatmap {history} goal={status.today.goal} firstDay={status.first_day} selected={selection.day ?? status.today.day} onpick={(day) => selection.set("heat", { day, picked: true })} keyBelow={false} />
      {:else if id === "distraction"}<HourChart measure="distraction" today={status.today} timeZone={status.settings.time_zone} firstDay={status.first_day} blocklists={status.settings.blocklists} device={usage} tall />
      {:else if id === "trend"}<TrendLines {history} goal={status.today.goal} />
      {:else if id === "when"}<WhenYouEarn {history} />
      {:else if id === "pace"}<PaceToGoal {history} today={status.today} timeZone={status.settings.time_zone} />
      {:else if id === "runway"}<MorningRunway {history} timeZone={status.settings.time_zone} />
      {:else if id === "strength"}<HabitStrength {history} />
      {:else if id === "streaks"}<SourceStreaks {history} sources={status.today.sources} />
      {:else if id === "records"}<PersonalRecords {history} timeZone={status.settings.time_zone} />
      {:else if id === "best"}<BestHours {history} />
      {:else if id === "gooddays"}<GoodDays {history} timeZone={status.settings.time_zone} />
      {:else if id === "replay"}<Replay {history} />
      {:else if id === "focus"}<FocusStretches {history} />
      {:else if id === "verdicts"}<Verdicts {history} />
      {:else if id === "compare"}<Compare {history} />
      {:else if id === "reasons"}<Reasons {history} />
      {:else if id === "sleep"}<Sleep {history} timeZone={status.settings.time_zone} blocklists={status.settings.blocklists} />
      {:else if id === "calendar"}<CalendarLoad {history} />
      {:else if id === "planned"}<Planned {history} timeZone={status.settings.time_zone} blocklists={status.settings.blocklists} />{/if}
    {/if}
  {/snippet}
  {#if wide.portrait}
  <!-- Upright: the Today column and one column of cards, scrolling up and
       down, in Arrange's order and sizes (a third is about a landscape
       third's height). -->
  <div class="wide portrait">
    <section class="col today"><TodayColumn {live} wide onmarker={() => (addingMarker = true)} /><RulesNotices /><div class="leftfoot">{@render rulesButton()}</div></section>
    <div class="vstrip" role="group" aria-label="Charts">
      {#each arrangement.order as id (id)}
        <div class="slot" role="group" aria-label={PANELS[id].name} style="height: calc({arrangement.size(id)} * var(--third) + {arrangement.size(id) - 1} * var(--gap)); flex: none">
          <span class="tab"><CardTab name={PANELS[id].name} /></span>
          {@render panel(id)}
        </div>
      {/each}
    </div>
  </div>
  {:else}
  <div class="wide">
    <section class="col today">
      <TodayColumn {live} wide onmarker={() => (addingMarker = true)} />
      <!-- Above the page bar, Rules' notices (Protection off, a Loosening
           waiting for the morning, the grace period): the list above gives
           them room, so nothing over them moves when they come or go. -->
      <RulesNotices />
      <!-- At the foot of the Today column: the page bar for the cards, so the
           cards get the screen's full height. -->
      <div class="leftfoot">
        {@render rulesButton()}
        <!-- Pages of two columns: tap one to go there. -->
        {#if pageCount > 1}
          <div class="pages" role="tablist" aria-label="Pages of charts">
            <!-- One pill behind the numbers, stretching over both pages while the view sits across two. -->
            <span class="thumb" class:right={pillRight} style="left: {3 + pages.a * 44}px; right: {3 + (pageCount - 1 - pages.b) * 44}px"></span>
            {#each Array(pageCount) as _, i (i)}
              {@const on = i >= pages.a && i <= pages.b}
              <button role="tab" aria-selected={on} class:on onclick={() => goPage(i)}>{i + 1}</button>
            {/each}
          </div>
        {/if}
        <!-- Right of it: Arrange once you're fully on the last page (not between it and the one before; holding a card's heading works anywhere), Done while arranging. -->
        {#if arranging}
          <button class="donepill" onclick={() => (arranging = false)} transition:fade={{ duration: ms("base") }}>Done</button>
        {:else if pages.a === pageCount - 1}
          <button class="arrangepill" title="Or hold any card's heading" onclick={() => (arranging = true)} transition:fade={{ duration: ms("base") }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="2" /><rect x="14" y="3" width="7" height="5" rx="2" /><rect x="14" y="12" width="7" height="9" rx="2" /><rect x="3" y="16" width="7" height="5" rx="2" /></svg>
            Arrange
          </button>
        {/if}
      </div>
    </section>
    <div class="stripwrap">
      <div class="strip" role="group" aria-label="Charts" class:arranging class:dragging={!!dragging} bind:this={strip} onscroll={onStripScroll}
        onpointermove={onMove} onpointerup={onRelease} onpointercancel={onRelease}
        style="--rows: {ROWS}; --cols: {totalCols}">
        <!-- One invisible marker per column for the strip to stop on. -->
        {#each Array(totalCols) as _, i (i)}<span class="snap" style="grid-column: {i + 1}"></span>{/each}
        <!-- Panels in one keyed list, placed on the grid, so one being dragged
             into another column stays the same element under the finger. -->
        {#each placed as p (p.id)}
          {@const id = p.id}
          <div class="slot" role="group" aria-label={PANELS[id].name} class:lifted={dragging?.id === id} class:far={!arranging && (p.col < near.a || p.col > near.b)} data-id={id}
            style="grid-column: {p.col + 1}; grid-row: {p.row + 1} / span {p.size}; --jiggle: {(p.col * 3 + p.row) % 4}"
            onpointerdown={(e) => onPress(e, id)}>
            <!-- The card's name, on a tab growing out of its top edge, so naming it costs the card no height. -->
            <span class="tab"><CardTab name={PANELS[id].name} /></span>
            {@render panel(id)}
            {#if arranging}
              <!-- While arranging, the card is covered by what it's for and how
                   to read it, scrolling when it's long, over its size (if it has a
                   choice) at the bottom left and Hide at the bottom right. The
                   name stays on the tab. Drag it from anywhere; on the text, hold first. -->
              <div class="tools" role="group" aria-label="Arrange {PANELS[id].name}">
                <div class="aboutframe">
                  <ScrollCue target={abouts[id]} />
                  <div class="about" bind:this={abouts[id]}>
                    <p class="cap label">What it's for</p>
                    <p class="for"><AboutText text={ABOUT[id].for} /></p>
                    <p class="cap label">How to read it</p>
                    {#each ABOUT[id].read as line, i (i)}<p class="point"><AboutText text={line} /></p>{/each}
                  </div>
                </div>
                {#if PANELS[id].options}<div class="options"><PanelOptions {id} /></div>{/if}
                <div class="controls">
                  {#if PANELS[id].max > PANELS[id].min}
                    <div class="sizes">
                      <ZoomSwitch size="large" label="Height" options={[1, 2, 3].filter((n) => n >= PANELS[id].min && n <= PANELS[id].max).map((n) => ({ id: String(n), label: n === 3 ? "Full" : `${n}/3` }))} value={String(arrangement.size(id))} onchange={(v) => rearrange(() => arrangement.resize(id, Number(v)))} />
                    </div>
                  {:else}<span></span>{/if}
                  <button class="btn small ghost" aria-label="Hide {PANELS[id].name}" onclick={() => hide(id)}>Hide</button>
                </div>
              </div>
            {/if}
          </div>
        {/each}
        <!-- Where a drop would land. -->
        {#if dragging && target?.ghost}<div class="dropghost" style="left: {target.ghost.left}px; top: {target.ghost.top}px; width: {target.ghost.width}px; height: {target.ghost.height}px"></div>{/if}
        <!-- While arranging, one more column at the end: hidden panels come back here. -->
        {#if arranging}
          <div class="endcol" style="grid-column: {arrangement.columns.length + 1}" transition:fade={{ duration: ms("base") }}>
            {#each arrangement.hidden as id (id)}
              <button class="add" onclick={() => rearrange(() => arrangement.show(id))}>+ {PANELS[id].name}</button>
            {/each}
            <button class="reset" onclick={() => rearrange(() => arrangement.reset())}>Back to the default</button>
          </div>
        {/if}
      </div>
    </div>
  </div>
  {/if}
{:else}
  <main><TodayColumn {live} onmarker={() => (addingMarker = true)} /></main>
{/if}
<VerdictSheet curfewActive={live.data?.curfewActive ?? false} />
{#if addingMarker}<MarkerSheet onclose={() => (addingMarker = false)} />{/if}

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  /* The Today column takes a third of the width and stays put; the strip
     beside it scrolls, with two columns in view. */
  /* The right margin sits outside the strip, so every page (two columns)
     scrolls exactly into place, the last one too. The bottom margin is deep enough to hold the "more" and Done pills well clear of the screen's edge. */
  .wide { --gap: 20px; height: 100%; display: flex; gap: var(--gap); padding: calc(10px + env(safe-area-inset-top)) 28px calc(21px + env(safe-area-inset-bottom)) 28px; box-sizing: border-box; }
  .wide > .today { flex: 0 0 calc((100% - 2 * var(--gap)) / 3); }
  /* Upright: two equal columns, the cards scrolling up and down; no page bar, so less room at the bottom. */
  .wide.portrait { --third: 300px; padding-bottom: calc(28px + env(safe-area-inset-bottom)); }
  .wide.portrait > .today { flex: 0 0 calc((100% - var(--gap)) / 2); }
  .vstrip { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: var(--gap); overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; }
  .vstrip::-webkit-scrollbar { display: none; }
  .stripwrap { position: relative; flex: 1; min-width: 0; display: flex; }
  /* One grid: a column per arrangement column (two in view), three equal
     rows, and the end tile after them. */
  .strip { --colw: calc((100% - var(--gap)) / 2); position: relative; flex: 1; min-width: 0; display: grid; grid-template-columns: repeat(var(--cols), var(--colw)); grid-auto-columns: var(--colw); grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); gap: var(--gap); overflow-x: auto; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  /* The strip can't snap while a drag scrolls it. */
  .strip.dragging { scroll-snap-type: none; }
  /* A stop at every column, so a view can sit across two pages. */
  .snap { grid-row: 1; align-self: start; height: 0; scroll-snap-align: start; pointer-events: none; }
  /* Room at the top of each slot for its card's folder tab (CardTab), which
     rises 20 px above the card (room for the name to clear the outline), flush with its left side; the card's
     top-left corner is square so its left edge runs straight up into the tab. */
  .slot { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; padding-top: 20px; }
  .slot > :global(.tile) { border-top-left-radius: 0; }
  /* Out of view and not next to it: kept in place, not drawn. */
  .slot.far { content-visibility: hidden; }
  .tab { position: absolute; z-index: 1; top: 0; left: 0; }
  .slot > :global(.card), .slot > :global(.logcard) { flex: 1; min-height: 0; overflow: hidden; }
  /* Arranging: panels sit still under their buttons, a touch on one drags it
     rather than scrolling, and they jiggle to say they can move. */
  .arranging .slot { touch-action: none; animation: jiggle 280ms ease-in-out infinite alternate; animation-delay: calc(var(--jiggle) * -70ms); }
  /* The card under its explanation fades back; its name on the tab stays as it always reads, over the explanation's top edge. */
  .arranging .slot > :global(*:not(.tools, .tab)) { pointer-events: none; opacity: .5; }
  .arranging .tab { z-index: 6; }
  .slot > :global(*:not(.tools)) { transition: opacity var(--t-base); }
  @keyframes jiggle { from { rotate: -0.3deg; } to { rotate: 0.3deg; } }
  /* Where a drop would land: a dashed outline of the panel's place. */
  .dropghost { position: absolute; z-index: 4; border-radius: 18px; border: 2px dashed var(--voucher); background: var(--voucher-wash); pointer-events: none; transition: left var(--t-quick) var(--ease-out), top var(--t-quick) var(--ease-out), height var(--t-quick) var(--ease-out); }
  .slot.lifted { z-index: 10; animation: none; filter: drop-shadow(0 14px 28px var(--shadow-lift)); }
  /* While arranging: an opaque cover the card's own shape and color, under
     the tab, so the text reads over whatever the card draws. */
  .tools { position: absolute; inset: 20px 0 0 0; z-index: 5; display: flex; flex-direction: column; gap: 10px; padding: 14px 16px 12px 18px; box-sizing: border-box; border-radius: 18px; border-top-left-radius: 0; border: 1px solid var(--line); background: var(--surface); cursor: grab; user-select: none; -webkit-user-select: none; animation: toolsin var(--t-base) var(--ease-out); }
  @keyframes toolsin { from { opacity: 0; } }
  /* The explanation takes the middle and scrolls on its own (vertical
     swipes only), with no scrollbar; ScrollCue says what's above or below. */
  .aboutframe { position: relative; flex: 1; min-height: 0; display: flex; }
  .about { position: relative; flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; touch-action: pan-y; display: flex; flex-direction: column; gap: 5px; }
  .about::-webkit-scrollbar { display: none; }
  .about p { margin: 0; }
  .about .label:not(:first-child) { margin-top: 8px; }
  .about .for { font-size: 14px; line-height: 1.45; color: var(--ink); }
  .about .point { position: relative; padding-left: 13px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .about .point::before { content: ""; position: absolute; left: 2px; top: .66em; width: 4px; height: 4px; border-radius: 50%; background: var(--muted); }
  /* A card's own options (PanelOptions), over its size at the bottom left. */
  .options { flex: none; display: flex; flex-wrap: wrap; gap: 10px 16px; }
  /* Size at the bottom left, Hide at the bottom right. */
  .controls { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  /* The size picker is the shared switch at its large size. */
  .sizes { width: 200px; }
  /* A whole column wide, so the row still stops on a column's edge at its end. */
  .endcol { grid-row: 1 / -1; display: flex; flex-direction: column; justify-content: center; align-items: center; gap: 10px; }
  .endcol > button { width: 100%; max-width: 240px; min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); font: 700 14px var(--font); cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px; padding: 0 12px; }
  .endcol .add { border-style: dashed; }
  .endcol .reset { color: var(--muted); font-weight: 500; font-size: 13px; }
  .leftfoot { margin-top: auto; display: grid; grid-template-columns: 1fr auto 1fr; align-items: center; gap: 8px; }
  /* One row: Rules, the page bar, and Arrange or Done. While Arrange and Done
     cross-fade they share the right cell, overlapping, instead of the
     second wrapping onto a row of its own and pushing the column up. */
  .leftfoot > * { grid-row: 1; }
  .leftfoot > .footleft { grid-column: 1; justify-self: start; display: flex; gap: 8px; }
  .leftfoot .pages { grid-column: 2; }
  .leftfoot .arrangepill, .leftfoot .donepill { grid-column: 3; justify-self: end; }
  .arrangepill { height: 30px; padding: 0 14px; border-radius: 999px; border: 1px solid var(--line); background: var(--raised); color: var(--muted); font: 700 13px var(--font); display: flex; align-items: center; gap: 7px; cursor: pointer; }
  .donepill { height: 30px; padding: 0 20px; border-radius: 999px; border: 0; background: var(--voucher); color: var(--ground); font: 700 13px var(--font); box-shadow: 0 6px 18px var(--shadow); cursor: pointer; }
  /* Centred in the Today column's foot, Arrange or Done to its right. */
  .pages { position: relative; grid-column: 2; display: flex; gap: 4px; padding: 3px; border-radius: 999px; background: var(--raised); border: 1px solid var(--line); }
  .thumb { position: absolute; top: 3px; height: 32px; border-radius: 999px; background: var(--line); transition: left var(--t-move) var(--ease-out), right var(--t-move) var(--ease-out) 90ms; }
  /* The edge on the side it's heading leads; the far edge follows a beat later, in one stretch and shrink. */
  .thumb.right { transition: right var(--t-move) var(--ease-out), left var(--t-move) var(--ease-out) 90ms; }
  .pages button { position: relative; width: 40px; height: 32px; border: 0; border-radius: 999px; background: none; color: var(--muted); font: 700 13px var(--mono); cursor: pointer; transition: background-color var(--t-base), color var(--t-base), var(--press); }
  .pages button.on { color: var(--ink); }
  .col { display: flex; flex-direction: column; gap: var(--gap, 20px); min-width: 0; min-height: 0; }
  /* Everything in the Today column keeps its size; the list of sources takes
     what's left and scrolls under its fixed heading when it's long. */
  .today > :global(*) { flex: none; }
  .today > :global(section.next) { flex: 1 1 0; min-height: 0; }
  .today :global(section.next .frame) { flex: 1; min-height: 0; }
  /* 16 px of room at the sides (and 4 at the ends), so a raised row's card
     is never clipped by the scrolling edge. */
  .today :global(section.next .list) { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; scrollbar-width: none; margin: 0 -16px; padding: 4px 16px; }
  .logcard { flex: 1; min-height: 0; overflow: hidden; gap: 6px; }
</style>
