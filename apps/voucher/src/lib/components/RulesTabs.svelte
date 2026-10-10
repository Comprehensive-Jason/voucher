<script lang="ts" module>
  export type RulesTab = "limits" | "sources" | "distractions" | "extras";
  const TABS: { id: RulesTab; label: string; href: string }[] = [
    { id: "limits", label: "Limits", href: "/rules" },
    { id: "sources", label: "Sources", href: "/rules/sources" },
    { id: "distractions", label: "Distractions", href: "/rules/distractions" },
    { id: "extras", label: "Extras", href: "/rules/extras" },
  ];
  /** The tab a path shows, or null for Rules pages that aren't tabs (editors, Protection). */
  export function tabOf(path: string): RulesTab | null {
    return TABS.find((t) => t.href === path.replace(/\/$/, ""))?.id ?? null;
  }
</script>

<script lang="ts">
  // The phone's Rules tabs, with the page-wide notices under them. The Rules
  // layout keeps this mounted from tab to tab, so the highlight fades across.
  import { goto } from "$app/navigation";
  import ZoomSwitch from "./ZoomSwitch.svelte";
  import RulesNotices from "./RulesNotices.svelte";
  import { NOTICES_IN_HEADER } from "../notices";

  let { active }: { active: RulesTab } = $props();
</script>

<ZoomSwitch size="large" label="Rules" options={TABS} value={active} onchange={(id) => goto(TABS.find((t) => t.id === id)!.href)} />
{#if NOTICES_IN_HEADER}<RulesNotices />{/if}
