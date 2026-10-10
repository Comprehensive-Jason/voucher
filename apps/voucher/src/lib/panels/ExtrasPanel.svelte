<script lang="ts">
  // Things beside the rules rather than rules: the wallpaper and watch preview,
  // and the Days export. Tablet only, as Rules' fourth column.
  import { goto } from "$app/navigation";
  import { exportDays } from "$lib/api";

  let { heading = false }: { heading?: boolean } = $props();
  let error = $state<string | null>(null);
  let exporting = $state(false);

  async function exportCsv() {
    exporting = true;
    try { await exportDays(); error = null; } catch (e) { error = String(e); }
    exporting = false;
  }
</script>

<div class="panel" class:headed={heading}>
  {#if heading}<div class="colhead"><span class="coltitle">Extras</span></div>{/if}
  <div class="body">
  {#if error}<p class="error">{error}</p>{/if}
  <button class="row" onclick={() => goto("/preview")}>
    <span class="text">
      <span class="name">Wallpaper and watch preview</span>
      <span class="sub">Today's numbers on the wallpaper and watch Tile</span>
    </span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
  </button>
  <button class="row" onclick={exportCsv} disabled={exporting}>
    <span class="text">
      <span class="name">Export every Day (CSV)</span>
      <span class="sub">{exporting ? "Exporting…" : "One row per Day since the first, for a spreadsheet"}</span>
    </span>
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 4v11M7 10l5 5 5-5M5 20h14" /></svg>
  </button>
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 10px; }
  .row { min-height: 64px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); padding: 10px 14px; display: flex; align-items: center; gap: 12px; color: var(--ink); font: inherit; text-align: left; cursor: pointer; }
  .row:disabled { cursor: default; }
  .row:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .name { font-size: 15px; font-weight: 700; }
  /* Four columns are narrow, so descriptions wrap rather than cut off. */
  .sub { font-size: 12px; line-height: 1.35; color: var(--muted); }
  .error { margin: 0; color: var(--goal); }
  /* As in the other columns: the heading stays put and only the body scrolls. */
  .body { display: contents; }
  .headed { height: 100%; min-height: 0; }
  .headed .colhead { flex: none; }
  .headed .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: inherit; overflow-y: auto; overscroll-behavior-y: contain; padding-bottom: 28px; scrollbar-width: none; }
  .headed .body::-webkit-scrollbar { display: none; }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
</style>
