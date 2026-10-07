<script lang="ts">
  import "$lib/theme.css";
  import { page } from "$app/state";
  import NavTabs from "$lib/components/NavTabs.svelte";

  let { children } = $props();
  const active = $derived((page.url.pathname.split("/")[1] || "today") as "today" | "trends" | "log" | "rules");
</script>

<div class="screen">
  <div class="body">{@render children()}</div>
  <NavTabs {active} />
</div>

<style>
  .screen { height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; overflow-y: auto; }
</style>
