<script lang="ts">
  // Every installed app, open beside an editor on a wide screen: tap one to
  // add it. Apps already in the list show a check; apps another source counts
  // are greyed with that source's name.
  import { onMount } from "svelte";
  import { launchableApps } from "../api";
  import AppIcon from "./AppIcon.svelte";

  type App = { package: string; label: string; note?: string };
  let { members, taken = {}, games = false, onadd }: {
    members: string[];
    /** Apps that can't be picked, with the name of what already has them. */
    taken?: Record<string, string>;
    /** Offer "Every game" first, as blocklists do. */
    games?: boolean;
    onadd: (app: { package: string; label: string }) => void;
  } = $props();

  let apps = $state<App[]>([]);
  let filter = $state("");
  onMount(() => { launchableApps().then((a) => (apps = [...a].sort((x, y) => x.label.localeCompare(y.label)))); });
  const all = $derived<App[]>(games ? [{ package: "category:game", label: "Every game", note: "Any app marked as a game" }, ...apps] : apps);
  const shown = $derived(all.filter((a) => (a.label + a.package).toLowerCase().includes(filter.trim().toLowerCase())));
</script>

<div class="picker">
  <span class="cap">Add apps · {apps.length} installed</span>
  <input class="search" type="search" placeholder="Search apps" autocapitalize="off" autocomplete="off" bind:value={filter} />
  <div class="list">
    {#each shown as a (a.package)}
      {@const member = members.includes(a.package)}
      {@const owner = member ? undefined : taken[a.package]}
      <button class="row" class:taken={!!owner} disabled={member || !!owner} aria-label={member ? `${a.label}, added` : owner ? `${a.label}, in ${owner}` : `Add ${a.label}`} onclick={() => onadd(a)}>
        <AppIcon pkg={a.package} label={a.label} size={34} />
        <span class="text">
          <span class="name">{a.label}</span>
          <span class="sub" class:plain={!!owner || !!a.note}>{owner ? `In ${owner}` : a.note ?? a.package}</span>
        </span>
        {#if member}
          <span class="state on"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
        {:else if !owner}
          <span class="state"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg></span>
        {/if}
      </button>
    {:else}
      <p class="empty">{apps.length ? "No app matches." : "The app list isn't available on this device yet."}</p>
    {/each}
  </div>
</div>

<style>
  .picker { min-height: 0; flex: 1; display: flex; flex-direction: column; gap: 10px; padding: 14px; border-radius: 16px; border: 1px solid var(--line); background: var(--surface); container-type: inline-size; }
  .search { height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); padding: 0 14px; font: 500 15px var(--font); }
  .search:focus { outline: none; border-color: var(--voucher); }
  /* Two columns once there's room, scrolling inside the pane. */
  .list { min-height: 0; flex: 1; overflow-y: auto; display: grid; grid-template-columns: 1fr; align-content: start; column-gap: 18px; }
  @container (min-width: 480px) { .list { grid-template-columns: 1fr 1fr; } }
  .row { display: flex; align-items: center; gap: 12px; min-height: 54px; padding: 0; border: 0; border-top: 1px solid var(--divider); background: none; color: var(--ink); text-align: left; cursor: pointer; }
  .row:disabled { cursor: default; }
  .row.taken { opacity: .45; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 1px; }
  .name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub { font: 500 11.5px var(--mono); color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.plain { font: 500 12px var(--font); }
  .state { width: 30px; height: 30px; flex: none; border-radius: 50%; border: 1px solid var(--line); display: grid; place-items: center; }
  .state.on { border-color: var(--voucher); background: var(--voucher); color: var(--voucher-ink); }
  .row:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; border-radius: 8px; }
  .empty { margin: 8px 0; font-size: 13px; color: var(--muted); }
</style>
