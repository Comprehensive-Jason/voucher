<script lang="ts">
  // Paste API tokens for task services (Todoist, ClickUp, and any other).
  // One field per service that needs one, each with its name, what's wrong,
  // and where its token is found. Save sends every filled field to the Ledger,
  // which uses each from its next check; empty fields are left alone, and a
  // token the Ledger turns down shows its error under its own field. Opened
  // with one service, it's the same sheet with one field.
  import { shownByNotice } from "../health.svelte";
  import { ledger } from "../api";
  import { serviceOf } from "../sources";
  import { andList, noteTokenSaved, tokenAction, type TokenNeed } from "../tokens.svelte";
  import Sheet from "./Sheet.svelte";

  let { services, source, onclose, onsaved }: {
    /** The services to ask for, in order. */
    services?: TokenNeed[];
    /** Or just one, to connect it (Setup). */
    source?: string;
    onclose: () => void;
    /** After a save: the services saved, and whether every filled field was
     *  (the sheet stays open to show the ones turned down). */
    onsaved: (saved: string[], done: boolean) => void;
  } = $props();

  const needs = $derived(services ?? (source ? [{ service: source }] : []));
  let tokens = $state<Record<string, string>>({});
  let errors = $state<Record<string, string | null>>({});
  /** Services saved while the sheet was open, shown as done instead of a field. */
  let saved = $state<string[]>([]);
  let saving = $state(false);

  const open = $derived(needs.filter((n) => !saved.includes(n.service)));
  const filled = $derived(open.filter((n) => tokens[n.service]?.trim()));
  const heading = $derived(`${tokenAction(needs)} ${andList(needs.map((n) => serviceOf(n.service).name))}`);
  const id = `token-sheet-${Math.random().toString(36).slice(2)}`;

  async function save() {
    if (!filled.length || saving) return;
    saving = true;
    const batch = filled.map((n) => n.service);
    const results = await Promise.allSettled(batch.map((service) => ledger("POST", "/token", { source: service, token: tokens[service].trim() })));
    const ok: string[] = [];
    results.forEach((r, i) => {
      const service = batch[i];
      if (r.status === "fulfilled") {
        ok.push(service);
        noteTokenSaved(service);
        tokens[service] = "";
        errors[service] = null;
      } else errors[service] = String(r.reason).replace(/^Error: /, "");
    });
    saved = [...saved, ...ok];
    saving = false;
    if (ok.length) onsaved(ok, ok.length === batch.length);
  }
</script>

<Sheet {onclose} label={id}>
  <h2 {id}>{heading}</h2>
  <p class="body">{needs.length > 1 ? "Paste a token for each, or only some: empty fields are left as they are. Tokens go" : "Paste its API token. It goes"} straight to your Ledger and {needs.length > 1 ? "are" : "is"} never shown again.</p>
  <form class="list" onsubmit={(e) => { e.preventDefault(); save(); }}>
    {#each needs as n (n.service)}
      {@const style = serviceOf(n.service)}
      {@const error = errors[n.service]}
      <label class="field">
        <span class="head">
          <span class="name">{style.name}</span>
          {#if saved.includes(n.service)}<span class="state good">token saved</span>
          {:else if n.problem}<span class="state">{n.problem}</span>{/if}
        </span>
        {#if saved.includes(n.service)}
          <span class="hint">It counts again from the Ledger's next check, within 5 minutes.</span>
        {:else}
          <span class="hint">{style.tokenHelp ?? `An API token: in ${style.name}'s settings.`}</span>
          <input class="mono" type="password" autocomplete="off" placeholder="{style.name} API token" aria-invalid={!!error}
            bind:value={tokens[n.service]} oninput={() => (errors[n.service] = null)} />
          {#if error && !shownByNotice(error)}<span class="error">{error}</span>{/if}
        {/if}
      </label>
    {/each}
    {#if open.length}
      <button class="btn primary save" type="submit" disabled={!filled.length || saving}>{filled.length > 1 ? `Save ${filled.length} tokens` : "Save token"}</button>
    {/if}
  </form>
</Sheet>

<style>
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  .list { display: flex; flex-direction: column; gap: 14px; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .head { display: flex; align-items: baseline; gap: 8px; }
  .name { font-size: 15px; font-weight: 700; }
  .state { font-size: 12px; color: var(--goal); }
  .state.good { color: var(--voucher); }
  .hint { font-size: 12px; color: var(--muted); line-height: 1.4; }
  input { height: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--ground); color: var(--ink); padding: 0 14px; font-size: 14px; }
  input:focus { outline: none; border-color: var(--voucher); }
  input[aria-invalid="true"] { border-color: var(--danger); }
  .error { font-size: 13px; color: var(--danger-text); line-height: 1.4; }
  .save { height: 52px; font-size: 16px; }
</style>
