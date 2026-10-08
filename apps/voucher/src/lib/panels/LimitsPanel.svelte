<script lang="ts">
  // Rules, Limits: the four numbers that set how strict Voucher is. Every
  // Loosening shows as a pending banner, with a ghost knob, until 06:00.
  import { onMount } from "svelte";
  import { ledger, missingProtection, onWindows, protection, RULES_CHANGED } from "../api";
  import RulesNotices from "../components/RulesNotices.svelte";
  import { NOTICES_IN_HEADER } from "../notices";
  import RuleSlider from "../components/RuleSlider.svelte";
  import CurfewSlider from "../components/CurfewSlider.svelte";
  import { hhmm, minutesOf, pendingValue, timeOf } from "../rules";
  import type { Protection, Status } from "../types";

  let status = $state<Status | null>(null);
  let guard = $state<Protection | null>(null);
  let error = $state<string | null>(null);
  let note = $state<string | null>(null);

  async function load() {
    try {
      status = await ledger<Status>("GET", "/status");
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

<div class="panel" class:headed={heading}>
  {#if heading}<div class="colhead"><span class="coltitle">Limits</span><span class="colhint">{status?.grace_until ? "Grace: changes apply now" : `Looser waits for ${status ? hhmm(status.settings.morning_boundary) : "06:00"}`}</span></div>{/if}
  <div class="body">

  {#if error}<p class="error">{error}</p>{/if}

  {#if !NOTICES_IN_HEADER}<RulesNotices />{/if}

  {#if status}
    {@const s = status.settings}
    <div class="rule">
      <div class="top"><span class="name">Unlock length</span><span class="mono val" class:preview={unlockPreview !== null && unlockPreview !== s.unlock_minutes}>{unlockPreview ?? s.unlock_minutes} min</span></div>
      <RuleSlider min={5} max={30} step={5} value={s.unlock_minutes} onpreview={(v) => (unlockPreview = v)} pending={pendingValue(status.pending, "UnlockMinutes")}
        onchange={(v) => change({ UnlockMinutes: v })} />
      <div class="ends"><span>Shorter: now</span><span>Longer: at {hhmm(s.morning_boundary)}</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Bank limit</span><span class="mono val" class:preview={bankPreview !== null && bankPreview !== s.bank_limit}>{bankPreview ?? s.bank_limit}</span></div>
      <RuleSlider min={4} max={40} step={2} value={s.bank_limit} onpreview={(v) => (bankPreview = v)} pending={pendingValue(status.pending, "BankLimit")}
        onchange={(v) => change({ BankLimit: v })} />
      <div class="ends"><span>Lower: now</span><span>Higher: at {hhmm(s.morning_boundary)}</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Daily goal, for the streak</span><span class="mono val" class:preview={goalPreview !== null && goalPreview !== s.daily_goal}>{goalPreview ?? s.daily_goal}</span></div>
      <RuleSlider kind="goal" min={1} max={30} value={s.daily_goal} onpreview={(v) => (goalPreview = v)} pending={pendingValue(status.pending, "DailyGoal")}
        onchange={(v) => change({ DailyGoal: v })} />
      <div class="ends"><span>Doesn't change access</span><span>Applies tomorrow</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Curfew</span><span class="mono val" class:preview={curfewPreview !== null && (clockOf(curfewPreview.start) !== hhmm(s.curfew_start) || clockOf(curfewPreview.end) !== hhmm(s.curfew_end))}>{curfewPreview ? `${clockOf(curfewPreview.start)} to ${clockOf(curfewPreview.end)}` : `${hhmm(s.curfew_start)} to ${hhmm(s.curfew_end)}`}</span></div>
      <CurfewSlider start={minutesOf(s.curfew_start)} end={minutesOf(s.curfew_end)} pending={curfewPending} onpreview={(v) => (curfewPreview = v)}
        onchange={(a, b) => change({ Curfew: { start: timeOf(a), end: timeOf(b) } })} />
      <div class="ends mono"><span>18</span><span>20</span><span>22</span><span>00</span><span>02</span><span>04</span><span>06</span><span>08</span><span>10</span></div>
      <div class="ends"><span>Wider: now</span><span>Narrower: at {hhmm(s.morning_boundary)}</span></div>
    </div>

    {#if guard && !missing}
      <a class="protected" href="/rules/protection">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--voucher)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
        <span class="ptitle"><b>Protection on</b><small>{onWindows ? "Voucher guard, ActivityWatch" : "App blocking, usage access, blocked-app screen"}</small></span>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </a>
    {/if}

    {#if note}<div class="note">{note}</div>{/if}
  {/if}
  </div>
</div>

<style>
  .panel { display: flex; flex-direction: column; gap: 12px; }
  .rule { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .name { font-weight: 700; }
  .val { font-size: 18px; font-weight: 700; }
  /* A value being dragged to, not yet set. */
  .val.preview { color: var(--muted); }
  .ends { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
  .protected { border-radius: 16px; background: var(--unlocked-bg); border: 1px solid var(--unlocked-line); padding: 10px 14px; display: flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; }
  .ptitle { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ptitle b { font-size: 14px; }
  .ptitle small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 12px; color: var(--muted); text-align: center; }
  .error { color: var(--goal); }
  /* On the tablet the heading stays put and only what's under it scrolls,
     so it never moves or bounces with the list. */
  .body { display: contents; }
  .headed { height: 100%; min-height: 0; }
  .headed .colhead { flex: none; }
  .headed .body { flex: 1; min-height: 0; display: flex; flex-direction: column; gap: inherit; overflow-y: auto; overscroll-behavior: contain; padding-bottom: 28px; scrollbar-width: none; }
  .headed .body::-webkit-scrollbar { display: none; }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
  .colhint { font-size: 12px; color: var(--muted); }
</style>
