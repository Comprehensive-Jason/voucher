<script lang="ts">
  // `night` turns the logo indigo during Curfew; `rules` adds the tablet's Rules button.
  let { streakDays, night = false, rules = false }: { streakDays: number; night?: boolean; rules?: boolean } = $props();
</script>

<header>
  <div class="brand">
    <svg width="22" height="22" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" fill={night ? "#9aa6ff" : "var(--voucher)"} /><path d="M8.2 7.6l3.8 6.8 3.8-6.8" fill="none" stroke="var(--ground)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
    <span class="mono word">VOUCHER</span>
  </div>
  <div class="right">
    {#if streakDays > 0}
      <div class="streak">
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
        {streakDays} day streak
      </div>
    {/if}
    {#if rules}
      <a class="rules" href="/rules" aria-label="Rules">
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </a>
    {/if}
  </div>
</header>

<style>
  header { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .word { font-size: 15px; font-weight: 700; letter-spacing: .2em; }
  .right { display: flex; align-items: center; gap: 8px; }
  .rules { width: 44px; height: 44px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: flex; align-items: center; justify-content: center; }
  .streak { display: flex; align-items: center; gap: 6px; padding: 6px 10px; border-radius: 999px; background: var(--goal-bg); color: var(--goal); font-size: 13px; font-weight: 700; }
</style>
