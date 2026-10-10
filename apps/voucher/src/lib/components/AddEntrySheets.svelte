<script lang="ts">
  // The two "Add" sheets for a blocklist or source group: pick an installed
  // app, or type a site. Source groups (`counting`) leave out "Every game",
  // and show apps and sites another group already counts as not pickable.
  import { launchableApps } from "../api";
  import Sheet from "./Sheet.svelte";
  import { domainOf, isDomain } from "../blocklists";

  let { mode, onapp, onsite, onclose, games = true, taken = {}, counting = false }: {
    mode: "app" | "site" | null;
    onapp: (app: { package: string; label: string }) => void;
    onsite?: (site: string) => void;
    onclose: () => void;
    games?: boolean;
    /** Apps and sites (`site:<domain>`) that can't be picked, with the name of what already has them. */
    taken?: Record<string, string>;
    /** Adding to a source group, which counts a site's time rather than blocking it. */
    counting?: boolean;
  } = $props();

  let apps = $state<{ package: string; label: string }[]>([]);
  let filter = $state("");
  let site = $state("");
  $effect(() => { if (mode === "app") launchableApps().then((a) => (apps = a)); });
  const shown = $derived(apps.filter((a) => (a.label + a.package).toLowerCase().includes(filter.toLowerCase())));
  const domain = $derived(domainOf(site));
  const owner = $derived(taken[`site:${domain}`]);
  const valid = $derived(isDomain(domain) && !owner);
</script>

{#if mode === "app"}
  <Sheet {onclose}>
    <h2>Add an app</h2>
    <input placeholder="Search apps" bind:value={filter} />
    {#if games}
      <button class="pick" onclick={() => onapp({ package: "category:game", label: "Every game" })}>
        <span>Every game</span><span class="pkg">Any app marked as a game, including ones installed later</span>
      </button>
    {/if}
    {#each shown as a (a.package)}
      <button class="pick" disabled={!!taken[a.package]} onclick={() => onapp(a)}>
        <span>{a.label}</span><span class="mono pkg">{taken[a.package] ? `Already in ${taken[a.package]}` : a.package}</span>
      </button>
    {:else}
      <p class="empty">No apps to show.</p>
    {/each}
  </Sheet>
{:else if mode === "site"}
  <Sheet {onclose}>
    <h2>Add a site</h2>
    <p class="body">{counting ? "Counts time on the site and all its subdomains in your browser." : "Blocks the site and all its subdomains in your browsers."}</p>
    <input class="mono" placeholder="example.com" autocapitalize="off" autocomplete="off" bind:value={site} />
    <button class="btn primary wide" disabled={!valid} onclick={() => { onsite?.(domain); site = ""; }}>{owner ? `Already in ${owner}` : `Add ${valid ? domain : "site"}`}</button>
  </Sheet>
{/if}

<style>
  h2 { margin: 0; font-size: 22px; }
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  input { height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); padding: 0 14px; font: 500 15px var(--font); }
  input.mono { font-family: var(--mono); }
  .pick { min-height: 52px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); text-align: left; }
  .pick:disabled { opacity: .45; }
  .pkg { font-size: 11px; color: var(--muted); }
</style>
