<script lang="ts">
  // Counterfoil's one screen. On a wide screen: the dashboard
  // ($core/Dashboard.svelte), with the Day's column first and Counterfoil's
  // cards beside it. On a narrow one: the Day's column, then the cards one
  // under another. It only reads the Ledger, and writes nothing but Markers.
  import { ledger } from "$core/api";
  import { wide } from "$core/wide.svelte";
  import { historyDays } from "$core/time";
  import { setCurfew } from "$core/curfew.svelte";
  import Dashboard from "$core/Dashboard.svelte";
  import CardTab from "$core/components/CardTab.svelte";
  import LedgerNotice from "$core/components/LedgerNotice.svelte";
  import MarkerButton from "$core/components/MarkerButton.svelte";
  import MarkerSheet from "$core/components/MarkerSheet.svelte";
  import type { DayTotal, Status } from "$core/types";
  import { ABOUT } from "$lib/about";
  import { useArrangement } from "$core/arrangement.svelte";
  import { NAME } from "$lib/app";

  let status = $state.raw<Status | null>(null);
  let history = $state.raw<DayTotal[]>([]);
  let addingMarker = $state(false);
  const arrangement = useArrangement();

  async function load() {
    try {
      const s = await ledger<Status>("GET", "/status");
      status = s;
      setCurfew(s.settings.curfew_start, s.settings.curfew_end);
      history = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(s.today.day, s.first_day)}`);
    } catch { /* the Ledger notice says what's wrong */ }
  }
  $effect(() => {
    load();
    const timer = setInterval(load, 60_000);
    return () => clearInterval(timer);
  });

  /** The Day with its weekday, such as "Wednesday 2026-10-07". */
  const dayName = $derived(status ? `${new Date(`${status.today.day}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "long", timeZone: "UTC" })} ${status.today.day}` : "");
</script>

{#snippet dayColumn()}
  <header>
    <span class="cap brand">{NAME}</span>
    {#if dayName}<h1>{dayName}</h1>{/if}
  </header>
  <LedgerNotice app={NAME} reconnect={() => location.reload()} />
  <p class="lede">Your Days as the Ledger keeps them, beside how you slept and how full your calendar was. {NAME} only reads; it never spends a Voucher or changes a rule.</p>
  <div class="actions"><MarkerButton onclick={() => (addingMarker = true)} /></div>
{/snippet}

{#if wide.on}
  <Dashboard about={ABOUT}>
    {#snippet first()}{@render dayColumn()}{/snippet}
    {#snippet card(_id: string)}{/snippet}
  </Dashboard>
{:else}
  <main>
    {@render dayColumn()}
    {#each arrangement.order as id (id)}
      {@const name = arrangement.panels[id].name}
      <div class="slot" role="group" aria-label={name}>
        <span class="tab"><CardTab {name} /></span>
      </div>
    {/each}
  </main>
{/if}
{#if addingMarker}<MarkerSheet onclose={() => (addingMarker = false)} />{/if}

<style>
  main { padding: calc(24px + env(safe-area-inset-top)) 20px 24px; display: flex; flex-direction: column; gap: 18px; }
  header { display: flex; flex-direction: column; gap: 8px; padding-top: 14px; }
  .brand { color: var(--muted); letter-spacing: .2em; }
  h1 { margin: 0; font: 700 30px var(--font); color: var(--ink); }
  .lede { margin: 0; font-size: 14px; line-height: 1.5; color: var(--muted); max-width: 46ch; }
  .actions { display: flex; gap: 10px; }
  .slot { position: relative; display: flex; flex-direction: column; padding-top: 20px; }
  .slot > :global(.tile) { border-top-left-radius: 0; }
  .tab { position: absolute; z-index: 1; top: 0; left: 0; }
</style>
