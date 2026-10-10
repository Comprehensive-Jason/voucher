<script lang="ts">
  // Rules. On a phone: the Limits tab (the Rules layout draws the title and
  // tabs). On a wide screen: Limits, Sources, and Distractions side by side,
  // then Extras (preview and export), as a sheet over Today that slides back
  // down to it.
  import { goto } from "$app/navigation";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import RulesNotices from "$lib/components/RulesNotices.svelte";
  import { NOTICES_IN_HEADER } from "$lib/notices";
  import LimitsPanel from "$lib/panels/LimitsPanel.svelte";
  import SourcesPanel from "$lib/panels/SourcesPanel.svelte";
  import DistractionsPanel from "$lib/panels/DistractionsPanel.svelte";
  import ExtrasPanel from "$lib/panels/ExtrasPanel.svelte";
  import { wide } from "$lib/wide.svelte";
</script>

{#if wide.on}
  <div class="wide">
    <PageHeader title="Rules" back={() => goto("/")} backIcon="down" backLabel="Back to Today">
      <!-- Page-wide notices fill the header beside the title. -->
      {#if NOTICES_IN_HEADER}<div class="noticeslot"><RulesNotices row /></div>{/if}
    </PageHeader>
    <div class="cols">
      <div class="col"><LimitsPanel heading /></div>
      <div class="col"><SourcesPanel heading /></div>
      <div class="col"><DistractionsPanel heading /></div>
      <div class="col"><ExtrasPanel heading /></div>
    </div>
  </div>
{:else}
  <LimitsPanel />
{/if}

<style>
  /* On a wide screen the page itself never scrolls: each column scrolls on
     its own (and bounces at its ends), under a heading that stays put. */
  .wide { height: 100%; padding: 0 28px; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  .noticeslot { flex: 1; min-width: 0; margin-left: 16px; }
  /* Extras holds two rows, so it gets less width than the rules beside it. */
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)) minmax(0, .75fr); gap: 24px; }
  .col { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
</style>
