<script lang="ts">
  // Rules, Limits: the four numbers that set how strict Voucher is. Every
  // Loosening shows as a pending banner, with a ghost knob, until 06:00.
  import { onMount } from "svelte";
  import { ledger, missingProtection, onWindows, protection, protectionNow, RULES_CHANGED, sameAnswer, statusNow } from "../api";
  import RulesNotices from "../components/RulesNotices.svelte";
  import RulesColumn from "../components/RulesColumn.svelte";
  import RulesCard from "../components/RulesCard.svelte";
  import { NOTICES_IN_HEADER } from "../notices";
  import RuleSlider from "../components/RuleSlider.svelte";
  import CurfewSlider from "../components/CurfewSlider.svelte";
  import { hhmm, minutesOf, pendingValue, timeOf } from "../rules";
  import type { Protection, Status } from "../types";

  let status = $state<Status | null>(statusNow());
  let guard = $state<Protection | null>(protectionNow());
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

  async function load() {
    try {
      { const s = await ledger<Status>("GET", "/status"); if (!sameAnswer(s, status)) status = s; }
      error = null;
    } catch (e) {
      error = String(e);
    }
  }

  async function change(body: Record<string, unknown>) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", body);
      note = effect === "Now" ? "Applied now." : `Waits for ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) {
      error = String(e);
    }
  }

  const curfewPending = $derived.by(() => {
    const v = status ? pendingValue(status.pending, "Curfew") : null;
    return v ? { start: minutesOf(v.start), end: minutesOf(v.end) } : null;
  });

  const missing = $derived(missingProtection(guard));

  onMount(() => {
    load().then(async () => { guard = await protection(); });
    // A change made anywhere on Rules shows here at once.
    window.addEventListener(RULES_CHANGED, load);
    return () => window.removeEventListener(RULES_CHANGED, load);
  });

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
  // While a knob is dragged its label shows the value it's snapped to, greyed.
  let unlockPreview = $state<number | null>(null);
  let bankPreview = $state<number | null>(null);
  let goalPreview = $state<number | null>(null);
  let curfewPreview = $state<{ start: number; end: number } | null>(null);
  const clockOf = (m: number) => hhmm(timeOf(m));
</script>

<RulesColumn title="Limits" column={heading}>

  {#if error}<p class="error">{error}</p>{/if}

  {#if !NOTICES_IN_HEADER}<RulesNotices />{/if}

  {#if status}
    {@const s = status.settings}
    <RulesCard>
      <div class="top"><span class="name">Unlock length</span><span class="mono val" class:preview={unlockPreview !== null && unlockPreview !== s.unlock_minutes}>{unlockPreview ?? s.unlock_minutes} min</span></div>
      <RuleSlider kind="unlock" min={5} max={30} step={5} value={s.unlock_minutes} onpreview={(v) => (unlockPreview = v)} pending={pendingValue(status.pending, "UnlockMinutes")}
        onchange={(v) => change({ UnlockMinutes: v })} />
      <div class="ends"><span>Shorter: now</span><span>Longer: at {hhmm(s.morning_boundary)}</span></div>
    </RulesCard>

    <RulesCard>
      <div class="top"><span class="name">Bank limit</span><span class="mono val" class:preview={bankPreview !== null && bankPreview !== s.bank_limit}>{bankPreview ?? s.bank_limit}</span></div>
      <RuleSlider min={4} max={40} step={2} value={s.bank_limit} onpreview={(v) => (bankPreview = v)} pending={pendingValue(status.pending, "BankLimit")}
        onchange={(v) => change({ BankLimit: v })} />
      <div class="ends"><span>Lower: now</span><span>Higher: at {hhmm(s.morning_boundary)}</span></div>
    </RulesCard>

    <RulesCard>
      <div class="top"><span class="name">Daily goal, for the streak</span><span class="mono val" class:preview={goalPreview !== null && goalPreview !== s.daily_goal}>{goalPreview ?? s.daily_goal}</span></div>
      <RuleSlider kind="goal" min={1} max={30} value={s.daily_goal} onpreview={(v) => (goalPreview = v)} pending={pendingValue(status.pending, "DailyGoal")}
        onchange={(v) => change({ DailyGoal: v })} />
      <div class="ends"><span>Doesn't change access</span><span>Applies tomorrow</span></div>
    </RulesCard>

    <RulesCard>
      <div class="top"><span class="name">Curfew</span><span class="mono val" class:preview={curfewPreview !== null && (clockOf(curfewPreview.start) !== hhmm(s.curfew_start) || clockOf(curfewPreview.end) !== hhmm(s.curfew_end))}>{curfewPreview ? `${clockOf(curfewPreview.start)} to ${clockOf(curfewPreview.end)}` : `${hhmm(s.curfew_start)} to ${hhmm(s.curfew_end)}`}</span></div>
      <CurfewSlider start={minutesOf(s.curfew_start)} end={minutesOf(s.curfew_end)} pending={curfewPending} onpreview={(v) => (curfewPreview = v)}
        onchange={(a, b) => change({ Curfew: { start: timeOf(a), end: timeOf(b) } })} />
      <div class="hours mono"><span>18</span><span>20</span><span>22</span><span>00</span><span>02</span><span>04</span><span>06</span><span>08</span><span>10</span></div>
      <div class="ends"><span>Wider: now</span><span>Narrower: at {hhmm(s.morning_boundary)}</span></div>
    </RulesCard>

    {#if guard && !missing}
      <RulesCard href="/rules/protection" row tone="good">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--voucher)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
        <span class="ptitle"><b>Protection on</b><small>{onWindows ? "Voucher guard, ActivityWatch" : "App blocking, usage access, blocked-app screen"}</small></span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </RulesCard>
    {/if}

    {#if note}<div class="note">{note}</div>{/if}
  {/if}
</RulesColumn>

<style>
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .name { font-weight: 700; }
  .val { font-size: 18px; font-weight: 700; }
  /* A value being dragged to, not yet set. */
  .val.preview { color: var(--muted); }
  .ends { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
  /* Curfew's hours read as a chart axis, small and dim. */
  .hours { display: flex; justify-content: space-between; font-size: var(--axis-size); color: var(--axis-ink); }
  .ptitle { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ptitle b { font-size: 14px; }
  .ptitle small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 12px; color: var(--muted); text-align: center; }
  .error { margin: 0; color: var(--danger); }
</style>
