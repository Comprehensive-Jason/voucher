<script lang="ts">
  // Today's earnings hour by hour, one block per Voucher coloured by source,
  // with a dot under each hour that had a Redemption.
  import { SOURCES, sourceOf } from "../sources";
  import { hourOf } from "../time";
  import type { DaySummary } from "../types";

  let { today, timeZone, tall = false }: { today: DaySummary; timeZone: string; tall?: boolean } = $props();

  const FIRST_HOUR = 6;
  const HOURS = 18; // 06 to 23; anything after midnight joins the last column
  const chart = $derived(tall ? 150 : 84);
  const most = $derived(tall ? 24 : 22);

  const columns = $derived.by(() => {
    const cols = Array.from({ length: HOURS }, () => ({ blocks: [] as string[], redeemed: false }));
    for (const e of [...today.log].reverse()) {
      const h = hourOf(e.at, timeZone);
      const col = h >= FIRST_HOUR ? h - FIRST_HOUR : HOURS - 1;
      if (e.kind === "earned") cols[col].blocks.push(sourceOf(e.task).color);
      else cols[col].redeemed = true;
    }
    return cols;
  });
  // Blocks keep their full height until a busy hour needs them smaller to fit.
  const block = $derived.by(() => {
    const n = Math.max(1, ...columns.map((c) => c.blocks.length));
    return Math.min(most, (chart - (n - 1) * 2) / n);
  });
</script>

<section class="card" class:tall>
  <div class="head"><span class="cap">Today, by hour</span>
    <span class="cap earn">{tall ? `${today.earned} earned · ${today.redeemed} redeemed` : `+${today.earned} · −${today.redeemed}`}</span></div>
  <div class="chart" style="height: {chart}px">
    {#each columns as c}
      <div class="col">
        {#each c.blocks as color}<div class="block" style="height: {block}px; background: {color}"></div>{/each}
      </div>
    {/each}
  </div>
  <div class="dots">
    {#each columns as c}<div><i class:on={c.redeemed}></i></div>{/each}
  </div>
  <div class="mono axis"><span>06</span><span>09</span><span>12</span><span>15</span><span>18</span><span>21</span><span>23</span></div>
  <div class="legend">
    {#each Object.values(SOURCES) as s}<span><i style="background: {s.color}"></i>{tall ? s.name : s.short}</span>{/each}
    <span><i class="round"></i>Redeemed (dot)</span>
  </div>
</section>

<style>
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .head { display: flex; justify-content: space-between; }
  .earn { color: var(--voucher); }
  .chart { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; align-items: end; border-bottom: 1px solid #3a3f45; }
  .col { display: flex; flex-direction: column; justify-content: flex-end; gap: 2px; height: 100%; }
  .block { border-radius: 3px; }
  .dots { display: grid; grid-template-columns: repeat(18, minmax(0, 1fr)); gap: 4px; height: 10px; }
  .dots div { display: flex; justify-content: center; }
  .dots i { width: 8px; height: 8px; border-radius: 50%; }
  .dots i.on { background: var(--ink); }
  .axis { display: flex; justify-content: space-between; font-size: 11px; color: var(--muted); }
  .legend { display: flex; column-gap: 12px; row-gap: 6px; flex-wrap: wrap; font-size: 12px; color: #c9cdd1; }
  .legend span { display: flex; align-items: center; gap: 6px; }
  .legend i { width: 10px; height: 10px; border-radius: 3px; }
  .legend i.round { border-radius: 50%; background: var(--ink); }
  .tall { gap: 14px; padding: 18px; border-radius: 18px; }
  .tall .chart, .tall .dots { gap: 6px; }
  .tall .dots { height: 18px; }
  .tall .dots i { width: 10px; height: 10px; }
  .tall .block { border-radius: 4px; }
</style>
