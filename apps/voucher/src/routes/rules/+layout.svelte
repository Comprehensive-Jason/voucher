<script lang="ts">
  // Rules on the phone: the title and the four tabs (Limits, Sources,
  // Distractions, Extras) over whichever panel is open. They live here rather
  // than in each tab's page so they stay mounted, and the tab highlight fades
  // from one to the next. Editors, Protection, and the preview are pages of
  // their own; the tablet shows every panel at once (rules/+page.svelte).
  import type { Snippet } from "svelte";
  import { page } from "$app/state";
  import PageHeader from "$lib/components/PageHeader.svelte";
  import RulesTabs, { tabOf } from "$lib/components/RulesTabs.svelte";
  import { wide } from "$lib/wide.svelte";

  let { children }: { children: Snippet } = $props();
  const tab = $derived(wide.on ? null : tabOf(page.url.pathname));
</script>

{#if tab}
  <main>
    <PageHeader title="Rules" />
    <RulesTabs active={tab} />
    {@render children()}
  </main>
{:else}
  {@render children()}
{/if}

<style>
  main { padding: 0 20px 12px; display: flex; flex-direction: column; gap: 12px; }
</style>
