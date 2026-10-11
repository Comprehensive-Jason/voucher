<script lang="ts">
  // Tasks not counting: a task service (Todoist, ClickUp) turned Voucher's
  // token down, or was never connected, so finished tasks aren't earning.
  // Among Rules' notices, after Protection. The text names every broken
  // service; one button ("Reconnect", or "Connect" when none was ever
  // connected) opens one token sheet with a field for each. It asks the
  // Ledger itself, again whenever Rules change and on Today's poll, starting
  // from the last answer so it doesn't pop in.
  import { onMount } from "svelte";
  import { sheet } from "$lib/sheet.svelte";
  import { ledger, RULES_CHANGED, sameAnswer, statusNow } from "../api";
  import { needsToken, serviceOf } from "../sources";
  import { andList, tokenAction, tokenPending, type TokenNeed } from "../tokens.svelte";
  import { POLL_MS } from "../live.svelte";
  import { reveal } from "../motion";
  import type { Status } from "../types";
  import TokenSheet from "./TokenSheet.svelte";

  let { axis = "y" }: { axis?: "x" | "y" } = $props();

  let status = $state<Status | null>(statusNow());
  let now = $state(Date.now());
  /** The services the open token sheet asks for, as they were when it opened. */
  let reconnecting = $state<TokenNeed[] | null>(null);

  /** Task services, in Tasks sources that are on, that need a new token. */
  const broken = $derived.by(() => {
    if (!status) return [];
    const out: { service: string; problem: string }[] = [];
    for (const s of Object.values(status.settings.sources)) {
      if (s.kind !== "tasks" || !s.on) continue;
      for (const p of s.packages) {
        const problem = status.source_errors[p];
        if (needsToken(problem) && !out.some((b) => b.service === p)) out.push({ service: p, problem: problem! });
      }
    }
    return out;
  });
  // A token saved here waits for the Ledger's next check (lib/tokens.svelte.ts).
  const waiting = $derived(broken.filter((b) => tokenPending(b.service, now)));
  const asking = $derived(broken.filter((b) => !waiting.includes(b)));

  /** Service names for reading: "Todoist", "Todoist and ClickUp", "A, B, and C". */
  const names = (list: { service: string }[]) => andList(list.map((b) => serviceOf(b.service).name));
  /** What's wrong, naming every service: "Todoist's and ClickUp's tokens were
   *  turned down", "ClickUp isn't connected", or both kinds joined. */
  const text = $derived.by(() => {
    const down = asking.filter((b) => b.problem !== "not connected");
    const unconnected = asking.filter((b) => b.problem === "not connected");
    const parts: string[] = [];
    if (down.length) parts.push(`${andList(down.map((b) => `${serviceOf(b.service).name}'s`))} ${down.length > 1 ? "tokens were" : "token was"} turned down`);
    if (unconnected.length) parts.push(`${names(unconnected)} ${unconnected.length > 1 ? "aren't" : "isn't"} connected`);
    return `${parts.join(" and ")}, so finished tasks aren't earning.`;
  });

  async function load() {
    now = Date.now();
    try { const s = await ledger<Status>("GET", "/status"); if (!sameAnswer(s, status)) status = s; } catch { /* the Ledger notice says so */ }
  }

  /** The sheet notes each saved token itself; it closes once all filled ones saved. */
  function onsaved(_saved: string[], done: boolean) {
    if (done) reconnecting = null;
    now = Date.now();
    // Sources shows the token's state too.
    window.dispatchEvent(new Event(RULES_CHANGED));
  }

  onMount(() => {
    // Fresh answers once a page sliding in has landed (lib/sheet.svelte.ts).
    const cancel = sheet.afterSlide(load);
    const poll = setInterval(load, POLL_MS);
    window.addEventListener(RULES_CHANGED, load);
    return () => { cancel(); clearInterval(poll); window.removeEventListener(RULES_CHANGED, load); };
  });
</script>

{#if asking.length}
  <div class="notice" transition:reveal={{ axis }}>
    <div class="ntext">
      <span class="cap">Tasks not counting</span>
      <span>{text}</span>
    </div>
    <button class="btn small fix" aria-label="{tokenAction(asking)} {names(asking)}" onclick={() => (reconnecting = asking.map((b) => ({ ...b })))}>{tokenAction(asking)}</button>
  </div>
{:else if waiting.length}
  <div class="notice good" transition:reveal={{ axis }}>
    <div class="ntext">
      <span class="cap">Token saved</span>
      <span>{names(waiting)} {waiting.length > 1 ? "count" : "counts"} again from the Ledger's next check, within 5 minutes.</span>
    </div>
  </div>
{/if}

{#if reconnecting}
  <TokenSheet services={reconnecting} onclose={() => (reconnecting = null)} {onsaved} />
{/if}
