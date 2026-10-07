<script lang="ts">
  // The once-a-Day moments, shown on the next open: the Daily goal met, or a
  // Streak that ended yesterday. Each shows once per Day on this device.
  import { ledger } from "../api";
  import { remember, remembered } from "../storage";
  import { shiftDay } from "../time";
  import type { DaySummary, Today } from "../types";

  let { data }: { data: Today } = $props();

  type Moment = { kind: "goal" | "lost"; title: string; body: string; action: string };
  let moment = $state<Moment | null>(null);
  let checked = $state<string | null>(null);

  $effect(() => {
    const day = data.day;
    if (checked === `${day}:${data.goalDone >= data.goalTarget}`) return;
    checked = `${day}:${data.goalDone >= data.goalTarget}`;
    find(day);
  });

  async function find(day: string) {
    if (data.goalDone >= data.goalTarget && remembered(`goal-${day}`) !== "seen") {
      moment = { kind: "goal", title: `${data.streakDays} day streak`,
        body: `You met today's goal: ${data.goalDone} of ${data.goalTarget}. Everything you earn from here still goes in the Bank.`,
        action: "Keep going" };
      return;
    }
    if (remembered(`lost-${day}`) === "seen") return;
    try {
      // A Streak ended if yesterday missed its goal while the day before met it.
      const [yesterday, before] = await Promise.all([
        ledger<DaySummary>("GET", `/day?date=${shiftDay(day, -1)}`),
        ledger<DaySummary>("GET", `/day?date=${shiftDay(day, -2)}`),
      ]);
      if (!yesterday.goal_met && before.goal_met && before.streak > 0) {
        moment = { kind: "lost", title: `Streak ended at ${before.streak} ${before.streak === 1 ? "day" : "days"}`,
          body: `Yesterday you earned ${yesterday.earned} of ${yesterday.goal}. Your Bank is untouched, and today's goal starts a new streak.`,
          action: "Start again" };
      }
    } catch { /* no moment if the Ledger can't say */ }
  }

  function dismiss() {
    if (moment) remember(`${moment.kind}-${data.day}`, "seen");
    moment = null;
  }
</script>

{#if moment}
  <div class="scrim" role="presentation" onclick={dismiss}></div>
  <div class="sheet {moment.kind}" role="dialog" aria-modal="true" aria-labelledby="moment-title">
    <div class="tile">
      {#if moment.kind === "goal"}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
      {:else}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
      {/if}
    </div>
    <h2 id="moment-title">{moment.title}</h2>
    <p>{moment.body}</p>
    <button onclick={dismiss}>{moment.action}</button>
  </div>
{/if}

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .62); z-index: 20; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 21; max-width: 640px; margin: 0 auto; border-radius: 24px 24px 0 0; background: var(--surface); border-top: 1px solid var(--line); padding: 28px 24px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; }
  .tile { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--line); color: var(--ink); }
  .goal .tile { background: var(--goal-bg); color: var(--goal); border: 1px solid var(--goal-line); }
  h2 { margin: 0; font-size: 26px; font-weight: 700; }
  .goal h2 { color: var(--goal); }
  p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--muted); }
  button { min-height: 52px; border-radius: 14px; border: 0; font: 700 16px var(--font); background: var(--voucher); color: var(--voucher-ink); }
  .goal button { background: var(--goal); color: var(--ground); }
</style>
