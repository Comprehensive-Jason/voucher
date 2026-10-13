<script lang="ts">
  // The phone's Distractions tab (the Rules layout draws the title and tabs). On a
  // wide screen every Rules panel shares one page.
  import { goto } from "$app/navigation";
  import DistractionsPanel from "$lib/panels/DistractionsPanel.svelte";
  import { wide } from "$core/wide.svelte";

  $effect(() => { if (wide.on) goto("/rules", { replaceState: true }); });
</script>

<DistractionsPanel />
