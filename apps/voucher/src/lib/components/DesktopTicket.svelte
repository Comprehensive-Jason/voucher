<script lang="ts">
  // The PC's ticket: a stepper and a button instead of a drag, as the canvas
  // draws it for the tray and the blocked window. Curfew and an empty Bank
  // replace it with a message of the same height.
  import type { Mode } from "../types";

  let { mode, bank, unlockMinutes, curfewEnd, ontear }: {
    mode: Mode; bank: number; unlockMinutes: number; curfewEnd: string; ontear: (count: number) => void;
  } = $props();

  let count = $state(1);
  const running = $derived(mode === "running");
  $effect(() => { if (count > Math.max(1, bank)) count = Math.max(1, bank); });
</script>

{#if mode === "curfew"}
  <div class="msg night"><b>Can't be torn tonight</b><span>Sleep well. Open again at {curfewEnd}.</span></div>
{:else if bank === 0}
  <div class="msg empty"><b>No tickets to tear</b><span>The next one you earn lands here</span></div>
{:else}
  <div class="ticket">
    <div class="cap">{running ? "Extend this Unlock" : "All distractions, this PC"}</div>
    <div class="row">
      <div class="stepper">
        <button class="step" aria-label="One ticket fewer" disabled={count <= 1} onclick={() => count--}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 12h12" /></svg>
        </button>
        <div class="mono count">{count}</div>
        <button class="step" aria-label="One ticket more" disabled={count >= bank} onclick={() => count++}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M12 6v12M6 12h12" /></svg>
        </button>
      </div>
      <div class="mono amount">{running ? "+" : ""}{count * unlockMinutes} min</div>
    </div>
    <button class="tear" onclick={() => { ontear(count); count = 1; }}>
      {running ? `Tear ${count} more` : `Tear ${count} ticket${count === 1 ? "" : "s"}`}
    </button>
  </div>
{/if}

<style>
  .ticket { height: 150px; border-radius: 14px; background: var(--voucher); color: var(--voucher-ink); padding: 14px; display: flex; flex-direction: column; justify-content: space-between; }
  .ticket .cap { color: var(--voucher-ink); }
  .row { display: flex; align-items: center; justify-content: space-between; }
  .stepper { display: flex; align-items: center; gap: 10px; }
  .step { width: 40px; height: 40px; padding: 0; border-radius: 12px; border: 2px solid rgba(7, 23, 13, .45); background: none; color: var(--voucher-ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .step:disabled { opacity: .35; cursor: default; }
  .count { font-size: 22px; font-weight: 700; min-width: 24px; text-align: center; }
  .amount { font-size: 30px; font-weight: 700; line-height: 1; }
  .tear { height: 44px; border: 0; border-radius: 12px; background: var(--voucher-ink); color: var(--voucher); font: 700 14px var(--font); cursor: pointer; }
  .msg { height: 150px; border-radius: 14px; padding: 14px; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 6px; text-align: center; }
  .msg b { font-size: 17px; }
  .msg span { font-size: 13px; }
  .night { background: var(--night-ticket); color: #e8ebff; }
  .night span { color: var(--night-ink); }
  .empty { border: 2px dashed #3a3f45; }
  .empty span { color: var(--muted); }
</style>
