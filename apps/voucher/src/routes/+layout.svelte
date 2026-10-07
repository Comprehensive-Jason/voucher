<script lang="ts">
  import "$lib/theme.css";
  import { page } from "$app/state";
  import NavTabs from "$lib/components/NavTabs.svelte";
  import { wide } from "$lib/wide.svelte";
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { connection, device } from "$lib/api";

  let { children } = $props();
  // Setup and the blocked-app screen stand alone, without the tab bar.
  const setup = $derived(page.url.pathname.startsWith("/setup"));
  const alone = $derived(setup || page.url.pathname.startsWith("/blocked"));

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
