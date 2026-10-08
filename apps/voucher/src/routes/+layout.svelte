<script lang="ts">
  import "$lib/theme.css";
  import { page } from "$app/state";
  import NavTabs from "$lib/components/NavTabs.svelte";
  import { wide } from "$lib/wide.svelte";
  import { onMount } from "svelte";
  import { goto, onNavigate } from "$app/navigation";
  import { connection, device } from "$lib/api";

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
  onNavigate((nav) => {
    const from = nav.from?.url.pathname, to = nav.to?.url.pathname;
    const direction = from === "/" && to === "/rules" ? "up" : from === "/rules" && to === "/" ? "down" : null;
    if (!wide.on || !direction || !document.startViewTransition) return;
    document.documentElement.dataset.slide = direction;
    return new Promise((resolve) => {
      const transition = document.startViewTransition(async () => { resolve(); await nav.complete; });
      transition.finished.finally(() => delete document.documentElement.dataset.slide);
    });
  });

  const active = $derived((page.url.pathname.split("/")[1] || "today") as "today" | "trends" | "log" | "rules");
</script>

<div class="screen" class:wide={wide.on}>
  <div class="body">{@render children()}</div>
  {#if !wide.on && !alone}<NavTabs {active} />{/if}
</div>

<style>
  .screen { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; overflow-y: auto; }
  /* Between phone and tablet widths, keep the phone layout from stretching. */
  .screen:not(.wide) .body :global(main) { max-width: 640px; margin: 0 auto; width: 100%; }
</style>
