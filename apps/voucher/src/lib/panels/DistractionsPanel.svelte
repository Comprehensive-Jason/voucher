<script lang="ts">
  // Rules, Distractions: the blocklists. Switching one on applies now;
  // switching one off waits for 06:00.
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED } from "../api";
  import Switch from "../components/Switch.svelte";
  import Tag from "../components/Tag.svelte";
  import ColorSheet from "../components/ColorSheet.svelte";
  import { summary } from "../blocklists";
  import { hhmm } from "../rules";
  import type { Status } from "../types";

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

  // A to Z; the Premade tag already says which ones Voucher filled in.
  const lists = $derived(status ? Object.entries(status.settings.blocklists).sort(([a, x], [b, y]) => (x.name || a).localeCompare(y.name || b)) : []);
  const waitingOff = (id: string) => status?.pending.some(([c]) => (c as any).BlocklistOn?.id === id && !(c as any).BlocklistOn.on);

  async function load() {
    try { status = await ledger<Status>("GET", "/status"); error = null; } catch (e) { error = String(e); }
  }
  async function toggle(id: string, on: boolean) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { BlocklistOn: { id, on } });
      note = effect === "Now" ? "Applied now." : `Switches off at ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { error = String(e); }
  }

  /** The blocklist whose colour is being picked. */
  let coloring = $state<string | null>(null);
  async function setColor(id: string, color: string | null) {
    coloring = null;
    if (!color) return;
    try { await ledger("POST", "/change", { BlocklistColor: { id, color } }); await load(); } catch (e) { error = String(e); }
  }

  onMount(() => {
    load();
    // Reload when a change is made anywhere on Rules.
    window.addEventListener(RULES_CHANGED, load);
    return () => window.removeEventListener(RULES_CHANGED, load);
  });

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
</script>

<div class="panel" class:headed={heading}>
  {#if heading}<div class="colhead"><span class="coltitle">Distractions</span><span class="colhint">{status ? Object.values(status.settings.blocklists).filter((l) => l.on).length : 0} blocklists on</span></div>{/if}
  <div class="body">
  {#if error}<p class="error">{error}</p>{/if}
  {#if status}
    {#if !heading}<div class="head"><span class="cap">Blocklists</span><span class="cap">{lists.filter(([, l]) => l.on).length} on</span></div>{/if}
    {#each lists as [id, list] (id)}
      <div class="row">
        <button class="dot" style="background: {list.color}" aria-label="{list.name} colour" onclick={() => (coloring = id)}></button>
        <a class="open" href="/rules/distractions/edit?id={id}" aria-label="Edit {list.name} blocklist">
          <span class="text">
            <span class="title"><span class="name">{list.name}</span><Tag premade={list.premade} /></span>
            <span class="sub" class:warn={waitingOff(id)}>{waitingOff(id) ? `Off at ${hhmm(status.settings.morning_boundary)}` : summary(list)}</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </a>
        <Switch on={list.on} label="{list.name} blocklist {list.on ? 'on' : 'off'}" onchange={(on) => toggle(id, on)} />
      </div>
    {/each}
    <a class="new" href="/rules/distractions/new">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>New blocklist
    </a>
    <div class="foot">Tap a blocklist to edit it. Switching one on applies now. Switching one off waits for {hhmm(status.settings.morning_boundary)}.</div>
    {#if note}<div class="foot">{note}</div>{/if}
  {/if}
  </div>
</div>

{#if coloring && status?.settings.blocklists[coloring]}
  {@const list = status.settings.blocklists[coloring]}
  <ColorSheet title="{list.name} colour" current={list.color} onpick={(c) => setColor(coloring!, c)} onclose={() => (coloring = null)} />
{/if}

<style>
  .panel { display: flex; flex-direction: column; gap: 10px; }
  .head { display: flex; justify-content: space-between; align-items: center; padding-top: 4px; }
  .row { border-radius: 14px; background: var(--surface); border: 1px solid var(--line); padding: 0 14px; display: flex; align-items: center; gap: 10px; }
  .open { flex: 1; min-width: 0; min-height: 64px; display: flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; }
  /* The colour dot opens the colour picker; its tap area is bigger than it looks. */
  .dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; border: 0; padding: 0; margin-right: 2px; cursor: pointer; box-shadow: 0 0 0 7px transparent; }
  .dot:focus-visible { outline: 2px solid var(--voucher); outline-offset: 3px; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .title { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 15px; font-weight: 700; }
  .sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.warn { color: var(--goal); }
  .new { min-height: 48px; border-radius: 14px; border: 2px dashed #3a3f45; color: var(--ink); font: 700 14px var(--font); display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; }
  .foot { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .error { color: var(--goal); }
  /* On the tablet the heading stays put and only what's under it scrolls,
     so it never moves or bounces with the list. */
  .body { display: contents; }
  .headed { height: 100%; min-height: 0; }
  .headed .colhead { flex: none; }
  .headed .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: inherit; overflow-y: auto; overscroll-behavior-y: contain; padding-bottom: 28px; scrollbar-width: none; }
  .headed .body::-webkit-scrollbar { display: none; }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
  .colhint { font-size: 12px; color: var(--muted); }
</style>
