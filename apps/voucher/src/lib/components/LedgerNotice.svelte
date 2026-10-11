<script lang="ts">
  // The Ledger notice: shown when Voucher can't talk to the Ledger, first
  // among every notice (above Protection off), in the shared .notice card.
  // It names what's wrong in plain words, since when, and what to do; the
  // raw error is in its tooltip. It goes as soon as any request gets through.
  import { goto } from "$app/navigation";
  import { ledger, RULES_CHANGED } from "../api";
  import { health } from "../health.svelte";
  import { reveal } from "../motion";

  let { axis = "y" }: { axis?: "x" | "y" } = $props();

  const since = $derived(health.problem ? new Date(health.problem.since).toTimeString().slice(0, 5) : "");
  const TEXT = {
    unreachable: { title: "Ledger unreachable", body: "You can't Unlock until it's back, and numbers here may be out of date. Voucher keeps trying.", action: "Retry" },
    access: { title: "Access code needed", body: "The Ledger answered but wants its access code again.", action: "Reconnect" },
    version: { title: "Ledger out of step", body: "The Ledger's answers don't fit this version of Voucher: update whichever is older.", action: "Retry" },
  };
  let trying = $state(false);
  async function act() {
    if (health.problem?.kind === "access") { goto("/setup"); return; }
    trying = true;
    try { await ledger("GET", "/status"); window.dispatchEvent(new Event(RULES_CHANGED)); } catch { /* the notice stays */ }
    trying = false;
  }
</script>

{#if health.problem}
  {@const t = TEXT[health.problem.kind]}
  <div class="notice danger" transition:reveal={{ axis }} title={health.problem.detail}>
    <div class="ntext">
      <span class="cap iconline"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7V3M15 7V3M7 7h10v4a5 5 0 0 1-10 0z" /><path d="M12 16v5" /><path d="M3 3l18 18" /></svg>{t.title}{since ? ` since ${since}` : ""}</span>
      <span>{t.body}</span>
    </div>
    <button class="btn small fix" disabled={trying} onclick={act}>{trying ? "Trying…" : t.action}</button>
  </div>
{/if}

<style>
  .iconline { display: inline-flex; align-items: center; gap: 6px; }
  .iconline svg { flex: none; margin-block: -3px; }
</style>
