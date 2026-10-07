<script lang="ts">
  import type { Source } from "../types";
  let { sources }: { sources: Source[] } = $props();
</script>

<section>
  <div class="cap">Toward the next Voucher</div>
  {#each sources as s}
    <div class="src">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s.color} stroke-width="2"><circle cx="12" cy="12" r="8" /></svg>
      <span class="name">{s.name}{#if s.sample}<span class="tag">sample</span>{/if}</span>
      <span class="mono detail">{s.detail}</span>
      <span></span>
      <div class="bar wide"><i style="width: {s.progress * 100}%; background: {s.color}"></i></div>
    </div>
  {/each}
</section>

<style>
  section { display: flex; flex-direction: column; gap: 10px; }
  .src { display: grid; grid-template-columns: 22px 1fr auto; column-gap: 10px; row-gap: 5px; align-items: center; }
  .name { font-size: 14px; font-weight: 500; }
  .detail { font-size: 12px; color: var(--muted); }
  .tag {
    margin-left: 8px; padding: 1px 6px; border: 1px solid var(--line); border-radius: 6px;
    font-size: 10px; font-weight: 600; letter-spacing: .04em; text-transform: uppercase; color: var(--muted);
  }
  .wide { grid-column: 2 / 4; }
</style>
