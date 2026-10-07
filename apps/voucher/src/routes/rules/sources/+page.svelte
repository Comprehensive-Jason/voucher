<script lang="ts">
  import { goto } from "$app/navigation";
  import RulesTabs from "$lib/components/RulesTabs.svelte";
  import { wide } from "$lib/wide.svelte";

  // On a wide screen every Rules section shares one page.
  $effect(() => { if (wide.on) goto("/rules", { replaceState: true }); });
  import SourcesPanel from "$lib/panels/SourcesPanel.svelte";
</script>

<main>
  <RulesTabs active="sources" />
  <SourcesPanel />
</main>

<style>
  main { padding: calc(20px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 12px; }
</style>
