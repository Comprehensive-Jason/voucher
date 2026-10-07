<script lang="ts">
  // A new blocklist, built up here and sent to the Ledger on Save. A new
  // blocklist only adds blocking, so it applies at once.
  import { goto } from "$app/navigation";
  import { ledger } from "$lib/api";
  import Tag from "$lib/components/Tag.svelte";
  import EntryList from "$lib/components/EntryList.svelte";
  import AddEntrySheets from "$lib/components/AddEntrySheets.svelte";
  import { LIST_COLORS } from "$lib/blocklists";
  import type { BlockedApp, BlockedSite, Status } from "$lib/types";

  let name = $state("");
  let apps = $state<BlockedApp[]>([]);
  let sites = $state<BlockedSite[]>([]);
  let adding = $state<"app" | "site" | null>(null);
  let error = $state<string | null>(null);

  const id = $derived(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const valid = $derived(!!id && (apps.some((a) => a.on) || sites.some((s) => s.on)));

  async function save() {
    try {
      const status = await ledger<Status>("GET", "/status");
      const taken = new Set(Object.keys(status.settings.blocklists));
      let key = id, n = 2;
      while (taken.has(key)) key = `${id}-${n++}`;
      const color = LIST_COLORS[taken.size % LIST_COLORS.length];
      await ledger("POST", "/change", { NewBlocklist: { id: key, list: { name: name.trim(), color, premade: false, on: true, apps, sites } } });
      goto("/rules/distractions");
    } catch (e) { error = String(e); }
  }
</script>

<main>
  <header>
    <button class="back" aria-label="Back to blocklists" onclick={() => goto("/rules/distractions")}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>New blocklist</h1>
    <Tag premade={false} />
  </header>
  {#if error}<p class="error">{error}</p>{/if}

  <label class="field">
    <span class="cap">Name</span>
    <!-- svelte-ignore a11y_autofocus -->
    <input placeholder="For example: Games" bind:value={name} autofocus />
  </label>

  <EntryList title="Apps" empty="No apps yet" onadd={() => (adding = "app")}
    rows={apps.map((a) => ({ key: a.package, name: a.label, note: a.note, on: a.on, added: true }))}
    ontoggle={(key, on) => (apps = apps.map((a) => (a.package === key ? { ...a, on } : a)))}
    onremove={(key) => (apps = apps.filter((a) => a.package !== key))} />

  <EntryList title="Sites" empty="No sites yet" onadd={() => (adding = "site")}
    rows={sites.map((s) => ({ key: s.site, name: s.site, note: s.note, on: s.on, added: true }))}
    ontoggle={(key, on) => (sites = sites.map((s) => (s.site === key ? { ...s, on } : s)))}
    onremove={(key) => (sites = sites.filter((s) => s.site !== key))} />

  <div class="foot">A new blocklist starts blocking as soon as you save it. Removing entries later waits for 06:00.</div>
  <button class="primary" disabled={!valid} onclick={save}>Save blocklist</button>
</main>

<AddEntrySheets mode={adding} onclose={() => (adding = null)}
  onapp={(a) => { adding = null; if (!apps.some((x) => x.package === a.package)) apps = [...apps, { package: a.package, label: a.label, note: null, on: true, added: true }]; }}
  onsite={(s) => { adding = null; if (!sites.some((x) => x.site === s)) sites = [...sites, { site: s, note: null, on: true, added: true }]; }} />

<style>
  main { min-height: 100%; padding: calc(12px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; gap: 4px; margin-left: -12px; }
  .back { width: 44px; height: 44px; padding: 0; background: none; border: 0; color: var(--ink); display: flex; align-items: center; justify-content: center; }
  h1 { flex: 1; margin: 0; font-size: 22px; font-weight: 700; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  input { height: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 0 14px; font: 700 15px var(--font); }
  input:focus { outline: none; border-color: var(--voucher); }
  .foot { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .primary { margin-top: auto; min-height: 48px; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 15px var(--font); }
  .primary:disabled { background: var(--line); color: var(--muted); }
  .error { color: var(--goal); }
</style>
