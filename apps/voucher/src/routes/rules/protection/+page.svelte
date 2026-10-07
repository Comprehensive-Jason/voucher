<script lang="ts">
  // Protection on this device: each part's state and how to turn it on, plus
  // releasing the device, which waits for 06:00 like any Loosening.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { deviceId, fixProtection, ledger, onWindows, protection, protectionParts } from "$lib/api";
  import DeviceOwnerSteps from "$lib/components/DeviceOwnerSteps.svelte";
  import { hhmm, until } from "$lib/rules";
  import type { Protection, Status } from "$lib/types";

  let guard = $state<Protection | null>(null);
  let status = $state<Status | null>(null);
  let device = $state("");
  let showSteps = $state(false);
  let error = $state<string | null>(null);

  const PARTS = protectionParts();
  const released = $derived(!!status?.settings.released_devices.includes(device));
  const releasing = $derived(status?.pending.find(([c]) => (c as any).ReleaseDevice === device) ?? null);

  async function load() {
    try {
      [guard, status, device] = await Promise.all([protection(), ledger<Status>("GET", "/status"), deviceId()]);
      error = null;
    } catch (e) { error = String(e); }
  }
  async function send(change: Record<string, unknown>) {
    try { await ledger("POST", "/change", change); await load(); } catch (e) { error = String(e); }
  }

  onMount(() => {
    load();
    const recheck = () => document.visibilityState === "visible" && load();
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  });
</script>

<main>
  <header>
    <button class="back" aria-label="Back to Rules" onclick={() => goto("/rules")}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>Protection</h1>
  </header>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="list">
    {#each PARTS as p (p.part)}
      <div class="li">
        <span class="lt"><b>{p.name}</b><small>{p.what}</small></span>
        {#if guard?.[p.part]}
          <span class="ok">On</span>
        {:else if p.part === "deviceOwner" && onWindows}
          <span class="warnsm">Reinstall Voucher as an administrator</span>
        {:else if p.part === "deviceOwner"}
          <button class="sm" onclick={() => (showSteps = true)}>How</button>
        {:else}
          <button class="sm" onclick={() => fixProtection(p.part)}>Turn on</button>
        {/if}
      </div>
    {/each}
  </div>

  {#if onWindows}
    <div class="card"><p>On Windows an administrator can stop any service, the guard included. If you use this PC as an administrator, stopping the guard can't be prevented, only seen: it shows in the Log as a Gap. Using Windows from a standard account, with a separate administrator account, makes it hold.</p></div>
  {/if}

  {#if status}
    <div class="cap">This device · <span class="mono">{device}</span></div>
    <div class="card">
      {#if released}
        <p>Released: Voucher no longer blocks here. To remove it, open Settings, Apps, Voucher, and uninstall. To keep it instead:</p>
        <button class="ghost" onclick={() => send({ KeepDevice: device })}>Keep protecting this device</button>
      {:else if releasing}
        <p class="warn">Releases at {hhmm(status.settings.morning_boundary)}, {until(releasing[1])}. Until then everything stays as it is.</p>
        <button class="ghost" onclick={() => send({ KeepDevice: device })}>Cancel the release</button>
      {:else}
        <p>Releasing lets Voucher stop blocking here and give up Device Owner, so it can be uninstalled. Like any Loosening, it waits for {hhmm(status.settings.morning_boundary)}.</p>
        <button class="ghost danger" onclick={() => send({ ReleaseDevice: device })}>Release this device at {hhmm(status.settings.morning_boundary)}</button>
      {/if}
    </div>
  {/if}
</main>

{#if showSteps}<DeviceOwnerSteps onclose={() => { showSteps = false; load(); }} />{/if}

<style>
  main { padding: calc(12px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 12px; }
  header { display: flex; align-items: center; gap: 4px; margin-left: -12px; }
  .back { width: 44px; height: 44px; padding: 0; background: none; border: 0; color: var(--ink); display: flex; align-items: center; justify-content: center; }
  h1 { margin: 0; font-size: 22px; font-weight: 700; }
  .list { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 0 14px; }
  .li { display: flex; align-items: center; gap: 12px; min-height: 72px; border-top: 1px solid var(--divider); padding: 8px 0; }
  .li:first-child { border-top: 0; }
  .lt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .lt b { font-size: 15px; }
  .lt small { font-size: 12px; color: var(--muted); line-height: 1.35; }
  .warnsm { font-size: 12px; color: var(--goal); max-width: 130px; text-align: right; }
  .ok { font-size: 13px; font-weight: 700; color: var(--voucher); }
  .sm { height: 36px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 13px var(--font); flex-shrink: 0; }
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; gap: 12px; }
  .card p { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  .card p.warn { color: var(--goal); }
  .ghost { min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 14px var(--font); }
  .danger { color: #ff8a7a; }
  .error { color: var(--goal); }
</style>
