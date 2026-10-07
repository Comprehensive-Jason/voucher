<script lang="ts">
  // Everything on the phone's Today screen: header, Bank, ticket stack, status
  // card, and progress toward the next Voucher. On the tablet it is the first
  // column, and its header carries the Rules button instead of a tab bar.
  import Header from "../components/Header.svelte";
  import BankMeter from "../components/BankMeter.svelte";
  import TicketStack from "../components/TicketStack.svelte";
  import StatusCard from "../components/StatusCard.svelte";
  import NextVoucher from "../components/NextVoucher.svelte";
  import type { Live } from "../live.svelte";

  let { live, wide = false }: { live: Live; wide?: boolean } = $props();
</script>

{#if live.data}
  {@const data = live.data}
  <Header streakDays={data.streakDays} night={live.mode === "curfew"} rules={wide} />
  <BankMeter mode={live.mode} bank={data.bank} limit={data.bankLimit} goalDone={data.goalDone} goalTarget={data.goalTarget} />
  <TicketStack mode={live.mode} bank={data.bank} unlockMinutes={data.unlockMinutes} ontear={live.tear} />
  <StatusCard mode={live.mode} now={live.now} {data} />
  <NextVoucher sources={data.sources} />
{:else if live.error}
  <p class="error">{live.error}</p>
{/if}

<style>
  .error { color: var(--goal); }
</style>
