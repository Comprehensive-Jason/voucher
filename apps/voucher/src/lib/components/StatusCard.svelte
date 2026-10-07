<script lang="ts">
  // The fixed-height card under the ticket. Its height never changes between
  // states, so nothing below it moves (Jason's muscle-memory rule).
  import type { Mode } from "../types";
  let { mode, now, unlockEndsAt, curfewStart, curfewEnd }: {
    mode: Mode; now: number; unlockEndsAt: number | null; curfewStart: string; curfewEnd: string;
  } = $props();

  const left = $derived(unlockEndsAt ? Math.max(0, unlockEndsAt - now) : 0);
  const mmss = $derived(`${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`);
  const locksAt = $derived(unlockEndsAt ? new Date(unlockEndsAt * 1000).toTimeString().slice(0, 5) : "");
</script>

<div class="card {mode}">
  {#if mode === "running"}
    <div class="row"><span class="cap" style="color: var(--voucher)">Unlocked</span><span class="mono small">locks {locksAt}</span></div>
    <div class="mono timer">{mmss}</div>
    <div class="bar"><i style="width: {Math.min(100, (left / 600) * 100)}%; background: var(--voucher)"></i></div>
  {:else if mode === "curfew"}
    <div class="row"><span class="cap" style="color: var(--night)">Curfew</span><span class="mono small">{curfewStart} to {curfewEnd}</span></div>
    <div class="line big">Sleep well. Open again at {curfewEnd}.</div>
    <div class="bar"><i style="width: 0%; background: var(--night)"></i></div>
  {:else if mode === "full"}
    <div class="row"><span class="cap" style="color: var(--goal)">Bank full</span><span class="mono small">Curfew at {curfewStart}</span></div>
    <div class="line">Anything you earn now is lost. A good moment for a break: tear one off.</div>
    <div class="bar"><i style="width: 100%; background: var(--goal)"></i></div>
  {:else if mode === "empty"}
    <div class="row"><span class="cap">Bank empty</span><span class="mono small">Curfew at {curfewStart}</span></div>
    <div class="line">Finish a task or put in some focused time to earn your next Voucher.</div>
    <div class="bar"><i style="width: 0%"></i></div>
  {:else}
    <div class="row"><span class="cap">Locked</span><span class="mono small">Curfew at {curfewStart}</span></div>
    <div class="line">Tear a ticket for social media and your games.</div>
    <div class="bar"><i style="width: 0%"></i></div>
  {/if}
</div>

<style>
  .card { height: 104px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; }
  .card.running { background: var(--unlocked-bg); border-color: var(--unlocked-line); }
  .card.curfew { background: var(--night-bg); border-color: var(--night-ticket); }
  .card.full { background: var(--goal-bg); border-color: var(--goal-line); }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .small { font-size: 12px; color: var(--muted); }
  .timer { font-size: 38px; font-weight: 700; line-height: 1; }
  .line { font-size: 15px; line-height: 1.35; }
  .line.big { font-size: 20px; font-weight: 700; }
</style>
