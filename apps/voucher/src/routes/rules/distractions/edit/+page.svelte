<script lang="ts">
  // Edit one blocklist. Every switch, add, or remove is sent to the Ledger at
  // once: adding blocks now; switching off or removing waits for 06:00. On a
  // wide screen, Apps, Sites, and the installed apps sit side by side.
  import { onMount } from "svelte";
  import { page } from "$app/state";
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
  import { siteName } from "$lib/blocklists";
  import { hhmm } from "$lib/rules";
  import type { Status } from "$lib/types";

  const id = page.url.searchParams.get("id") ?? "";
  let status = $state<Status | null>(null);
  let name = $state("");
  let adding = $state<"app" | "site" | null>(null);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);
  let coloring = $state(false);

  const list = $derived(status?.settings.blocklists[id] ?? null);
  const morning = $derived(status ? hhmm(status.settings.morning_boundary) : "06:00");

  /** A pending change that will switch off or remove this entry. */
  function waiting(kind: "app" | "site", key: string): string | null {
    for (const [c] of status?.pending ?? []) {
      const ch = c as any;
      if (kind === "app" && ch.BlockApp?.list === id && ch.BlockApp.app.package === key && !ch.BlockApp.app.on) return `Off at ${morning}`;
      if (kind === "app" && ch.RemoveApp?.list === id && ch.RemoveApp.package === key) return `Removed at ${morning}`;
      if (kind === "site" && ch.BlockSite?.list === id && ch.BlockSite.site.site === key && !ch.BlockSite.site.on) return `Off at ${morning}`;
      if (kind === "site" && ch.RemoveSite?.list === id && ch.RemoveSite.site === key) return `Removed at ${morning}`;
    }
    return null;
  }

  async function load() {
    try {
      status = await ledger<Status>("GET", "/status");
      name = status.settings.blocklists[id]?.name ?? "";
      error = null;
    } catch (e) { error = String(e); }
  }
  async function send(change: Record<string, unknown>) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", change);
      note = effect === "Now" ? "Applied now." : `Waits for ${morning}.`;
      await load();
    } catch (e) { error = String(e); }
  }
  function rename() {
    if (list && name.trim() && name.trim() !== list.name) send({ RenameBlocklist: { id, name: name.trim() } });
  }

  const addApp = (a: { package: string; label: string }) => {
    adding = null;
    send({ BlockApp: { list: id, app: { package: a.package, label: a.label, note: null, on: true, added: true } } });
  };
  const addSite = (site: string) => {
    adding = null;
    send({ BlockSite: { list: id, site: { site, note: null, on: true, added: true } } });
  };

  onMount(load);
</script>

<main class:split={wide.on}>
  <header>
    <button class="back" aria-label="Back to blocklists" onclick={() => goto("/rules/distractions")}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>Edit blocklist</h1>
    {#if list}<Tag premade={list.premade} /><ColorButton color={list.color} round label={list.name} onclick={() => (coloring = true)} />{/if}
  </header>
  {#if error}<p class="error">{error}</p>{/if}

  {#if list}
    <div class="panes">
      <div class="pane">
        <label class="field">
          <span class="cap">Name</span>
          <input bind:value={name} onblur={rename} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
        </label>

        <EntryList title="Apps" empty={wide.on ? "Tap apps on the right to block them" : "No apps yet"} onadd={wide.on ? undefined : () => (adding = "app")}
          rows={list.apps.map((a) => ({ key: a.package, name: a.label, note: a.note, on: a.on, added: a.added, waiting: waiting("app", a.package) }))}
          ontoggle={(key, on) => { const a = list.apps.find((x) => x.package === key)!; send({ BlockApp: { list: id, app: { ...a, on } } }); }}
          onremove={(key) => send({ RemoveApp: { list: id, package: key } })} />

        {#if !wide.on}{@render sites()}{/if}

        <div class="foot">Adding an entry applies now. Switching one off, or removing one you added, waits for {morning}.</div>
        {#if note}<div class="foot">{note}</div>{/if}

        <div class="actions">
          {#if list.premade}
            <button class="ghost" onclick={() => send({ ResetBlocklist: id })}>Reset to the premade list</button>
          {:else}
            <button class="ghost danger" onclick={async () => { await send({ DeleteBlocklist: id }); }}>Delete blocklist (at {morning})</button>
          {/if}
        </div>
      </div>
      {#if wide.on}
        <div class="pane">
          <SiteField onadd={addSite} />
          {@render sites()}
        </div>
        <AppPicker members={list.apps.map((a) => a.package)} games onadd={addApp} />
      {/if}
    </div>
  {/if}
</main>

{#snippet sites()}
  {#if list}
    <EntryList title="Sites" empty="No sites yet" onadd={wide.on ? undefined : () => (adding = "site")}
      rows={list.sites.map((s) => ({ key: s.site, name: siteName(s.site), note: s.note, on: s.on, added: s.added, waiting: waiting("site", s.site) }))}
      ontoggle={(key, on) => { const s = list.sites.find((x) => x.site === key)!; send({ BlockSite: { list: id, site: { ...s, on } } }); }}
      onremove={(key) => send({ RemoveSite: { list: id, site: key } })} />
  {/if}
{/snippet}

<AddEntrySheets mode={adding} onclose={() => (adding = null)} onapp={addApp} onsite={addSite} />

{#if coloring && list}
  <ColorSheet title="{list.name} colour" current={list.color} onpick={(c) => { coloring = false; if (c) send({ BlocklistColor: { id, color: c } }); }} onclose={() => (coloring = false)} />
{/if}

<style>
  main { min-height: 100%; padding: calc(12px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 10px; }
  .panes, .pane { flex: 1; display: flex; flex-direction: column; gap: 10px; min-width: 0; }
  .actions { margin-top: auto; display: flex; flex-direction: column; gap: 8px; }
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
  .ghost { min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 14px var(--font); }
  .danger { color: #ff8a7a; }
  .error { color: var(--goal); }
</style>
