<script lang="ts">
  // Paste an API token for Todoist or ClickUp. It goes to the Ledger, which
  // uses it from its next check.
  import { shownByNotice } from "../health.svelte";
  import { ledger } from "../api";
  import { serviceOf } from "../sources";
  import Sheet from "./Sheet.svelte";

  let { source, onclose, onsaved }: { source: string; onclose: () => void; onsaved: () => void } = $props();
  let token = $state("");
  let error = $state<string | null>(null);

  async function save() {
    try {
      await ledger("POST", "/token", { source, token });
      token = "";
      onsaved();
    } catch (e) { error = String(e); }
  }
</script>

<Sheet {onclose}>
  <h2>Connect {serviceOf(source).name}</h2>
  <p class="body">
    {#if source === "todoist"}Paste a Todoist API token: in Todoist, Settings, Integrations, Developer.{:else}Paste a ClickUp personal API token: in ClickUp, Settings, Apps.{/if}
    It goes straight to your Ledger and is never shown again.
  </p>
  <input class="mono" type="password" autocomplete="off" placeholder="API token" bind:value={token} />
  {#if error && !shownByNotice(error)}<p class="error">{error}</p>{/if}
  <button class="primary" disabled={!token.trim()} onclick={save}>Save token</button>
</Sheet>

<style>
  h2 { margin: 0; font-size: 22px; }
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  input { height: 48px; border-radius: 12px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); padding: 0 14px; font-size: 14px; }
  .primary { min-height: 52px; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 16px var(--font); }
  .primary:disabled { background: var(--line); color: var(--muted); }
  .error { margin: 0; color: var(--goal); font-size: 13px; }
</style>
