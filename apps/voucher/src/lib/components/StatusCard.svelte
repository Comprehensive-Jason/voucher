<script lang="ts">
  // The fixed-height card under the Voucher stack. Its height never changes between
  // states, so nothing below it moves (Jason's muscle-memory rule).
  import { styleOf } from "../sources";
  import type { Mode, Today } from "../types";

  let { mode, now, data }: { mode: Mode; now: number; data: Today } = $props();

  const left = $derived(data.unlockEndsAt ? Math.max(0, data.unlockEndsAt - now) : 0);
  const mmss = $derived(`${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`);
  const hm = (unix: number) => new Date(unix * 1000).toTimeString().slice(0, 5);
  // The bar drains from the start of this run of Vouchers to its end.
  const runFraction = $derived.by(() => {
    if (!data.unlockEndsAt) return 0;
    const start = data.unlockStartedAt ?? data.unlockEndsAt - data.unlockMinutes * 60;
    return Math.min(1, left / Math.max(1, data.unlockEndsAt - start));
  });
  // How far through tonight's Curfew we are.
  const curfewFraction = $derived.by(() => {
    const mins = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
    const d = new Date(now * 1000);
    const nowM = d.getHours() * 60 + d.getMinutes();
    const span = (mins(data.curfewEnd) - mins(data.curfewStart) + 1440) % 1440 || 1440;
    return Math.min(1, ((nowM - mins(data.curfewStart) + 1440) % 1440) / span);
  });
  const lost = $derived(data.log.filter((e) => e.kind === "earned" && !e.kept));
  const lastLost = $derived(lost.length ? new Date(lost[0].at).toTimeString().slice(0, 5) : null);
  // The source closest to its next Voucher, for the empty Bank.
  const closest = $derived.by(() => {
    const ticking = data.sources.filter((s) => s.on && s.kind !== "tasks" && s.progress > 0);
    if (!ticking.length) return null;
    const best = ticking.reduce((a, b) => (b.every - b.progress < a.every - a.progress ? b : a));
    return { name: styleOf(best.id).name, color: styleOf(best.id).color, remaining: best.every - best.progress,
      unit: best.kind === "workout" ? "zone minutes" : "minutes", fraction: best.progress / best.every };
  });
</script>

<div class="card {mode}">
  {#if mode === "running"}
    <div class="row"><span class="cap" style="color: var(--voucher)">Unlocked</span>
      <span class="mono small">{data.unlockVouchers ? `${data.unlockVouchers} ${data.unlockVouchers === 1 ? "Voucher" : "Vouchers"} · ` : ""}locks {data.unlockEndsAt ? hm(data.unlockEndsAt) : ""}</span></div>
    <div class="mono timer">{mmss}</div>
    <div class="bar"><i style="width: {runFraction * 100}%; background: var(--voucher)"></i></div>
  {:else if mode === "curfew"}
    <div class="row"><span class="cap" style="color: #9aa6ff">Curfew</span><span class="mono small">{data.curfewStart} to {data.curfewEnd}</span></div>
    <div class="line big">Sleep well. Open again at {data.curfewEnd}.</div>
    <div class="bar"><i style="width: {curfewFraction * 100}%; background: var(--night)"></i></div>
  {:else if mode === "full"}
    <div class="row"><span class="cap" style="color: var(--goal)">Bank full</span>
      <span class="mono small">{lastLost ? `${lost.length} lost at ${lastLost}` : `Curfew at ${data.curfewStart}`}</span></div>
    <div class="line">Anything you earn now is lost. A good moment for a break: tear one off.</div>
    <div class="bar"><i style="width: 100%; background: var(--goal)"></i></div>
  {:else if mode === "empty"}
    <div class="row"><span class="cap" style="color: var(--ink)">Bank empty</span><span class="mono small">Curfew at {data.curfewStart}</span></div>
    {#if closest}
      <div class="line">Closest Voucher: {closest.remaining} more {closest.unit} in {closest.name}.</div>
      <div class="bar"><i style="width: {closest.fraction * 100}%; background: {closest.color}"></i></div>
    {:else}
      <div class="line">Finish a task or put in some focused time to earn your next Voucher.</div>
      <div class="bar"><i style="width: 0%"></i></div>
    {/if}
  {:else}
    <div class="row"><span class="cap">Locked</span><span class="mono small">Curfew at {data.curfewStart}</span></div>
    <div class="line">Unlock distractions for {data.unlockMinutes} minutes.</div>
    <div class="bar"><i style="width: 0%"></i></div>
  {/if}
</div>

<style>
  .card { height: 104px; border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 14px 16px; display: flex; flex-direction: column; justify-content: space-between; transition: background-color var(--t-base), border-color var(--t-base); }
  .card.running { background: var(--unlocked-bg); border-color: var(--unlocked-line); }
  .card.curfew { background: var(--night-bg); border-color: var(--night-voucher); }
  .card.full { background: var(--goal-bg); border-color: var(--goal-line); }
  .row { display: flex; justify-content: space-between; align-items: center; }
  .small { font-size: 12px; color: var(--muted); }
  .timer { font-size: 38px; font-weight: 700; line-height: 1; }
  .line { font-size: 15px; line-height: 1.35; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; line-clamp: 2; -webkit-box-orient: vertical; }
  .line.big { font-size: 20px; font-weight: 700; }
</style>
