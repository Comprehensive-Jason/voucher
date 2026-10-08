<script lang="ts">
  import GraceBanner from "$lib/components/GraceBanner.svelte";
  // Rules. On a phone: Limits, with tabs for Sources and Distractions. On a
  // wide screen: all three side by side, as a sheet over Today that slides
  // back down to it.
  import { goto } from "$app/navigation";
  import RulesTabs from "$lib/components/RulesTabs.svelte";
  import LimitsPanel from "$lib/panels/LimitsPanel.svelte";
  import SourcesPanel from "$lib/panels/SourcesPanel.svelte";
  import DistractionsPanel from "$lib/panels/DistractionsPanel.svelte";
  import { wide } from "$lib/wide.svelte";
</script>

{#if wide.on}
  <div class="wide">
    <header>
      <button class="back" aria-label="Back to Today" onclick={() => goto("/")}>
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6" /></svg>
      </button>
      <h1>Rules</h1>
      <div class="graceslot"><GraceBanner /></div>
    </header>
    <div class="cols">
      <section><LimitsPanel heading /></section>
      <section><SourcesPanel heading /></section>
      <section><DistractionsPanel heading /></section>
    </div>
  </div>
{:else}
  <main>
    <RulesTabs active="limits" />
    <LimitsPanel />
  </main>
{/if}

<style>
  main { padding: calc(20px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 12px; }
  /* On a wide screen the page itself never scrolls: each column scrolls on
     its own (and bounces at its ends), under a heading that stays put. */
  .wide { height: 100%; padding: calc(24px + env(safe-area-inset-top)) 28px 0; display: flex; flex-direction: column; gap: 14px; overflow: hidden; }
  header { display: flex; align-items: center; gap: 4px; margin-left: -12px; }
  .back { width: 44px; height: 44px; padding: 0; background: none; border: 0; color: var(--ink); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .graceslot { margin-left: auto; max-width: 620px; }
  header { flex: none; }
  .cols { flex: 1; min-height: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; }
  /* Each panel scrolls under its own heading. */
  section { min-width: 0; min-height: 0; display: flex; flex-direction: column; }
</style>
