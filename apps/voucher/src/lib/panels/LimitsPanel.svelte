<script lang="ts">
  // Rules, Limits: the four numbers that set how strict Voucher is. Every
  // Loosening shows as a pending banner, with a ghost knob, until 06:00.
  import { onMount } from "svelte";
  import { fixProtection, ledger, onWindows, protection } from "../api";
  import RuleSlider from "../components/RuleSlider.svelte";
  import CurfewSlider from "../components/CurfewSlider.svelte";
  import { describe, hhmm, minutesOf, pendingValue, timeOf, until } from "../rules";
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

  async function cancel(index: number) {
    try {
      status = await ledger<Status>("POST", `/cancel?index=${index}`);
    } catch (e) {
      error = String(e);
    }
  }

  const curfewPending = $derived.by(() => {
    const v = status ? pendingValue(status.pending, "Curfew") : null;
    return v ? { start: minutesOf(v.start), end: minutesOf(v.end) } : null;
  });

  // Which protection part is missing, most serious first.
  const missing = $derived.by(() => {
    if (!guard) return null;
    if (!guard.deviceOwner) return { level: "off", part: "deviceOwner" as const, title: "Protection off",
      text: onWindows ? "The Voucher guard isn't running, so nothing is closed or blocked." : "Voucher isn't Device Owner on this phone, so nothing is paused.",
      action: onWindows ? "See how to fix it" : "Set up app blocking" };
    if (!guard.usageAccess) return { level: "partial", part: "usageAccess" as const, title: "Protection partly on",
      text: onWindows ? "ActivityWatch isn't running, so Focused time on this PC can't be counted." : "Usage access is off, so Focused time and Distraction minutes can't be measured.",
      action: onWindows ? "Get ActivityWatch" : "Turn usage access on" };
    if (!guard.overlay && !onWindows) return { level: "partial", part: "overlay" as const, title: "Protection partly on",
      text: "The blocked-app screen is off, so paused apps show Android's plain dialog instead.", action: "Turn the blocked-app screen on" };
    return null;
  });

  onMount(async () => {
    await load();
    guard = await protection();
  });

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
</script>

<div class="panel">
  {#if heading}<div class="colhead"><span class="coltitle">Limits</span><span class="colhint">Looser waits for {status ? hhmm(status.settings.morning_boundary) : "06:00"}</span></div>{/if}

  {#if error}<p class="error">{error}</p>{/if}

  {#if missing}
    <div class="warn {missing.level}">
      <div class="warnhead">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 5-3 8-7 10-4-2-7-5-7-10V6z" /><path d="M12 8v5M12 16v.01" /></svg>
        <span>{missing.title}</span>
      </div>
      <div class="warntext">{missing.text}</div>
      <button onclick={() => missing && fixProtection(missing.part)}>{missing.action}</button>
    </div>
  {/if}

  {#if status}
    {@const s = status.settings}
    {#each status.pending as p, i}
      <div class="pending">
        <div class="ptext">
          <span class="cap">Waiting for {hhmm(s.morning_boundary)}, {until(p[1])}</span>
          <span>{describe(p, s)}</span>
        </div>
        <button class="link" onclick={() => cancel(i)}>Cancel</button>
      </div>
    {/each}

    <div class="rule">
      <div class="top"><span class="name">Unlock length</span><span class="mono val">{s.unlock_minutes} min</span></div>
      <RuleSlider min={5} max={30} step={5} value={s.unlock_minutes} pending={pendingValue(status.pending, "UnlockMinutes")}
        onchange={(v) => change({ UnlockMinutes: v })} />
      <div class="ends"><span>Shorter: now</span><span>Longer: at {hhmm(s.morning_boundary)}</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Bank limit</span><span class="mono val">{s.bank_limit}</span></div>
      <RuleSlider min={1} max={48} value={s.bank_limit} pending={pendingValue(status.pending, "BankLimit")}
        onchange={(v) => change({ BankLimit: v })} />
      <div class="ends"><span>Lower: now</span><span>Higher: at {hhmm(s.morning_boundary)}</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Daily goal, for the streak</span><span class="mono val">{s.daily_goal}</span></div>
      <RuleSlider kind="goal" min={1} max={30} value={s.daily_goal} pending={pendingValue(status.pending, "DailyGoal")}
        onchange={(v) => change({ DailyGoal: v })} />
      <div class="ends"><span>Doesn't change access</span><span>Applies tomorrow</span></div>
    </div>

    <div class="rule">
      <div class="top"><span class="name">Curfew</span><span class="mono val">{hhmm(s.curfew_start)} to {hhmm(s.curfew_end)}</span></div>
      <CurfewSlider start={minutesOf(s.curfew_start)} end={minutesOf(s.curfew_end)} pending={curfewPending}
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

<style>
  .panel { display: flex; flex-direction: column; gap: 12px; }
  .rule { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 12px 16px; display: flex; flex-direction: column; gap: 10px; }
  .top { display: flex; justify-content: space-between; align-items: baseline; }
  .name { font-weight: 700; }
  .val { font-size: 18px; font-weight: 700; }
  .ends { display: flex; justify-content: space-between; font-size: 12px; color: var(--muted); }
  .pending { border-radius: 16px; background: var(--goal-bg); border: 1px solid var(--goal-line); padding: 10px 12px 10px 16px; display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .ptext { display: flex; flex-direction: column; gap: 4px; font-size: 15px; }
  .ptext .cap { color: var(--goal); letter-spacing: .06em; }
  .link { background: none; border: 0; color: var(--goal); font: 700 13px var(--font); text-decoration: underline; min-height: 44px; padding: 0 4px; }
  .warn { border-radius: 16px; padding: 14px 16px; display: flex; flex-direction: column; gap: 10px; }
  .warn.off { background: #2a1616; border: 1px solid #6b2320; --tone: #ff8a7a; }
  .warn.partial { background: var(--goal-bg); border: 1px solid var(--goal-line); --tone: var(--goal); }
  .warnhead { display: flex; align-items: center; gap: 10px; color: var(--tone); font-size: 16px; font-weight: 700; }
  .warntext { font-size: 14px; line-height: 1.4; }
  .warn button { min-height: 44px; border-radius: 12px; border: 0; background: var(--tone); color: var(--ground); font: 700 14px var(--font); }
  .protected { border-radius: 16px; background: var(--unlocked-bg); border: 1px solid var(--unlocked-line); padding: 10px 14px; display: flex; align-items: center; gap: 12px; color: var(--ink); text-decoration: none; }
  .ptitle { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .ptitle b { font-size: 14px; }
  .ptitle small { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .note { font-size: 12px; color: var(--muted); text-align: center; }
  .error { color: var(--goal); }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
  .colhint { font-size: 12px; color: var(--muted); }
</style>
