<script lang="ts">
  import "$lib/theme.css";
  import { page } from "$app/state";
  import NavTabs from "$lib/components/NavTabs.svelte";
  import { wide } from "$lib/wide.svelte";
  import { onMount } from "svelte";
  import { goto, onNavigate } from "$app/navigation";
  import { connection, device } from "$lib/api";
  import { motionVars } from "$lib/motion";
  import Home from "$lib/Home.svelte";

  // Every animation's timing comes from lib/motion.ts, as CSS variables on the
  // root, set before anything draws.
  if (typeof document !== "undefined") {
    for (const part of motionVars().split("; ")) {
      const [name, value] = part.split(": ");
      document.documentElement.style.setProperty(name, value);
    }
  }

  let { children } = $props();
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
    return () => document.removeEventListener("visibilitychange", onVisible);
  });
  // On a wide screen Rules is a sheet over Today: it slides up from the
  // bottom when opened and back down when left (button or back gesture).
  // Pages that open over another slide up from the bottom, and slide back
  // down when closed: Rules over Today on the tablet, and a source's or a
  // blocklist's editor over Rules everywhere.
  const editor = (path?: string) => !!path && /^\/rules\/(sources\/group|distractions\/(edit|new))/.test(path);
  onNavigate((nav) => {
    const from = nav.from?.url.pathname, to = nav.to?.url.pathname;
    const overToday = wide.on && (from === "/" && to === "/rules" ? "up" : from === "/rules" && to === "/" ? "down" : null);
    const overRules = editor(to) && !editor(from) ? "up" : editor(from) && !editor(to) ? "down" : null;
    const direction = overToday || overRules;
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
  const keepHome = $derived(atHome || (wide.on && page.url.pathname.startsWith("/rules")));
</script>

<div class="screen" class:wide={wide.on}>
  {#if keepHome}<div class="body home" class:under={!atHome} inert={!atHome} aria-hidden={!atHome}><Home /></div>{/if}
  {#if !atHome}<div class="body" class:over={keepHome}>{@render children()}</div>{/if}
  {#if !wide.on && !alone}<NavTabs {active} />{/if}
</div>

<style>
  .screen { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
  .screen { position: relative; }
  .body { flex: 1; min-height: 0; overflow-y: auto; }
  /* Rules over the dashboard: the dashboard keeps its place underneath, covered. */
  .home.under { position: absolute; inset: 0; }
  /* Its own layer, so nothing inside it (the Voucher stack, the pills) rises above Rules. */
  .home { isolation: isolate; }
  .body.over { position: absolute; inset: 0; z-index: 1; background: var(--ground); }
  /* Between phone and tablet widths, keep the phone layout from stretching. */
  .screen:not(.wide) .body :global(main) { max-width: 640px; margin: 0 auto; width: 100%; }
</style>
