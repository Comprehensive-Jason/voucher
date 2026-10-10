<script lang="ts">
  // Adds a site to a blocklist or source group without a sheet, for the wide
  // editors. Its heading lines the field up with the Name field in the pane
  // beside it. A site another source group counts can't be added to a group.
  import { domainOf, isDomain } from "../blocklists";
  let { onadd, taken = {} }: {
    onadd: (site: string) => void;
    /** Sites (`site:<domain>`) that can't be added, with the name of what already has them. */
    taken?: Record<string, string>;
  } = $props();
  let site = $state("");
  const domain = $derived(domainOf(site));
  const owner = $derived(taken[`site:${domain}`]);
  const valid = $derived(isDomain(domain) && !owner);
</script>

<form class="field" onsubmit={(e) => { e.preventDefault(); if (valid) { onadd(domain); site = ""; } }}>
  <span class="cap">Add sites</span>
  <span class="add">
    <input class="mono" placeholder="example.com" aria-label="Site to add" autocapitalize="off" autocomplete="off" spellcheck="false" bind:value={site} />
    <button class="btn primary" disabled={!valid}>{owner ? `Already in ${owner}` : `Add ${valid ? domain : ""}`}</button>
  </span>
</form>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  .add { display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 0 14px; font: 500 14px var(--mono); }
  input:focus { outline: none; border-color: var(--voucher); }
  /* A long domain is cut off rather than squeezing the field. */
  .btn { max-width: 50%; display: block; line-height: 42px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
