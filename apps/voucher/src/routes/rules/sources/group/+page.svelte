<script lang="ts">
  // One source group: its name and what it counts. With no `id` it makes a
  // new group, sent to the Ledger on Save. Taking an app out, renaming, or
  // deleting applies now; a new group, or a new app in one, waits for 06:00.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { goto } from "$app/navigation";
  import { ledger } from "$lib/api";
  import EntryList from "$lib/components/EntryList.svelte";
  import AddEntrySheets from "$lib/components/AddEntrySheets.svelte";
  import { SPARE, styleOf } from "$lib/sources";
  import { hhmm, until } from "$lib/rules";
  import type { Source, Status } from "$lib/types";

  const id = page.url.searchParams.get("id");
  let status = $state<Status | null>(null);
  let name = $state("");
  let adding = $state(false);
  let confirming = $state(false);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);
  /** A new group's apps, before Save. */
  let draft = $state<{ package: string; label: string }[]>([]);

  const group = $derived<Source | null>(id ? status?.settings.sources[id] ?? null : null);
  const morning = $derived(status ? hhmm(status.settings.morning_boundary) : "06:00");
  /** The members this group will have once its waiting changes apply. */
  const queued = $derived.by(() => {
    const hit = [...(status?.pending ?? [])].reverse().find(([c]) => (c as any).SourceApps?.id === id);
    return hit ? { packages: (hit[0] as any).SourceApps.packages as string[], labels: (hit[0] as any).SourceApps.labels ?? {}, at: hit[1] } : null;
  });
  const members = $derived(group ? [...new Set([...group.packages, ...(queued?.packages ?? [])])] : []);
  const labelOf = (p: string) => group?.labels?.[p] ?? queued?.labels[p] ?? p.replace(/^win:/, "");
  /** Apps other groups count, which can't join this one. */
  const taken = $derived.by(() => {
    const out: Record<string, string> = {};
    for (const [other, s] of Object.entries(status?.settings.sources ?? {})) {
      if (other !== id) for (const p of s.packages) out[p] = s.name || styleOf(other).name;
    }
    return out;
  });

  async function load() {
    try {
      status = await ledger<Status>("GET", "/status");
      if (id) name = status.settings.sources[id]?.name ?? "";
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
    if (id && group && name.trim() && name.trim() !== group.name) send({ RenameSource: { id, name: name.trim() } });
  }
  /** Sends the whole member list, with names for each. */
  function setMembers(packages: string[], extra: Record<string, string> = {}) {
    const labels = Object.fromEntries(packages.map((p) => [p, extra[p] ?? labelOf(p)]));
    send({ SourceApps: { id, packages, labels } });
  }

  // A new group's id comes from its name; a clash gets a number.
  const newId = $derived(name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""));
  async function save() {
    if (!status || !newId || !draft.length) return;
    const ids = new Set(Object.keys(status.settings.sources));
    let key = newId, n = 2;
    while (ids.has(key)) key = `${newId}-${n++}`;
    // The first spare colour no source is drawn in yet.
    const used = new Set(Object.keys(status.settings.sources).map((s) => styleOf(s).color.toLowerCase()));
    const color = SPARE.find((c) => !used.has(c.toLowerCase())) ?? SPARE[ids.size % SPARE.length];
    const source: Source = { name: name.trim(), kind: "focus", on: true, every: 30, color,
      packages: draft.map((a) => a.package), labels: Object.fromEntries(draft.map((a) => [a.package, a.label])) };
    try {
      await ledger("POST", "/change", { AddSource: { id: key, source } });
      goto("/rules/sources");
    } catch (e) { error = String(e); }
  }

  const back = () => goto("/rules/sources");
  onMount(load);
</script>

<main>
  <header>
    <button class="back" aria-label="Back to sources" onclick={back}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>{id ? "Edit source" : "New source"}</h1>
    {#if group}<span class="dot" style="background: {styleOf(id!).color}"></span>{/if}
  </header>
  {#if error}<p class="error">{error}</p>{/if}

  {#if !id}
    <label class="field">
      <span class="cap">Name</span>
      <!-- svelte-ignore a11y_autofocus -->
      <input placeholder="For example: Chinese" bind:value={name} autofocus />
    </label>
    <EntryList title="Apps" empty="Time in any of these apps counts toward one Voucher" switches={false} onadd={() => (adding = true)}
      rows={draft.map((a) => ({ key: a.package, name: a.label, note: a.package, on: true, added: true }))}
      onremove={(key) => (draft = draft.filter((a) => a.package !== key))} />
    <div class="foot">Time in these apps adds up toward one Voucher per 30 minutes. A new source starts counting at {morning}.</div>
    <button class="primary" disabled={!newId || !draft.length} onclick={save}>Save source</button>

  {:else if group}
    <label class="field">
      <span class="cap">Name</span>
      <input bind:value={name} onblur={rename} onkeydown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()} />
    </label>

    {#if group.kind === "focus"}
      <EntryList title="Apps" empty="No apps: this source counts nothing" switches={false} onadd={() => (adding = true)}
        rows={members.map((p) => ({ key: p, name: labelOf(p), note: p.startsWith("win:") ? "Windows" : p, on: true, added: true,
          waiting: group.packages.includes(p) ? null : `Counts from ${morning}, ${until(queued!.at)}` }))}
        onremove={(key) => setMembers(members.filter((p) => p !== key))} />
      <div class="foot">Time in these apps adds up toward one Voucher. Taking an app out applies now; adding one waits for {morning}.</div>
    {:else if group.kind === "tasks"}
      <EntryList title="Services" empty="No services"
        rows={["todoist", "clickup"].map((p) => ({ key: p, name: p === "todoist" ? "Todoist" : "ClickUp", note: null, on: members.includes(p), added: false,
          waiting: !group.packages.includes(p) && members.includes(p) ? `Counts from ${morning}` : null }))}
        ontoggle={(key, on) => setMembers(on ? [...members, key] : members.filter((p) => p !== key), { todoist: "Todoist", clickup: "ClickUp" })} />
      <div class="foot">Finished tasks from these services add up toward one Voucher. Switching one off applies now; on waits for {morning}.</div>
    {:else}
      <div class="foot">{group.kind === "workout" ? "Heart rate zone minutes" : "Steps"} from Health Connect, reported by your phone.</div>
    {/if}
    {#if note}<div class="foot">{note}</div>{/if}

    {#if group.kind === "focus"}
      {#if confirming}
        <button class="ghost danger" onclick={async () => { await send({ DeleteSource: id }); back(); }}>Delete {group.name} now</button>
        <div class="foot">Deleting applies at once. Adding it back later waits for {morning}.</div>
      {:else}
        <button class="ghost danger" onclick={() => (confirming = true)}>Delete source</button>
      {/if}
    {/if}
  {/if}
</main>

<AddEntrySheets mode={adding ? "app" : null} games={false} {taken} onclose={() => (adding = false)}
  onapp={(a) => {
    adding = false;
    if (!id) { if (!draft.some((x) => x.package === a.package)) draft = [...draft, a]; }
    else if (!members.includes(a.package)) setMembers([...members, a.package], { [a.package]: a.label });
  }} />

<style>
  main { min-height: 100%; padding: calc(12px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 10px; }
  header { display: flex; align-items: center; gap: 4px; margin-left: -12px; }
  .back { width: 44px; height: 44px; padding: 0; background: none; border: 0; color: var(--ink); display: flex; align-items: center; justify-content: center; }
  h1 { flex: 1; margin: 0; font-size: 22px; font-weight: 700; }
  .dot { width: 14px; height: 14px; border-radius: 4px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  input { height: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 0 14px; font: 700 15px var(--font); }
  input:focus { outline: none; border-color: var(--voucher); }
  .foot { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .primary { margin-top: auto; min-height: 48px; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 15px var(--font); }
  .primary:disabled { background: var(--line); color: var(--muted); }
  .ghost { min-height: 44px; border-radius: 14px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 14px var(--font); }
  .danger { color: #ff8a7a; }
  .error { color: var(--goal); }
</style>
