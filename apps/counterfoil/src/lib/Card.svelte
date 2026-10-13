<script lang="ts">
  // One of Counterfoil's cards by its id (lib/cards.ts), drawn from the
  // Ledger's status and history: the one dispatch the dashboard and the
  // narrow layout share. Until the status has come, they wait for it.
  import Sleep from "./cards/Sleep.svelte";
  import CalendarLoad from "./cards/CalendarLoad.svelte";
  import GoodDays from "./cards/GoodDays.svelte";
  import InsightsCard from "$core/insights/InsightsCard.svelte";
  import type { DayTotal, Status } from "$core/types";
  import type { PanelId } from "./cards";

  let { id, status, history }: { id: PanelId; status: Status | null; history: DayTotal[] } = $props();
</script>

{#if status}
  {#if id === "insights"}<InsightsCard {history} timeZone={status.settings.time_zone} blocklists={status.settings.blocklists} />
  {:else if id === "sleep"}<Sleep {history} timeZone={status.settings.time_zone} blocklists={status.settings.blocklists} />
  {:else if id === "calendar"}<CalendarLoad {history} />
  {:else if id === "gooddays"}<GoodDays {history} timeZone={status.settings.time_zone} />{/if}
{/if}
