<script lang="ts">
  import "$core/theme.css";
  import { page } from "$app/state";
  import NavTabs from "$lib/components/NavTabs.svelte";
  import { wide } from "$core/wide.svelte";
  import { onMount } from "svelte";
  import { goto, onNavigate } from "$app/navigation";
  import { connection, device } from "$lib/device";
  import { easeIn, easeOut, motionVars, ms } from "$core/motion";
  import Home from "$lib/Home.svelte";
  import Toast from "$core/components/Toast.svelte";
  import { sheet } from "$core/sheet.svelte";
  import { setArrangementContext } from "$core/arrangement.svelte";
  import { arrangement } from "$lib/cards";

  // Every animation's timing comes from $core/motion.ts, as CSS variables on the
  // root, set before anything draws.
  if (typeof document !== "undefined") {
    for (const part of motionVars().split("; ")) {
      const [name, value] = part.split(": ");
      document.documentElement.style.setProperty(name, value);
    }
  }

  let { children } = $props();
  // Voucher's one arrangement of its cards, for the dashboard, the phone's
  // Trends, and any card that reads its own options.
  setArrangementContext(arrangement);
  // Setup and the blocked-app screen stand alone, without the tab bar.
  const setup = $derived(page.url.pathname.startsWith("/setup"));
  const alone = $derived(setup || ["/blocked", "/tray", "/pc-blocked"].some((p) => page.url.pathname.startsWith(p)));

  /** The Android side may ask for a screen, such as the blocked-app screen. */
  async function followDevice() {
    const route = await device<string | null>("pendingRoute").catch(() => null);
    if (route) goto(route);
  }

  onMount(() => {
    // A device that hasn't connected to a Ledger starts with setup.
    connection().then((c) => { if (!c && !setup) goto("/setup", { replaceState: true }); });
    followDevice();
    const onVisible = () => document.visibilityState === "visible" && followDevice();
    document.addEventListener("visibilitychange", onVisible);
    // A notification's action tapped while Voucher is already in front (the
    // shade pulled down over it) never hides the page; the window only loses
    // and regains focus, so ask then too.
    window.addEventListener("focus", followDevice);
    return () => { document.removeEventListener("visibilitychange", onVisible); window.removeEventListener("focus", followDevice); };
  });
  // On a wide screen Rules is a sheet over Today: it slides up from the
  // bottom when opened and back down when left (button or back gesture).
  // Pages that open over another slide up from the bottom, and slide back
  // down when closed: Rules over Today on the tablet, and a source's or a
  // blocklist's editor over Rules everywhere.
  const editor = (path?: string) => !!path && /^\/rules\/(sources\/group|distractions\/(edit|new)|preview)/.test(path);
  onNavigate((nav) => {
    const from = nav.from?.url.pathname, to = nav.to?.url.pathname;
    // Rules sliding over the tablet's dashboard, or off it: the dashboard
    // holds still until the slide ends ($core/sheet.svelte.ts), so nothing on
    // it redraws during the slide. The safety net covers a slide that never
    // reports its end.
    if (wide.on && ((from === "/" && to?.startsWith("/rules")) || (from?.startsWith("/rules") && to === "/"))) sheet.start(ms("move") + 1500);
    // Rules over Today slides as one layer (sheetSlide, below), not as a
    // snapshot of the whole screen: the dashboard stays mounted under it, so
    // only Rules moves, which the tablet animates without stalling.
    const overRules = editor(to) && !editor(from) ? "up" : editor(from) && !editor(to) ? "down" : null;
    const direction = overRules;
    if (!direction || !document.startViewTransition) return;
    document.documentElement.dataset.slide = direction;
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => { resolve(); await nav.complete; });
      transition.finished.finally(() => delete document.documentElement.dataset.slide);
    });
  });

  const active = $derived((page.url.pathname.split("/")[1] || "today") as "today" | "trends" | "rules");
  // Today (and on the tablet, the dashboard) lives here, not in the route: on
  // the tablet it stays mounted under Rules and its editors, so leaving them
  // (button or back gesture) shows it exactly as it was, same page of cards,
  // nothing redrawn or replayed. On the phone it's only there on "/".
  const atHome = $derived(page.url.pathname === "/");

  /** Rules over the tablet's dashboard: up from the bottom when it opens,
   *  back down when it closes. While it slides down, Svelte holds its
   *  content still, so the sheet leaves showing what it showed. */
  function sheetSlide(_node: Element, { on, leaving }: { on: boolean; leaving?: boolean }) {
    if (!on) return { duration: 0 };
    return { duration: ms("move"), easing: leaving ? easeIn : easeOut, css: (t: number) => `transform: translateY(${((1 - t) * 100).toFixed(2)}%)` };
  }
  /** Rules has slid in: the dashboard may move again, and focus leaves the
   *  covered dashboard now rather than as Rules opened. (SvelteKit's own
   *  focus reset lays the whole page out at once, in the frame the slide
   *  should start in, so the Rules button skips it with
   *  data-sveltekit-keepfocus and keeps focus until here.) Like SvelteKit,
   *  focus goes to the page itself, so the next Tab starts at the top. */
  function landed(e: Event) {
    sheet.end();
    if (!keepHome || (e.currentTarget as HTMLElement).contains(document.activeElement)) return;
    const root = document.body, had = root.getAttribute("tabindex");
    root.tabIndex = -1;
    root.focus({ preventScroll: true, focusVisible: false } as FocusOptions);
    if (had === null) root.removeAttribute("tabindex"); else root.setAttribute("tabindex", had);
  }
  const keepHome = $derived(atHome || (wide.on && page.url.pathname.startsWith("/rules")));
</script>

<div class="screen" class:wide={wide.on}>
  <!-- Covered, the dashboard is hidden from screen readers but not made inert:
       Rules covers it, so nothing under it can be tapped, and switching inert
       restyles every element on it, a long pause halfway through the slide. -->
  {#if keepHome}<div class="body home" class:under={!atHome} aria-hidden={!atHome}><Home /></div>{/if}
  {#if !atHome}<div class="body" class:over={keepHome} in:sheetSlide={{ on: keepHome }} out:sheetSlide={{ on: keepHome, leaving: true }} onintroend={landed} onoutroend={() => sheet.end()}>{@render children()}</div>{/if}
  <!-- Short messages at the spot when an action doesn't go through ($core/toast.svelte.ts). -->
  <Toast />
  {#if !wide.on && !alone}<NavTabs {active} />{/if}
</div>

<style>
  .screen { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
  .screen { position: relative; }
  .body { flex: 1; min-height: 0; overflow-y: auto; }
  /* Rules over the dashboard: the dashboard keeps its place underneath,
     covered. It's placed the same way with or without Rules over it, so
     opening or closing Rules doesn't lay the whole dashboard out again. */
  .screen.wide .home { position: absolute; inset: 0; }
  /* Its own layer, so nothing inside it (the Voucher stack, the pills) rises above Rules. */
  .home { isolation: isolate; }
  .body.over { position: absolute; inset: 0; z-index: 1; background: var(--ground); }
  /* Between phone and tablet widths, keep the phone layout from stretching. */
  .screen:not(.wide) .body :global(main) { max-width: 640px; margin: 0 auto; width: 100%; }
</style>
