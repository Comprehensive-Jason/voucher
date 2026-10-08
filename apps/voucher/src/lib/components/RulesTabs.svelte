<script lang="ts">
  import GraceBanner from "./GraceBanner.svelte";
  let { active }: { active: "limits" | "sources" | "distractions" } = $props();
  const segs = [
    { id: "limits", label: "Limits", href: "/rules" },
    { id: "sources", label: "Sources", href: "/rules/sources" },
    { id: "distractions", label: "Distractions", href: "/rules/distractions" },
  ] as const;
</script>

<div class="segs">
  {#each segs as s}<a class="seg" class:on={s.id === active} href={s.href}>{s.label}</a>{/each}
</div>
<GraceBanner />

<style>
  .segs { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 4px; padding: 4px; border-radius: 14px; background: var(--surface); border: 1px solid var(--line); }
  .seg { min-height: 40px; display: flex; align-items: center; justify-content: center; border-radius: 10px; color: var(--muted); font: 700 13px var(--font); text-decoration: none; }
  .seg.on { background: var(--line); color: var(--ink); }
</style>
