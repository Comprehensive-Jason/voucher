<script lang="ts">
  // Voucher's own blocked screen, shown when a paused app is opened (ADR
  // 0007). Three states: Vouchers to tear, an empty Bank, and Curfew. Tearing
  // here opens the app straight away.
  import { onMount } from "svelte";
  import { page } from "$app/state";
  import { appIcon, device, deviceUsage, tear, today } from "$lib/api";
  import VoucherStack from "$lib/components/VoucherStack.svelte";
  import { styleOf } from "$lib/sources";
  import { modeOf, type DeviceUsage, type Today } from "$lib/types";

  const pkg = page.url.searchParams.get("pkg");
  // Known when the app was opened from its icon; otherwise it is "This app".
  const named = page.url.searchParams.get("label");
  const label = named ?? "This app";
  let data = $state<Today | null>(null);
  let usage = $state<DeviceUsage | null>(null);
  let icon = $state<string | null>(null);
  let error = $state<string | null>(null);
  let clock = $state(new Date().toTimeString().slice(0, 5));

  const mode = $derived(data ? modeOf(data, Math.floor(Date.now() / 1000)) : "locked");
  const ATTEMPT_COLORS = ["#e5609b", "#ff6b5b", "#ff8a3d", "#c9cdd1"];
  /** A tile colour when the app's own icon can't be read: brand colours for the usual ones. */
  function tileColor(name: string): string {
    const known: Record<string, string> = { instagram: "#c13584", youtube: "#e62117", reddit: "#ff4500", tiktok: "#25f4ee" };
    return known[name.toLowerCase()] ?? ["#5b6cff", "#c13584", "#2f9e6b", "#d9822b", "#7d8cff"][[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % 5];
  }
  const most = $derived(Math.max(1, ...(usage?.attempts ?? []).map((a) => a.count)));
  // Fastest ways to earn: each switched-on source, by what it still needs.
  const fastest = $derived.by(() => (data?.sources ?? [])
    .filter((s) => s.on)
    .map((s) => ({
      name: s.kind === "tasks" ? "Tasks" : styleOf(s.id).short,
      color: s.kind === "tasks" ? styleOf("tasks").color : styleOf(s.id).color,
      fraction: s.kind === "tasks" ? 0 : s.progress / s.every,
      left: s.kind === "tasks" ? `${s.every - s.progress} task${s.every - s.progress === 1 ? "" : "s"}` : `${s.every - s.progress} ${s.kind === "workout" ? "zone min" : "min"}`,
    }))
    .filter((s, i, all) => all.findIndex((x) => x.name === s.name) === i)
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, 4));

  async function onTear(count: number) {
    try {
      data = await tear(count);
      if (pkg) await device("openApp", { pkg });
    } catch (e) { error = String(e); }
  }
  const close = (closed: boolean) => device("goHome", { closed }).catch(() => history.back());

  onMount(() => {
    today().then((t) => (data = t)).catch((e) => (error = String(e)));
    deviceUsage().then((u) => (usage = u));
    if (pkg) appIcon(pkg).then((i) => (icon = i));
    const tick = setInterval(() => (clock = new Date().toTimeString().slice(0, 5)), 5000);
    return () => clearInterval(tick);
  });
</script>

{#if data && mode === "curfew"}
  <main class="night">
    <svg width="56" height="56" viewBox="0 0 24 24" fill="none" stroke="#9aa6ff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5z" /></svg>
    <div class="mono bigclock">{clock}</div>
    <h1>Time to sleep.</h1>
    <p>{label} and everything else wake up at {data.curfewEnd}. Put the phone down; it will all be here in the morning.</p>
    <div class="foot"><button class="close night" onclick={() => close(false)}>Good night</button></div>
  </main>
{:else}
  <main>
    <div class="head">
      <div class="tile" style={!icon && named ? `background: ${tileColor(named)}` : ""}>
        {#if icon}<img src={icon} alt="" />
        {:else if named}<span>{named.slice(0, 1)}</span>
        {:else}<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M9 6v12M15 6v12" /></svg>{/if}
      </div>
      <h1>{label} is paused</h1>
      <p>{data && data.bank === 0
        ? "The Bank is empty. Earn a Voucher to open it, or close it and keep going."
        : `Tear a Voucher to open every Distraction for ${data?.unlockMinutes ?? 10} minutes, or close it and keep going.`}</p>
    </div>

    {#if usage && usage.attempts.length}
      <div class="card">
        <div class="cap">Opened while locked today</div>
        {#each usage.attempts.slice(0, 4) as a, i}
          <div class="row">
            <div class="name">{a.label}</div>
            <div class="bar"><i style="width: {(a.count / most) * 100}%; background: {ATTEMPT_COLORS[i]}"></i></div>
            <div class="mono n">{a.count}</div>
          </div>
        {/each}
      </div>
    {/if}

    {#if data}
      <div class="stack">
        <div class="bankline"><span>{data.bank} of {data.bankLimit} in the Bank</span><span>Curfew at {data.curfewStart}</span></div>
        {#if data.bank === 0}
          <div class="card">
            <div class="cap">Fastest ways to earn one</div>
            {#each fastest as f (f.name)}
              <div class="row earn">
                <div class="name">{f.name}</div>
                <div class="bar"><i style="width: {f.fraction * 100}%; background: {f.color}"></i></div>
                <div class="mono left">{f.left}</div>
              </div>
            {/each}
          </div>
        {:else}
          <VoucherStack {mode} bank={data.bank} unlockMinutes={data.unlockMinutes} room={data.curfewRoomMinutes} curfewStart={data.curfewStart} ontear={onTear} />
        {/if}
      </div>
    {/if}
    {#if error}<p class="error">{error}</p>{/if}

    <div class="foot">
      <button class="close" onclick={() => close(true)}>{named ? `Close ${named}` : "Close"}</button>
      <div class="hint">{data?.bank === 0 ? "Come back when there is a Voucher to tear." : `${named ?? "It"} opens the moment the Voucher tears.`}</div>
    </div>
  </main>
{/if}

<style>
  main { min-height: 100%; padding: calc(40px + env(safe-area-inset-top)) 20px 28px; display: flex; flex-direction: column; gap: 22px; }
  .head { display: flex; flex-direction: column; align-items: center; gap: 14px; text-align: center; }
  .tile { width: 76px; height: 76px; border-radius: 22px; background: var(--line); display: flex; align-items: center; justify-content: center; color: #fff; font: 700 34px var(--font); overflow: hidden; }
  .tile img { width: 100%; height: 100%; }
  h1 { margin: 0; font-size: 28px; font-weight: 700; line-height: 1.15; }
  .head p { margin: 0; font-size: 15px; color: var(--muted); line-height: 1.4; }
  .card { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 16px; display: flex; flex-direction: column; gap: 12px; }
  .row { display: grid; grid-template-columns: 84px 1fr 28px; gap: 10px; align-items: center; }
  .row.earn { grid-template-columns: 84px 1fr auto; }
  .name { font-size: 14px; font-weight: 500; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .n { font-size: 13px; text-align: right; }
  .left { font-size: 12px; text-align: right; color: var(--muted); }
  .stack { display: flex; flex-direction: column; gap: 10px; }
  .bankline { display: flex; justify-content: space-between; font-size: 14px; color: var(--muted); }
  .foot { margin-top: auto; display: flex; flex-direction: column; gap: 10px; width: 100%; }
  .close { min-height: 52px; width: 100%; border-radius: 14px; border: 1px solid #3a3f45; background: var(--surface); color: var(--ink); font: 700 16px var(--font); }
  .hint { font-size: 13px; color: var(--muted); text-align: center; }
  .error { color: var(--goal); }
  main.night { background: #0b0d1a; color: #eef0ff; padding: calc(120px + env(safe-area-inset-top)) 28px 28px; align-items: center; text-align: center; gap: 18px; }
  .bigclock { font-size: 72px; font-weight: 700; line-height: 1; letter-spacing: -2px; }
  .night h1 { font-size: 30px; }
  .night p { margin: 0; font-size: 16px; color: #b8bde6; line-height: 1.45; max-width: 300px; }
  .close.night { background: var(--night); color: #0c1033; border: 0; }
</style>
