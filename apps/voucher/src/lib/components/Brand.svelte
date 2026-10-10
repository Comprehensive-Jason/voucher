<script lang="ts">
  // The Voucher mark and name. `night` turns the mark indigo during Curfew.
  let { night = false }: { night?: boolean } = $props();
</script>

<div class="brand">
  <svg width="22" height="22" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" fill={night ? "var(--night-ink)" : "var(--voucher)"} /><path d="M8.2 7.6l3.8 6.8 3.8-6.8" fill="none" stroke="var(--ground)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
  <span class="mono word">VOUCHER</span>
</div>

<style>
  .brand { display: flex; align-items: center; gap: 8px; }
  .word { font-size: 15px; font-weight: 700; letter-spacing: .2em; }
</style>
