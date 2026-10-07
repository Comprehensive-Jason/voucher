<script lang="ts">
  // The two "Add" sheets for a blocklist: pick an installed app, or type a site.
  import { launchableApps } from "../api";
  import Sheet from "./Sheet.svelte";

  let { mode, onapp, onsite, onclose }: {
    mode: "app" | "site" | null;
    onapp: (app: { package: string; label: string }) => void;
    onsite: (site: string) => void;
    onclose: () => void;
  } = $props();

  let apps = $state<{ package: string; label: string }[]>([]);
  let filter = $state("");
  let site = $state("");
  $effect(() => { if (mode === "app") launchableApps().then((a) => (apps = a)); });
  const shown = $derived(apps.filter((a) => (a.label + a.package).toLowerCase().includes(filter.toLowerCase())));
  /** "https://www.Example.com/path" → "example.com". */
  const domain = $derived(site.trim().toLowerCase().replace(/^[a-z]+:\/\//, "").replace(/^www\./, "").split(/[/?#]/)[0]);
  const valid = $derived(/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(domain));
</script>

{#if mode === "app"}
  <Sheet {onclose}>
    <h2>Add an app</h2>
    <input placeholder="Search apps" bind:value={filter} />
    <button class="pick" onclick={() => onapp({ package: "category:game", label: "Every game" })}>
      <span>Every game</span><span class="pkg">Any app marked as a game, including ones installed later</span>
    </button>
    {#each shown as a (a.package)}
      <button class="pick" onclick={() => onapp(a)}><span>{a.label}</span><span class="mono pkg">{a.package}</span></button>
    {:else}
      <p class="body">No apps to show.</p>
    {/each}
  </Sheet>
{:else if mode === "site"}
  <Sheet {onclose}>
    <h2>Add a site</h2>
    <p class="body">Blocks the site and all its subdomains in your browsers.</p>
    <input class="mono" placeholder="example.com" autocapitalize="off" autocomplete="off" bind:value={site} />
    <button class="primary" disabled={!valid} onclick={() => { onsite(domain); site = ""; }}>Add {valid ? domain : "site"}</button>
  </Sheet>
{/if}

<style>
  h2 { margin: 0; font-size: 22px; }
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  input { height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); padding: 0 14px; font: 500 15px var(--font); }
  input.mono { font-family: var(--mono); }
  .pick { min-height: 52px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); text-align: left; }
  .pkg { font-size: 11px; color: var(--muted); }
  .primary { min-height: 52px; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 16px var(--font); }
  .primary:disabled { background: var(--line); color: var(--muted); }
</style>
