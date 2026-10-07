<script lang="ts">
  let { active }: { active: "today" | "trends" | "log" | "rules" } = $props();
  const tabs = [
    { id: "today", label: "Today", path: "M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" },
    { id: "trends", label: "Trends", path: "M5 20V11M12 20V4M19 20v-6" },
    { id: "log", label: "Log", path: "M4 6h16M4 12h16M4 18h10" },
    { id: "rules", label: "Rules", path: "M4 7h10M18 7h2M4 17h4M12 17h8M16 5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM10 15a2 2 0 1 1 0 4 2 2 0 0 1 0-4z" },
  ] as const;
</script>

<nav>
  {#each tabs as t}
    <button class:on={t.id === active} aria-current={t.id === active ? "page" : undefined}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d={t.path} /></svg>
      {t.label}
    </button>
  {/each}
</nav>

<style>
  nav { display: flex; border-top: 1px solid var(--divider); padding: 4px 8px calc(10px + env(safe-area-inset-bottom)); }
  button { min-height: 48px; flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 4px; background: none; border: 0; color: var(--muted); font: 500 12px var(--font); }
  button.on { color: var(--voucher); }
</style>
