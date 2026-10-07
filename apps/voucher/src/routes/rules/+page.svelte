<script lang="ts">
  // Rules. On a phone: Limits, with tabs for Sources and Distractions. On a
  // wide screen: all three side by side, with a way back to Today.
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
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <h1>Rules</h1>
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
  .wide { padding: calc(24px + env(safe-area-inset-top)) 28px 28px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; gap: 4px; margin-left: -12px; }
  .back { width: 44px; height: 44px; padding: 0; background: none; border: 0; color: var(--ink); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .cols { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 24px; align-items: start; }
  section { min-width: 0; }
</style>
