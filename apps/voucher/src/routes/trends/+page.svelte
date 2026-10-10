<script lang="ts">
  // The phone's Trends: the tablet's cards and the Log, in the tablet's
  // arrangement (arrangement.svelte.ts), one column of three thirds per
  // page. Pages are the phone's full width and swipe sideways one at a
  // time; the tab bar's Trends tab turns into the page selector meanwhile
  // (phonepages.svelte.ts). Each card fills its slot and redraws to its
  // shape, as on the tablet, with its name on a folder tab above it.
  import { onMount, tick } from "svelte";
  import { deviceUsage, ledger } from "$lib/api";
  import HourChart from "$lib/panels/HourChart.svelte";
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
  import WalkAway from "$lib/panels/trends/WalkAway.svelte";
  import Verdicts from "$lib/panels/trends/Verdicts.svelte";
  import Compare from "$lib/panels/trends/Compare.svelte";
  import Reasons from "$lib/panels/trends/Reasons.svelte";
  import Heatmap from "$lib/panels/Heatmap.svelte";
  import LogPanel from "$lib/panels/LogPanel.svelte";
  import CardTab from "$lib/components/CardTab.svelte";
  import { arrangement, PANELS, ROWS, type PanelId } from "$lib/arrangement.svelte";
  import { fillSlots } from "$lib/fit.svelte";
  import { phonePages } from "$lib/phonepages.svelte";
  import { selection } from "$lib/selection.svelte";
  import { setCurfew } from "$lib/curfew.svelte";
  import { historyDays } from "$lib/time";
  import type { DaySummary, DayTotal, DeviceUsage, Status } from "$lib/types";

  // Cards fill their slots (thirds of a page), as on the tablet.
  fillSlots();

  let today = $state<DaySummary | null>(null);
  let timeZone = $state("UTC");
  let firstDay = $state<string | undefined>();
  let history = $state<DayTotal[]>([]);
  let usage = $state<DeviceUsage | null>(null);
  let blocklists = $state<Status["settings"]["blocklists"]>({});
  let error = $state<string | null>(null);

  // ---- Pages ----
  // One column of the arrangement per page. A swipe stops at every page
  // (scroll-snap-stop), and the tab bar lights the page in view, or both
  // while a swipe straddles two.
  let strip = $state<HTMLDivElement>();
  const columns = $derived(arrangement.columns);
  $effect(() => { phonePages.count = Math.max(1, columns.length); });
  /** The page a tap in the tab bar is heading to; the highlight goes straight there instead of following the scroll past the pages between. */
  let heading: number | null = null;
  function onScroll() {
    if (!strip || !strip.clientWidth || heading !== null) return;
    const at = strip.scrollLeft / strip.clientWidth;
    const last = phonePages.count - 1;
    const a = Math.min(last, Math.floor(at + 0.04));
    phonePages.set(a, Math.min(last, Math.max(a, Math.ceil(at - 0.04))));
  }
  function go(i: number) {
    if (!strip) return;
    heading = i;
    phonePages.set(i, i);
    // Back to following the scroll once it lands (or soon after, if it was already there).
    const land = () => { if (heading !== i) return; heading = null; onScroll(); };
    strip.addEventListener("scrollend", land, { once: true });
    setTimeout(land, 1500);
    strip.scrollTo({ left: i * strip.clientWidth, behavior: "smooth" });
  }

  onMount(() => {
    phonePages.go = go;
    load();
    return () => { if (phonePages.go === go) phonePages.go = null; };
  });

  async function load() {
    try {
      const status = await ledger<Status>("GET", "/status");
      setCurfew(status.settings.curfew_start, status.settings.curfew_end);
      blocklists = status.settings.blocklists;
      today = status.today;
      timeZone = status.settings.time_zone;
      firstDay = status.first_day;
      history = await ledger<DayTotal[]>("GET", `/history?days=${historyDays(today.day, firstDay)}`);
      usage = await deviceUsage();
      error = null;
      // Back on the page last seen here.
      await tick();
      const page = Math.min(phonePages.a, phonePages.count - 1);
      if (strip) strip.scrollLeft = page * strip.clientWidth;
      phonePages.set(page, page);
    } catch (e) {
      error = String(e);
    }
  }
</script>

{#snippet panel(id: PanelId)}
  {#if id === "log"}<div class="logcard tile"><LogPanel compact /></div>
  {:else if today}
    {#if id === "earned"}<HourChart {today} {timeZone} {firstDay} tall />
    {:else if id === "heat"}<Heatmap {history} goal={today.goal} {firstDay} selected={selection.day ?? today.day} onpick={(day) => selection.set("heat", { day, picked: true })} />
    {:else if id === "distraction"}<HourChart measure="distraction" {today} {timeZone} {firstDay} {blocklists} device={usage} tall />
    {:else if id === "trend"}<TrendLines {history} goal={today.goal} />
    {:else if id === "when"}<WhenYouEarn {history} />
    {:else if id === "pace"}<PaceToGoal {history} {today} {timeZone} />
    {:else if id === "runway"}<MorningRunway {history} {timeZone} />
    {:else if id === "strength"}<HabitStrength {history} />
    {:else if id === "streaks"}<SourceStreaks {history} sources={today.sources} />
    {:else if id === "records"}<PersonalRecords {history} {timeZone} />
    {:else if id === "best"}<BestHours {history} />
    {:else if id === "gooddays"}<GoodDays {history} />
    {:else if id === "replay"}<Replay {history} />
    {:else if id === "focus"}<FocusStretches {history} />
    {:else if id === "walkaway"}<WalkAway {history} />
    {:else if id === "verdicts"}<Verdicts {history} />
    {:else if id === "compare"}<Compare {history} />
    {:else if id === "reasons"}<Reasons {history} />{/if}
  {/if}
{/snippet}

<!-- No page title: the tab bar already says Trends, so the cards get the height. -->
<main>
  {#if error}
    <p class="error">{error}</p>
  {:else}
    <div class="strip" role="group" aria-label="Charts" bind:this={strip} onscroll={onScroll} style="--rows: {ROWS}">
      {#each columns as column, i (column.join())}
        <div class="page" role="group" aria-label="Page {i + 1} of {columns.length}">
          {#each column as id (id)}
            <div class="slot" role="group" aria-label={PANELS[id].name} style="grid-row: span {arrangement.size(id)}">
              <!-- The card's name, on a tab growing out of its top edge, so naming it costs the card no height. -->
              <span class="tab"><CardTab name={PANELS[id].name} /></span>
              {@render panel(id)}
            </div>
          {/each}
        </div>
      {/each}
    </div>
  {/if}
</main>

<style>
  /* The whole height above the tab bar. */
  main { height: 100%; display: flex; flex-direction: column; padding-top: env(safe-area-inset-top); }
  .error { margin: 20px; color: var(--goal); }
  .strip { flex: 1; min-height: 0; display: flex; overflow-x: auto; overflow-y: hidden; overscroll-behavior-x: contain; scroll-snap-type: x mandatory; scrollbar-width: none; }
  .strip::-webkit-scrollbar { display: none; }
  /* A page: the phone's full width, three equal thirds, stopping one at a time. */
  .page { --gap: 14px; flex: 0 0 100%; min-width: 0; display: grid; grid-template-rows: repeat(var(--rows), minmax(0, 1fr)); gap: var(--gap); padding: 12px 16px; scroll-snap-align: start; scroll-snap-stop: always; }
  /* Room at the top of each slot for its card's folder tab (CardTab), as on the tablet. */
  .slot { position: relative; display: flex; flex-direction: column; min-height: 0; min-width: 0; padding-top: 20px; }
  .slot > :global(.tile) { border-top-left-radius: 0; }
  .tab { position: absolute; z-index: 1; top: 0; left: 0; }
  .slot > :global(.card), .slot > :global(.logcard) { flex: 1; min-height: 0; overflow: hidden; }
  .logcard { gap: 6px; }
</style>
