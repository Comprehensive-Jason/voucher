<script lang="ts">
  // A new blocklist, built up here and sent to the Ledger on Save. A new
  // blocklist only adds blocking, so it applies at once. On a wide screen,
  // Apps, Sites, and the installed apps sit side by side.
  import { goto } from "$app/navigation";
  import { ledger } from "$lib/api";
  import Tag from "$lib/components/Tag.svelte";
  import EntryList from "$lib/components/EntryList.svelte";
  import AddEntrySheets from "$lib/components/AddEntrySheets.svelte";
  import AppPicker from "$lib/components/AppPicker.svelte";
  import ColorButton from "$lib/components/ColorButton.svelte";
  import ColorSheet from "$lib/components/ColorSheet.svelte";
  import SiteField from "$lib/components/SiteField.svelte";
  import { wide } from "$lib/wide.svelte";
  import { onMount } from "svelte";
  import { LIST_COLORS } from "$lib/blocklists";
  import type { BlockedApp, BlockedSite, Status } from "$lib/types";

  let name = $state("");
  let apps = $state<BlockedApp[]>([]);
  let sites = $state<BlockedSite[]>([]);
  let adding = $state<"app" | "site" | null>(null);
  let error = $state<string | null>(null);
  let coloring = $state(false);
  /** The colour, picked here or else the next unused one. */
  let color = $state(LIST_COLORS[0]);
  let picked = false;
  onMount(async () => {
    try {
      const status = await ledger<Status>("GET", "/status");
      const used = new Set(Object.values(status.settings.blocklists).map((l) => l.color.toLowerCase()));
      if (!picked) color = LIST_COLORS.find((c) => !used.has(c.toLowerCase())) ?? LIST_COLORS[used.size % LIST_COLORS.length];
    } catch {}
  });
  const addApp = (a: { package: string; label: string }) => {
    adding = null;
    if (!apps.some((x) => x.package === a.package)) apps = [...apps, { package: a.package, label: a.label, note: null, on: true, added: true }];
  };
  const addSite = (s: string) => {
    adding = null;
    if (!sites.some((x) => x.site === s)) sites = [...sites, { site: s, note: null, on: true, added: true }];
  };

  const id = $derived(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  const valid = $derived(!!id && (apps.some((a) => a.on) || sites.some((s) => s.on)));

  async function save() {
    try {
      const status = await ledger<Status>("GET", "/status");
      const taken = new Set(Object.keys(status.settings.blocklists));
      let key = id, n = 2;
      while (taken.has(key)) key = `${id}-${n++}`;
      await ledger("POST", "/change", { NewBlocklist: { id: key, list: { name: name.trim(), color, premade: false, on: true, apps, sites } } });
      goto("/rules/distractions");
    } catch (e) { error = String(e); }
  }
</script>

<main class:split={wide.on}>
  <header>
    <button class="back" aria-label="Back to blocklists" onclick={() => goto("/rules/distractions")}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>New blocklist</h1>
    <Tag premade={false} />
  </header>
  {#if error}<p class="error">{error}</p>{/if}

  <div class="panes">
    <div class="pane">
      <label class="field">
        <span class="cap">Name</span>
        <!-- svelte-ignore a11y_autofocus -->
        <span class="namerow">
          <input placeholder="For example: Games" bind:value={name} autofocus />
          <ColorButton {color} round label={name || "New blocklist"} onclick={() => (coloring = true)} />
        </span>
      </label>

      <EntryList title="Apps" icons empty={wide.on ? "Tap apps on the right to block them" : "No apps yet"} onadd={wide.on ? undefined : () => (adding = "app")}
        rows={apps.map((a) => ({ key: a.package, name: a.label, note: a.note, on: a.on, added: true }))}
        ontoggle={(key, on) => (apps = apps.map((a) => (a.package === key ? { ...a, on } : a)))}
        onremove={(key) => (apps = apps.filter((a) => a.package !== key))} />

      {#if !wide.on}{@render siteList()}{/if}

      <div class="foot">A new blocklist starts blocking as soon as you save it. Removing entries later waits for 06:00.</div>
      <button class="primary" disabled={!valid} onclick={save}>Save blocklist</button>
    </div>
    {#if wide.on}
      <div class="pane">
        <SiteField onadd={addSite} />
        {@render siteList()}
      </div>
      <AppPicker members={apps.map((a) => a.package)} games onadd={addApp} />
    {/if}
  </div>
</main>

{#snippet siteList()}
  <EntryList title="Sites" empty="No sites yet" onadd={wide.on ? undefined : () => (adding = "site")}
    rows={sites.map((s) => ({ key: s.site, name: s.site, note: s.note, on: s.on, added: true }))}
    ontoggle={(key, on) => (sites = sites.map((s) => (s.site === key ? { ...s, on } : s)))}
    onremove={(key) => (sites = sites.filter((s) => s.site !== key))} />
{/snippet}

<AddEntrySheets mode={adding} onclose={() => (adding = null)} onapp={addApp} onsite={addSite} />

{#if coloring}
  <ColorSheet title="{name || "New blocklist"} colour" current={color} onpick={(c) => { coloring = false; if (c) { color = c; picked = true; } }} onclose={() => (coloring = false)} />
{/if}

<style>
  main { min-height: 100%; padding: calc(12px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 10px; }
  .namerow { display: flex; gap: 10px; }
  .namerow input { flex: 1; min-width: 0; }
  .panes, .pane { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  /* Wide: Apps, Sites, and the installed apps, each scrolling on its own. */
  main.split { height: 100%; min-height: 0; padding: 24px 32px; gap: 16px; }
  main.split .panes { min-height: 0; display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr) minmax(0, 1.1fr); gap: 24px; }
  main.split .pane { min-height: 0; overflow-y: auto; }
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
