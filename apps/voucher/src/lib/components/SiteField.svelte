<script lang="ts">
  // Adds a site to a blocklist without a sheet, for the wide editor.
  import { domainOf, isDomain } from "../blocklists";
  let { onadd }: { onadd: (site: string) => void } = $props();
  let site = $state("");
  const domain = $derived(domainOf(site));
  const valid = $derived(isDomain(domain));
</script>

<form class="add" onsubmit={(e) => { e.preventDefault(); if (valid) { onadd(domain); site = ""; } }}>
  <input class="mono" placeholder="example.com" aria-label="Site to block" autocapitalize="off" autocomplete="off" spellcheck="false" bind:value={site} />
  <button class="btn primary" disabled={!valid}>Add {valid ? domain : ""}</button>
</form>

<style>
  .add { display: flex; gap: 8px; }
  input { flex: 1; min-width: 0; height: 44px; border-radius: 12px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 0 14px; font: 500 14px var(--mono); }
  input:focus { outline: none; border-color: var(--voucher); }
  /* A long domain is cut off rather than squeezing the field. */
  .btn { max-width: 50%; display: block; line-height: 42px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
</style>
