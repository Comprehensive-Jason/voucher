<script lang="ts">
  // One of Voucher's cards by its id (lib/cards.ts), drawn from the Ledger's
  // status and history: the one dispatch the tablet's dashboard and the
  // phone's Trends pages share. Until the status has come, only the Log
  // shows; the others wait for it.
  import HourChart from "$lib/panels/HourChart.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import TrendLines from "$lib/panels/trends/TrendLines.svelte";
  import WhenYouEarn from "$lib/panels/trends/WhenYouEarn.svelte";
  import PaceToGoal from "$lib/panels/trends/PaceToGoal.svelte";
  import MorningRunway from "$lib/panels/trends/MorningRunway.svelte";
  import HabitStrength from "$lib/panels/trends/HabitStrength.svelte";
  import SourceStreaks from "$lib/panels/trends/SourceStreaks.svelte";
  import PersonalRecords from "$lib/panels/trends/PersonalRecords.svelte";
  import BestHours from "$lib/panels/trends/BestHours.svelte";
  import GoodDays from "$lib/panels/trends/GoodDays.svelte";
  import Replay from "$lib/panels/trends/Replay.svelte";
  import FocusStretches from "$lib/panels/trends/FocusStretches.svelte";
  import Verdicts from "$lib/panels/trends/Verdicts.svelte";
  import Compare from "$lib/panels/trends/Compare.svelte";
  import Reasons from "$lib/panels/trends/Reasons.svelte";
  import Sleep from "$lib/panels/trends/Sleep.svelte";
  import CalendarLoad from "$lib/panels/trends/CalendarLoad.svelte";
  import Planned from "$lib/panels/trends/Planned.svelte";
  import { selection } from "$core/selection.svelte";
  import type { DaySummary, DayTotal, DeviceUsage, Status } from "$core/types";
  import type { PanelId } from "./cards";

  let { id, today, timeZone, firstDay, blocklists, history, usage, keyBelow = true }: {
    id: PanelId;
    /** Today, from the status; null until it has come. */
    today: DaySummary | null;
    timeZone: string;
    firstDay: string | undefined;
    blocklists: Status["settings"]["blocklists"];
    history: DayTotal[];
    usage: DeviceUsage | null;
    /** Activity's key under its grid (the phone), or beside it (the tablet). */
    keyBelow?: boolean;
  } = $props();
</script>

{#if id === "log"}<div class="logcard tile"><LogPanel compact /></div>
{:else if today}
  {#if id === "earned"}<HourChart {today} {timeZone} {firstDay} tall />
  {:else if id === "heat"}<Heatmap {history} goal={today.goal} {firstDay} selected={selection.day ?? today.day} onpick={(day) => selection.set("heat", { day, picked: true })} {keyBelow} />
  {:else if id === "distraction"}<HourChart measure="distraction" {today} {timeZone} {firstDay} {blocklists} device={usage} tall />
  {:else if id === "trend"}<TrendLines {history} goal={today.goal} />
  {:else if id === "when"}<WhenYouEarn {history} />
  {:else if id === "pace"}<PaceToGoal {history} {today} {timeZone} />
  {:else if id === "runway"}<MorningRunway {history} {timeZone} />
  {:else if id === "strength"}<HabitStrength {history} />
  {:else if id === "streaks"}<SourceStreaks {history} sources={today.sources} />
  {:else if id === "records"}<PersonalRecords {history} {timeZone} />
  {:else if id === "best"}<BestHours {history} />
  {:else if id === "gooddays"}<GoodDays {history} {timeZone} />
  {:else if id === "replay"}<Replay {history} />
  {:else if id === "focus"}<FocusStretches {history} />
  {:else if id === "verdicts"}<Verdicts {history} />
  {:else if id === "compare"}<Compare {history} />
  {:else if id === "reasons"}<Reasons {history} />
  {:else if id === "sleep"}<Sleep {history} {timeZone} {blocklists} />
  {:else if id === "calendar"}<CalendarLoad {history} />
  {:else if id === "planned"}<Planned {history} {timeZone} {blocklists} />{/if}
{/if}

<style>
  .logcard { gap: 6px; }
</style>
