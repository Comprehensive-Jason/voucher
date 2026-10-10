<script lang="ts">
  // Everything on the phone's Today screen: header, Bank, Voucher stack, status
  // card, and progress toward the next Voucher. On the tablet it is the first
  // column, with no header row: the mark sits on the Bank's line, and Rules
  // opens from the page bar's row (lib/Home.svelte).
  import Header from "../components/Header.svelte";
  import BankMeter from "../components/BankMeter.svelte";
  import VoucherStack from "../components/VoucherStack.svelte";
  import StatusCard from "../components/StatusCard.svelte";
  import NextVoucher from "../components/NextVoucher.svelte";
  import MarkerButton from "../components/MarkerButton.svelte";
  import MomentSheet from "../components/MomentSheet.svelte";
  import ReasonChips from "../components/ReasonChips.svelte";
  import type { Live } from "../live.svelte";
  import { wins } from "../celebrate.svelte";

  let { live, wide = false, onmarker }: {
    live: Live; wide?: boolean;
    /** The tablet's Marker button, beside the status card, was tapped. */
    onmarker?: () => void;
  } = $props();
</script>

{#if live.data}
  {@const data = live.data}
  {#if !wide}<Header night={live.mode === "curfew"} />{/if}
  <BankMeter brand={wide} mode={live.mode} bank={data.bank} limit={data.bankLimit} goalDone={data.goalDone} goalTarget={data.goalTarget} streakDays={data.streakDays} />
  <VoucherStack mode={live.mode} bank={Math.max(0, data.bank - wins.held)} unlockMinutes={data.unlockMinutes} room={data.curfewRoomMinutes} curfewStart={data.curfewStart} ontear={live.tear} />
  <ReasonChips tornAt={live.tornAt} />
  {#if wide}
    <div class="statusrow"><MarkerButton tall onclick={onmarker} /><StatusCard mode={live.mode} now={live.now} {data} /></div>
  {:else}
    <StatusCard mode={live.mode} now={live.now} {data} />
  {/if}
  <NextVoucher sources={data.sources} bank={data.bank} />
  <MomentSheet {data} />
{:else if live.error}
  <p class="error">{live.error}</p>
{/if}

<style>
  .statusrow { display: flex; gap: 12px; }
  .statusrow > :global(:last-child) { flex: 1; min-width: 0; }
  .error { color: var(--goal); }
</style>
