<script lang="ts">
  // The phone's Sources tab (the Rules layout draws the title and tabs). On a
  // wide screen every Rules panel shares one page.
  import { goto } from "$app/navigation";
  import SourcesPanel from "$lib/panels/SourcesPanel.svelte";
  import { wide } from "$lib/wide.svelte";

  $effect(() => { if (wide.on) goto("/rules", { replaceState: true }); });
</script>

<SourcesPanel />
