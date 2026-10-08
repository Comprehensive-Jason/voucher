<script lang="ts">
  // The PC's blocked window: "Steam is paused" after the guard closed a
  // program, or "youtube.com is paused" over a browser's blocked page.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { device } from "$lib/api";
  import { Live } from "$lib/live.svelte";
  import VoucherStack from "$lib/components/VoucherStack.svelte";

  const label = $derived(page.url.searchParams.get("label") ?? "This program");
  const path = $derived(page.url.searchParams.get("path") ?? "");
  const site = $derived(page.url.searchParams.get("site") === "1");
  const live = new Live();
  onMount(() => live.start());

  async function onTear(count: number) {
    await live.tear(count);
    if (live.error) return;
    // A program comes back once the guard stops closing it; a site needs only a reload.
    if (!site && path) await device("openApp", { pkg: path });
    await device("goHome", { closed: false });
  }
</script>

<main>
  <svg width="44" height="44" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" fill={live.mode === "curfew" ? "#9aa6ff" : "var(--voucher)"} /><path d="M8.2 7.6l3.8 6.8 3.8-6.8" fill="none" stroke="var(--voucher-ink)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
  <h1>{label} is paused</h1>
  {#if live.data}
    {@const d = live.data}
    <p>{live.mode === "curfew"
      ? `It's Curfew. ${label} and everything else open again at ${d.curfewEnd}.`
      : d.bank === 0
        ? `The Bank is empty. Earn a Voucher to open it, or close ${site ? "this tab" : "it"} and keep going.`
        : `Tear a Voucher to open every Distraction for ${d.unlockMinutes} minutes, or close ${site ? "this tab" : "it"} and keep going.`}</p>
    <div class="bankline"><span>{d.bank} of {d.bankLimit} in the Bank</span><span>Curfew at {d.curfewStart}</span></div>
    <div class="voucher"><VoucherStack mode={live.mode} bank={d.bank} unlockMinutes={d.unlockMinutes} room={d.curfewRoomMinutes} curfewStart={d.curfewStart} ontear={onTear} /></div>
  {/if}
  {#if live.error}<p class="error">{live.error}</p>{/if}
  <button class="close" onclick={() => device("goHome", { closed: true, closeTab: site })}>{site ? "Close this tab" : `Close ${label}`}</button>
</main>

<style>
  main { min-height: 100vh; padding: 28px 30px 24px; display: flex; flex-direction: column; align-items: center; gap: 12px; text-align: center; }
  h1 { margin: 0; font-size: 24px; font-weight: 700; line-height: 1.15; }
  p { margin: 0; font-size: 14px; color: var(--muted); line-height: 1.4; }
  .bankline { width: 100%; display: flex; justify-content: space-between; font-size: 13px; color: var(--muted); }
  .voucher { width: 100%; text-align: left; }
  .close { min-height: 44px; width: 100%; border-radius: 12px; border: 1px solid #3a3f45; background: var(--surface); color: var(--ink); font: 700 14px var(--font); cursor: pointer; }
  .error { color: var(--goal); }
</style>
