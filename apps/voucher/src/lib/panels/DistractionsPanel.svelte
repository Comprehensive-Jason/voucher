<script lang="ts">
  // Rules, Distractions: the blocklists. Switching one on applies now;
  // switching one off waits for 06:00.
  import { shownByNotice } from "../health.svelte";
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED, sameAnswer, statusNow } from "../api";
  import Switch from "../components/Switch.svelte";
  import RulesColumn from "../components/RulesColumn.svelte";
  import RulesCard from "../components/RulesCard.svelte";
  import Tag from "../components/Tag.svelte";
  import ColorSheet from "../components/ColorSheet.svelte";
  import { summary } from "../blocklists";
  import { hhmm } from "../rules";
  import type { Status } from "../types";

  let status = $state<Status | null>(statusNow());
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

  // A to Z; the Premade tag already says which ones Voucher filled in.
  const lists = $derived(status ? Object.entries(status.settings.blocklists).sort(([a, x], [b, y]) => (x.name || a).localeCompare(y.name || b)) : []);
  const waitingOff = (id: string) => status?.pending.some(([c]) => (c as any).BlocklistOn?.id === id && !(c as any).BlocklistOn.on);

  async function load() {
    try { { const s = await ledger<Status>("GET", "/status"); if (!sameAnswer(s, status)) status = s; } error = null; } catch (e) { error = String(e); }
  }
  async function toggle(id: string, on: boolean) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { BlocklistOn: { id, on } });
      note = effect === "Now" ? "Applied now." : `Switches off at ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { error = String(e); }
  }

  /** The blocklist whose color is being picked. */
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

<RulesColumn title="Distractions" label="Blocklists" count={status ? `${lists.filter(([, l]) => l.on).length} on` : undefined} column={heading}>
  {#if error && !shownByNotice(error)}<p class="error">{error}</p>{/if}
  {#if status}
    {#each lists as [id, list] (id)}
      <RulesCard row>
        <button class="dot" style="background: {list.color}" aria-label="{list.name} color" onclick={() => (coloring = id)}></button>
        <a class="open" href="/rules/distractions/edit?id={id}" aria-label="Edit {list.name} blocklist">
          <span class="text">
            <span class="title"><span class="name">{list.name}</span><Tag premade={list.premade} /></span>
            <span class="sub" class:warn={waitingOff(id)}>{waitingOff(id) ? `Off at ${hhmm(status.settings.morning_boundary)}` : summary(list)}</span>
          </span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
        </a>
        <Switch on={list.on} label="{list.name} blocklist {list.on ? 'on' : 'off'}" onchange={(on) => toggle(id, on)} />
      </RulesCard>
    {/each}
    <a class="btn wide" href="/rules/distractions/new">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>New blocklist
    </a>
    <div class="footnote">Switching on: now. Off: at {hhmm(status.settings.morning_boundary)}.</div>
    {#if note}<div class="footnote">{note}</div>{/if}
  {/if}
</RulesColumn>

{#if coloring && status?.settings.blocklists[coloring]}
  {@const list = status.settings.blocklists[coloring]}
  <ColorSheet title="{list.name} color" current={list.color} onpick={(c) => setColor(coloring!, c)} onclose={() => (coloring = null)} />
{/if}

<style>
  .open { flex: 1; min-width: 0; min-height: 40px; display: flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; }
  /* The color dot opens the color picker; its tap area is bigger than it looks. */
  .dot { width: 14px; height: 14px; border-radius: 50%; flex-shrink: 0; border: 0; padding: 0; cursor: pointer; box-shadow: 0 0 0 7px transparent; }
  .dot:focus-visible { outline: 2px solid var(--voucher); outline-offset: 3px; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 4px; }
  .title { display: flex; align-items: center; gap: 8px; }
  .name { font-size: 15px; font-weight: 700; }
  .sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.warn { color: var(--goal); }
  /* The shared .btn, as a link. */
  a.btn { text-decoration: none; }
  .footnote { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .error { margin: 0; color: var(--danger); }
</style>
