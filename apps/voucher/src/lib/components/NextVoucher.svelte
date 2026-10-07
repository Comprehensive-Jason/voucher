<script lang="ts">
  let { sources }: { sources: { name: string; detail: string; progress: number; color: string }[] } = $props();
</script>

<section>
  <div class="cap">Toward the next Voucher</div>
  {#each sources as s}
    <div class="src">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={s.color} stroke-width="2"><circle cx="12" cy="12" r="8" /></svg>
      <span class="name">{s.name}</span>
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
  .wide { grid-column: 2 / 4; }
</style>
