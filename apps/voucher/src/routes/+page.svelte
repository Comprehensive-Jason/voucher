<script lang="ts">
  import { onMount } from "svelte";
  import { today, tear } from "$lib/api";
  import { modeOf, type Today } from "$lib/types";
  import Header from "$lib/components/Header.svelte";
  import BankMeter from "$lib/components/BankMeter.svelte";
  import TicketStack from "$lib/components/TicketStack.svelte";
  import StatusCard from "$lib/components/StatusCard.svelte";
  import NextVoucher from "$lib/components/NextVoucher.svelte";

  let data = $state<Today | null>(null);
  let error = $state<string | null>(null);
  let now = $state(Math.floor(Date.now() / 1000));
  const mode = $derived(data ? modeOf(data, now) : "locked");

  async function refresh() {
    try { data = await today(); error = null; } catch (e) { error = String(e); }
  }
  async function onTear(count: number) {
    try { data = await tear(count); error = null; } catch (e) { error = String(e); }
  }

  onMount(() => {
    refresh();
    // Tick the countdown every second; ask the Ledger again every 30 s and when an Unlock ends.
    const tick = setInterval(() => {
      now = Math.floor(Date.now() / 1000);
      if (data?.unlockEndsAt && now === data.unlockEndsAt) refresh();
    }, 1000);
    const poll = setInterval(refresh, 30_000);
    return () => { clearInterval(tick); clearInterval(poll); };
  });
</script>

<main>
    {#if data}
      <Header streakDays={data.streakDays} />
      <BankMeter {mode} bank={data.bank} limit={data.bankLimit} goalDone={data.goalDone} goalTarget={data.goalTarget} />
      <TicketStack {mode} bank={data.bank} unlockMinutes={data.unlockMinutes} ontear={onTear} />
      <StatusCard {mode} {now} unlockEndsAt={data.unlockEndsAt} curfewStart={data.curfewStart} curfewEnd={data.curfewEnd} />
      <NextVoucher sources={data.sources} />
    {:else if error}
      <p class="error">{error}</p>
    {/if}
</main>

<style>
  main { flex: 1; padding: calc(24px + env(safe-area-inset-top)) 20px 12px; display: flex; flex-direction: column; gap: 18px; }
  .error { color: var(--goal); }
</style>
