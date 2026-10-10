<script lang="ts">
  // The once-a-Day moments, shown on the next open: the Daily goal met, or a
  // Streak that ended yesterday. Each shows once per Day on this device.
  import { ledger } from "../api";
  import Flame from "./Flame.svelte";
  import Sheet from "./Sheet.svelte";
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
      moment = { kind: "goal", title: `${data.streakDays} Day streak`,
        body: `You met today's Daily goal: ${data.goalDone} of ${data.goalTarget}. Everything you earn from here still goes in the Bank.`,
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
        moment = { kind: "lost", title: `Streak ended at ${before.streak} ${before.streak === 1 ? "Day" : "Days"}`,
          body: `Yesterday you earned ${yesterday.earned} of ${yesterday.goal}. Your Bank is untouched, and today's Daily goal starts a new streak.`,
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
  <Sheet onclose={dismiss} tone={moment.kind === "goal" ? "goal" : "default"} label="moment-title">
    <div class="badge" class:goal={moment.kind === "goal"}>
      {#if moment.kind === "goal"}
        <Flame size={32} />
      {:else}
        <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5" /></svg>
      {/if}
    </div>
    <h2 id="moment-title">{moment.title}</h2>
    <p>{moment.body}</p>
    <button class="btn primary wide" class:gold={moment.kind === "goal"} onclick={dismiss}>{moment.action}</button>
  </Sheet>
{/if}

<style>
  .badge { width: 64px; height: 64px; border-radius: 18px; display: flex; align-items: center; justify-content: center; background: var(--line); color: var(--ink); }
  .badge.goal { background: var(--goal-bg); color: var(--goal); border: 1px solid var(--goal-line); }
  p { margin: 0; font-size: 15px; line-height: 1.45; color: var(--muted); }
  /* The Daily goal's moment keeps its gold, on the shared primary button. */
  .btn.gold { background: var(--goal); color: var(--ground); }
</style>
