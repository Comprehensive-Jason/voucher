<script lang="ts">
  // Things beside the rules rather than rules: the wallpaper and watch preview,
  // and the Days export. Rules' fourth column on the tablet, its fourth tab on
  // the phone.
  import { shownByNotice } from "../health.svelte";
  import { exportDays } from "$lib/api";
  import RulesColumn from "$lib/components/RulesColumn.svelte";
  import RulesCard from "$lib/components/RulesCard.svelte";

  let { heading = false }: { heading?: boolean } = $props();
  let error = $state<string | null>(null);
  let exporting = $state(false);

  async function exportCsv() {
    exporting = true;
    try { await exportDays(); error = null; } catch (e) { error = String(e); }
    exporting = false;
  }
</script>

<RulesColumn title="Extras" column={heading}>
  {#if error && !shownByNotice(error)}<p class="error">{error}</p>{/if}
  <RulesCard row href="/rules/preview">
    <span class="text">
      <span class="name">Wallpaper and watch preview</span>
      <span class="sub">Today's numbers on the wallpaper and watch Tile</span>
    </span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </RulesCard>
  <RulesCard row onclick={exportCsv} disabled={exporting}>
    <span class="text">
      <span class="name">Export every Day (CSV)</span>
      <span class="sub">{exporting ? "Exporting…" : "One row per Day since the first, for a spreadsheet"}</span>
    </span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
  </RulesCard>
</RulesColumn>

<style>
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { font-size: 15px; font-weight: 700; }
  /* Four columns are narrow, so descriptions wrap rather than cut off. */
  .sub { font-size: 12px; line-height: 1.35; color: var(--muted); }
  .error { margin: 0; color: var(--danger); }
</style>
