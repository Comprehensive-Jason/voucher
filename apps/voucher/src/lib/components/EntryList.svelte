<script lang="ts">
  // One section of a blocklist: its apps or its sites, each with a switch, and
  // a remove button for entries the user added.
  import Switch from "./Switch.svelte";

  type Row = { key: string; name: string; note: string | null; on: boolean; added: boolean; waiting?: string | null };
  let { title, rows, empty, onadd, ontoggle, onremove }: {
    title: string; rows: Row[]; empty: string;
    onadd: () => void; ontoggle: (key: string, on: boolean) => void; onremove?: (key: string) => void;
  } = $props();
</script>

<div class="section">
  <div class="head">
    <span class="cap">{title} · {rows.length}</span>
    <button class="add" aria-label="Add to {title}" onclick={onadd}>
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>Add
    </button>
  </div>
  {#if rows.length}
    <div class="card">
      {#each rows as r, i (r.key)}
        <div class="row" class:first={i === 0}>
          <span class="text">
            <span class="name">{r.name}</span>
            {#if r.waiting}<span class="sub warn">{r.waiting}</span>{:else if r.note}<span class="sub">{r.note}</span>{/if}
          </span>
          {#if r.added && onremove}
            <button class="remove" aria-label="Remove {r.name}" onclick={() => onremove?.(r.key)}>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          {/if}
          <Switch on={r.on} label={r.name} onchange={(on) => ontoggle(r.key, on)} />
        </div>
      {/each}
    </div>
  {:else}
    <div class="empty">{empty}</div>
  {/if}
</div>

<style>
  .section { display: flex; flex-direction: column; gap: 4px; }
  .head { display: flex; align-items: center; justify-content: space-between; height: 32px; }
  .add { height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 12px var(--font); display: flex; align-items: center; gap: 6px; }
  .card { border-radius: 14px; background: var(--surface); border: 1px solid var(--line); padding: 0 14px; }
  .row { display: flex; align-items: center; gap: 10px; min-height: 52px; border-top: 1px solid var(--divider); }
  .row.first { border-top: 0; }
  .text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 14px; font-weight: 500; }
  .sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.warn { color: var(--goal); }
  .remove { width: 36px; height: 36px; border: 0; background: none; color: var(--muted); display: flex; align-items: center; justify-content: center; }
  .empty { border-radius: 14px; border: 2px dashed #3a3f45; min-height: 72px; display: flex; align-items: center; justify-content: center; font-size: 13px; color: var(--muted); }
</style>
