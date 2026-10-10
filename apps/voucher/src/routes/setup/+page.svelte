<script lang="ts">
  // First-run setup, five steps: welcome, connect to the Ledger, protection,
  // sources, and blocklists and limits. While the Ledger's setup is open,
  // every change applies at once; "Start Voucher" closes it for good. A second
  // device joining a Ledger that is already set up sees its real rules, and
  // its changes follow the usual waits.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { connect, connection, device, fixProtection, ledger, onWindows, protection, protectionParts, requestHealth } from "$lib/api";
  import Switch from "$lib/components/Switch.svelte";
  import TokenSheet from "$lib/components/TokenSheet.svelte";
  import DeviceOwnerSteps from "$lib/components/DeviceOwnerSteps.svelte";
  import { compareSources, needsToken, serviceOf, styleOf } from "$lib/sources";
  import { hhmm, minutesOf, timeOf } from "$lib/rules";
  import { summary } from "$lib/blocklists";
  import type { Protection, Status } from "$lib/types";

  const STEPS = 5;
  let step = $state(1);
  let status = $state<Status | null>(null);
  let guard = $state<Protection | null>(null);
  let health = $state(false);
  let url = $state("");
  let code = $state("");
  let keyStart = $state<string | null>(null);
  let error = $state<string | null>(null);
  let busy = $state(false);
  let tokenFor = $state<string | null>(null);
  let showSteps = $state(false);
  // Step 5's limits, edited here and sent with "Start Voucher".
  let limits = $state({ unlock: 10, bank: 24, goal: 16, start: 22 * 60, end: 6 * 60 });

  const settingUp = $derived(!!status && !status.setup_complete);

  async function load() {
    try {
      status = await ledger<Status>("GET", "/status");
      const s = status.settings;
      limits = { unlock: s.unlock_minutes, bank: s.bank_limit, goal: s.daily_goal, start: minutesOf(s.curfew_start), end: minutesOf(s.curfew_end) };
      error = null;
    } catch (e) { error = String(e); }
  }

  /** Applies changes: at once during setup, otherwise as ordinary requests. */
  async function apply(changes: Record<string, unknown>[], finish = false) {
    if (settingUp) {
      status = await ledger<Status>("POST", "/setup", { changes, finish });
    } else {
      for (const c of changes) await ledger("POST", "/change", c);
      await load();
    }
  }

  async function doConnect() {
    busy = true;
    try { keyStart = await connect(url, code); await load(); } catch (e) { error = String(e); }
    busy = false;
  }

  async function checkGuard() {
    guard = await protection();
    health = await device<boolean>("healthGranted").catch(() => health);
  }

  async function start() {
    busy = true;
    try {
      const s = status!.settings;
      const changes: Record<string, unknown>[] = [];
      if (limits.unlock !== s.unlock_minutes) changes.push({ UnlockMinutes: limits.unlock });
      if (limits.bank !== s.bank_limit) changes.push({ BankLimit: limits.bank });
      if (limits.goal !== s.daily_goal) changes.push({ DailyGoal: limits.goal });
      if (limits.start !== minutesOf(s.curfew_start) || limits.end !== minutesOf(s.curfew_end)) {
        changes.push({ Curfew: { start: timeOf(limits.start), end: timeOf(limits.end) } });
      }
      await apply(changes, true);
      goto("/", { replaceState: true });
    } catch (e) { error = String(e); }
    busy = false;
  }

  const requiredLeft = $derived(guard ? protectionParts().filter((p) => !guard![p.part]).length : protectionParts().length);
  const wrap = (m: number) => (m + 1440) % 1440;

  onMount(() => {
    connection().then(async (existing) => {
      if (existing) { url = existing; await load(); }
      await checkGuard();
    });
    // Coming back from a system settings screen: check the permissions again.
    const recheck = () => document.visibilityState === "visible" && checkGuard();
    document.addEventListener("visibilitychange", recheck);
    return () => document.removeEventListener("visibilitychange", recheck);
  });
</script>

<main>
  <header>
    <div class="brand">
      <svg width="22" height="22" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" fill="var(--voucher)" /><path d="M8.2 7.6l3.8 6.8 3.8-6.8" fill="none" stroke="var(--ground)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
      <span class="mono word">VOUCHER</span>
    </div>
    <div class="cap">Step {step} of {STEPS}</div>
  </header>
  <div class="progress">{#each Array(STEPS) as _, i}<i class:on={i < step}></i>{/each}</div>

  {#if step === 1}
    <div class="intro">
      <h1>Screen time you earn.</h1>
      <p>Voucher keeps your Distractions paused until you have done something worth a break.</p>
    </div>
    <div class="points">
      {#each [["Earn", "Finished tasks, workouts, reading, and focused time each count toward a Voucher."],
              ["Tear", "Tear a Voucher off the stack to open every Distraction for 10 minutes."],
              ["Sleep", "During Curfew nothing can be unlocked. Your Bank is kept for the morning."]] as [title, text], i}
        <div class="point"><div class="mono num">{i + 1}</div><div><div class="ptitle">{title}</div><div class="ptext">{text}</div></div></div>
      {/each}
    </div>
    <div class="foot"><button class="pri" onclick={() => (step = 2)}>Set it up</button></div>

  {:else if step === 2}
    <div class="intro">
      <h1>Connect to your Ledger</h1>
      <p>The Ledger keeps your Bank and signs every Unlock. Enter the address it listens on, over Tailscale.</p>
    </div>
    <label class="field">
      <span class="cap">Ledger address</span>
      <input class="mono" placeholder="http://100.x.y.z:8787" autocapitalize="off" autocomplete="off" bind:value={url} />
    </label>
    <label class="field">
      <span class="cap">Access code</span>
      <input class="mono" placeholder="VCHR-XXXX-XXXX-XXXX-XXXX" autocapitalize="characters" autocomplete="off" bind:value={code} />
      <span class="fieldhint">In the Ledger's data folder as access.code, or its first-run log. Leave empty if your Ledger has none.</span>
    </label>
    {#if keyStart}
      <div class="okline"><span class="ok">Connected</span><span class="muted">Key starts <span class="mono">{keyStart}</span>: it should match the start of the Ledger's public.key.</span></div>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}
    <div class="foot">
      {#if status}
        <button class="pri" onclick={() => (step = 3)}>Continue</button>
      {:else}
        <button class="pri" disabled={busy || !url.trim()} onclick={doConnect}>{busy ? "Connecting" : "Connect"}</button>
      {/if}
    </div>

  {:else if step === 3}
    <div class="intro">
      <h1>Let Voucher do its job</h1>
      <p>{onWindows ? "Two parts keep Voucher working on this PC." : "Three permissions are needed. The fourth is only for workouts."}</p>
    </div>
    <div class="list">
      {#each protectionParts() as p (p.part)}
        <div class="li">
          <span class="lt"><b>{p.name}</b><small>{p.what}</small></span>
          {#if guard?.[p.part as keyof Protection]}
            <span class="ok"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>Granted</span>
          {:else if p.part === "deviceOwner" && onWindows}
            <span class="hintsm">Reinstall Voucher as an administrator</span>
          {:else if p.part === "deviceOwner"}
            <button class="sm" onclick={() => (showSteps = true)}>How</button>
          {:else}
            <button class="sm" onclick={() => fixProtection(p.part as keyof Protection)}>Grant</button>
          {/if}
        </div>
      {/each}
      {#if !onWindows}
      <div class="li">
        <span class="lt"><b>Health Connect</b><small>Optional. Needed for Workout</small></span>
        {#if health}<span class="ok">Connected</span>{:else}<button class="sm out" onclick={async () => (health = await requestHealth())}>Connect</button>{/if}
      </div>
      {/if}
    </div>
    <div class="foot">
      <div class="hint">{requiredLeft ? `${requiredLeft} required permission${requiredLeft === 1 ? "" : "s"} still to grant` : "All set"}</div>
      <button class="pri" disabled={requiredLeft > 0} onclick={() => (step = 4)}>Continue</button>
      {#if requiredLeft > 0}<button class="skip" onclick={() => (step = 4)}>Continue without blocking for now</button>{/if}
    </div>

  {:else if step === 4 && status}
    <div class="intro">
      <h1>What earns a Voucher?</h1>
      <p>Switch on what counts. You can add more later in Rules.</p>
    </div>
    {#each [["Task counters", "tasks"], ["Workout", "workout"], ["Focused time", "focus"]] as [title, kind]}
      <div class="cap">{title}</div>
      <div class="list">
        {#each Object.entries(status.settings.sources).filter(([, s]) => s.kind === kind).sort(([a, x], [b, y]) => compareSources({ id: a, name: x.name || a }, { id: b, name: y.name || b })) as [id, s] (id)}
          {@const style = styleOf(id)}
          <div class="li">
            <span class="dot" style="background: {style.color}"></span>
            <span class="lt"><b>{style.name}</b>{#if kind === "focus"}<small>{s.packages.filter((p) => !p.startsWith("win:")).map((p) => s.labels?.[p] ?? p).join(", ")}</small>{/if}</span>
            <Switch on={s.on} label={style.name} onchange={(on) => apply([{ Source: { id, on, every: s.every } }])} />
          </div>
          <!-- Each task service in the group signs in on its own. -->
          {#if kind === "tasks"}
            {#each s.packages as service (service)}
              <div class="li sub">
                <span class="lt">{serviceOf(service).name}</span>
                {#if needsToken(status.source_errors[service])}
                  <button class="sm out" onclick={() => (tokenFor = service)}>Connect</button>
                {:else}<span class="ok">Connected</span>{/if}
              </div>
            {/each}
          {/if}
        {/each}
      </div>
    {/each}
    <div class="foot"><button class="pri" onclick={() => (step = 5)}>Continue</button></div>

  {:else if step === 5 && status}
    <div class="intro">
      <h1>What should stay paused?</h1>
      <p>Pick blocklists and check the starting limits.</p>
    </div>
    <div class="list">
      {#each Object.entries(status.settings.blocklists).sort(([a, x], [b, y]) => (x.name || a).localeCompare(y.name || b)) as [id, list] (id)}
        <div class="li">
          <span class="dot" style="background: {list.color}"></span>
          <span class="lt"><b>{list.name}</b><small>{summary(list)}</small></span>
          <Switch on={list.on} label={list.name} onchange={(on) => apply([{ BlocklistOn: { id, on } }])} />
        </div>
      {/each}
    </div>
    <div class="list">
      {#each [
        { name: "Unlock length", value: `${limits.unlock} min`, down: () => (limits.unlock = Math.max(5, limits.unlock - 5)), up: () => (limits.unlock = Math.min(30, limits.unlock + 5)) },
        { name: "Bank limit", value: `${limits.bank}`, down: () => (limits.bank = Math.max(1, limits.bank - 1)), up: () => (limits.bank = Math.min(48, limits.bank + 1)) },
        { name: "Daily goal", value: `${limits.goal}`, down: () => (limits.goal = Math.max(1, limits.goal - 1)), up: () => (limits.goal = Math.min(30, limits.goal + 1)) },
        { name: "Curfew starts", value: hhmm(timeOf(limits.start)), down: () => (limits.start = wrap(limits.start - 30)), up: () => (limits.start = wrap(limits.start + 30)) },
        { name: "Curfew ends", value: hhmm(timeOf(limits.end)), down: () => (limits.end = wrap(limits.end - 30)), up: () => (limits.end = wrap(limits.end + 30)) },
      ] as row (row.name)}
        <div class="li">
          <span class="lt"><b>{row.name}</b></span>
          <button class="step" aria-label="Less {row.name}" onclick={row.down}>−</button>
          <span class="mono val">{row.value}</span>
          <button class="step" aria-label="More {row.name}" onclick={row.up}>+</button>
        </div>
      {/each}
    </div>
    {#if error}<p class="error">{error}</p>{/if}
    <div class="foot">
      <div class="hint">{settingUp ? "Set these freely now. For two days after setup every change still applies at once; then anything that loosens a rule waits for 06:00." : "This Ledger is already set up: anything that loosens a rule waits for 06:00."}</div>
      <button class="pri" disabled={busy} onclick={start}>Start Voucher</button>
    </div>
  {/if}
</main>

{#if tokenFor}
  <TokenSheet source={tokenFor} onclose={() => (tokenFor = null)} onsaved={() => { tokenFor = null; load(); }} />
{/if}
{#if showSteps}
  <DeviceOwnerSteps onclose={() => { showSteps = false; checkGuard(); }} />
{/if}

<style>
  /* A phone-width column, centred on tablets and desktops. */
  main { min-height: 100%; width: 100%; max-width: 560px; margin: 0 auto; padding: calc(28px + env(safe-area-inset-top)) 20px 24px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .word { font-size: 15px; font-weight: 700; letter-spacing: .2em; }
  .progress { display: flex; gap: 6px; }
  .progress i { flex: 1; height: 4px; border-radius: 2px; background: var(--line); }
  .progress i.on { background: var(--voucher); }
  .intro { display: flex; flex-direction: column; gap: 8px; padding-top: 8px; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; line-height: 1.15; }
  .intro p { margin: 0; font-size: 15px; color: var(--muted); line-height: 1.4; }
  .points { display: flex; flex-direction: column; gap: 18px; padding-top: 12px; }
  .point { display: flex; gap: 14px; align-items: flex-start; }
  .num { width: 32px; height: 32px; border-radius: 10px; background: var(--unlocked-bg); color: var(--voucher); font-size: 15px; font-weight: 700; display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
  .ptitle { font-size: 16px; font-weight: 700; }
  .ptext { font-size: 14px; color: var(--muted); line-height: 1.4; margin-top: 3px; }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; }
  .pri { min-height: 52px; width: 100%; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 16px var(--font); }
  .pri:disabled { background: var(--line); color: var(--muted); }
  .skip { min-height: 44px; border: 0; background: none; color: var(--muted); font: 500 13px var(--font); text-decoration: underline; }
  .hint { font-size: 13px; color: var(--muted); text-align: center; line-height: 1.4; }
  .list { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 0 14px; }
  .li { display: flex; align-items: center; gap: 12px; min-height: 60px; border-top: 1px solid var(--divider); }
  .li:first-child { border-top: 0; }
  .li.sub { min-height: 44px; padding-left: 26px; font-size: 14px; }
  .lt { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .lt b { font-size: 15px; }
  .lt small { font-size: 12px; color: var(--muted); line-height: 1.3; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .hintsm { font-size: 12px; color: var(--goal); max-width: 120px; text-align: right; }
  .ok { display: flex; align-items: center; gap: 6px; font-size: 13px; font-weight: 700; color: var(--voucher); flex-shrink: 0; }
  .sm { height: 36px; padding: 0 14px; border-radius: 10px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 13px var(--font); flex-shrink: 0; }
  .sm.out { background: none; border: 1px solid #3a3f45; color: var(--ink); }
  .step { width: 36px; height: 36px; border-radius: 10px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 18px var(--font); }
  .val { min-width: 64px; text-align: center; font-size: 15px; font-weight: 700; }
  .field { display: flex; flex-direction: column; gap: 6px; }
  .field input { height: 48px; border-radius: 14px; border: 1px solid var(--line); background: var(--surface); color: var(--ink); padding: 0 14px; font-size: 15px; }
  .field input:focus { outline: none; border-color: var(--voucher); }
  .fieldhint { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .okline { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
  .muted { color: var(--muted); }
  .error { margin: 0; color: var(--goal); font-size: 13px; }
</style>
