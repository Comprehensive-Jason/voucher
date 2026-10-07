<script lang="ts">
  // The Windows tray pop-up: the Bank, a ticket to tear, where things stand,
  // and the sources closest to their next Voucher.
  import { onMount } from "svelte";
  import { device } from "$lib/api";
  import { Live } from "$lib/live.svelte";
  import DesktopTicket from "$lib/components/DesktopTicket.svelte";
  import { styleOf } from "$lib/sources";

  const live = new Live();
  onMount(() => live.start());

  const d = $derived(live.data);
  const mode = $derived(live.mode);
  const left = $derived(d?.unlockEndsAt ? Math.max(0, d.unlockEndsAt - live.now) : 0);
  const hm = (unix: number) => new Date(unix * 1000).toTimeString().slice(0, 5);
  const fill = $derived(mode === "curfew" ? "night" : mode === "full" ? "amber" : "on");
  // Bank cells, then outlines for the tickets the running Unlock is using.
  const cells = $derived.by(() => {
    if (!d) return [];
    const inUse = mode === "running" ? d.unlockTickets : 0;
    return Array.from({ length: Math.max(d.bankLimit, 1) }, (_, i) => (i < d.bank ? fill : i < d.bank + inUse ? "use" : ""));
  });
  const status = $derived.by(() => {
    if (!d) return { label: "", right: "", tone: "" };
    if (mode === "curfew") return { label: "Curfew", right: `${d.curfewStart} to ${d.curfewEnd}`, tone: "night" };
    if (mode === "running") return { label: `Unlocked · ${Math.floor(left / 60)}:${String(left % 60).padStart(2, "0")} left`, right: `locks ${hm(d.unlockEndsAt!)}`, tone: "on" };
    if (mode === "full") {
      const lost = d.log.filter((e) => e.kind === "earned" && !e.kept);
      return { label: "Bank full", right: lost.length ? `${lost.length} lost at ${new Date(lost[0].at).toTimeString().slice(0, 5)}` : `Curfew at ${d.curfewStart}`, tone: "amber" };
    }
    return { label: "Locked", right: `Curfew at ${d.curfewStart}`, tone: "" };
  });
  const near = $derived.by(() => (d?.sources ?? [])
    .filter((s) => s.on && s.kind !== "tasks")
    .map((s) => ({ ...styleOf(s.id), fraction: s.progress / s.every, left: `${s.every - s.progress} ${s.kind === "workout" ? "zone min" : "min"}` }))
    .sort((a, b) => b.fraction - a.fraction)
    .slice(0, 4));
</script>

<div class="panel">
  {#if d}
    <header>
      <div class="brand">
        <svg width="20" height="20" viewBox="0 0 24 22" aria-hidden="true"><path d="M3 8a2 2 0 0 0 0 4v4a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-4a2 2 0 0 0 0-4V6a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2z" fill={mode === "curfew" ? "#9aa6ff" : "var(--voucher)"} /><path d="M8.2 7.6l3.8 6.8 3.8-6.8" fill="none" stroke="var(--ground)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
        <span class="mono word">VOUCHER</span>
      </div>
      <div class="streak">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3c1 4 6 6 6 11a6 6 0 0 1-12 0c0-3 2-5 3-6 0 2 1 3 2 3 0-3-1-5 1-8z" /></svg>
        {d.streakDays > 0 ? `${d.streakDays} day streak` : "No streak"}
      </div>
    </header>

    <div class="bank">
      <div class="count">
        <span class="mono big {mode}">{d.bank}</span>
        <span class="of">of {d.bankLimit} in the Bank{mode === "full" ? ": full" : mode === "empty" ? ": empty" : mode === "curfew" ? ", kept overnight" : ""}</span>
      </div>
      <div class="cells" style="grid-template-columns: repeat({cells.length}, minmax(0, 1fr))">{#each cells as c}<i class={c}></i>{/each}</div>
    </div>

    <DesktopTicket {mode} bank={d.bank} unlockMinutes={d.unlockMinutes} curfewEnd={d.curfewEnd} ontear={live.tear} />

    <div class="status"><span class="cap {status.tone}">{status.label}</span><span class="mono right">{status.right}</span></div>

    <div class="near">
      {#each near as n}
        <div class="src">
          <span class="srcline"><span>{n.short}</span><span class="mono left">{n.left}</span></span>
          <div class="bar"><i style="width: {n.fraction * 100}%; background: {n.color}"></i></div>
        </div>
      {/each}
    </div>

    <footer>
      <button class="open" onclick={() => device("showMain")}>Open Voucher</button>
      <button class="rules" aria-label="Rules" onclick={() => device("showMain", { route: "/rules" })}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h10M18 7h2M4 17h4M12 17h8" /><circle cx="16" cy="7" r="2" /><circle cx="10" cy="17" r="2" /></svg>
      </button>
    </footer>
  {:else if live.error}
    <p class="error">{live.error}</p>
  {/if}
</div>

<style>
  .panel { min-height: 100vh; background: var(--ground); border: 1px solid var(--line); padding: 16px; display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; }
  .brand { display: flex; align-items: center; gap: 8px; }
  .word { font-size: 14px; font-weight: 700; letter-spacing: .2em; }
  .streak { display: flex; align-items: center; gap: 6px; padding: 5px 10px; border-radius: 999px; background: var(--goal-bg); color: var(--goal); font-size: 12px; font-weight: 700; }
  .bank { display: flex; flex-direction: column; gap: 8px; }
  .count { display: flex; align-items: baseline; gap: 10px; }
  .big { font-size: 44px; font-weight: 700; line-height: 1; }
  .big.full { color: var(--goal); } .big.empty { color: var(--muted); } .big.curfew { color: var(--night-ink); }
  .of { font-size: 14px; color: var(--muted); }
  .cells { display: grid; gap: 3px; }
  .cells i { height: 12px; border-radius: 3px; background: var(--line); }
  .cells i.on { background: var(--voucher); } .cells i.amber { background: var(--goal); } .cells i.night { background: var(--night); }
  .cells i.use { background: transparent; box-shadow: inset 0 0 0 2px var(--voucher); }
  .status { display: flex; justify-content: space-between; align-items: center; }
  .status .cap.on { color: var(--voucher); } .status .cap.amber { color: var(--goal); } .status .cap.night { color: #9aa6ff; }
  .right { font-size: 12px; color: var(--muted); }
  .near { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); column-gap: 12px; row-gap: 10px; }
  .src { display: flex; flex-direction: column; gap: 5px; min-width: 0; }
  .srcline { display: flex; justify-content: space-between; font-size: 12px; }
  .left { color: var(--muted); }
  footer { display: flex; align-items: center; justify-content: space-between; border-top: 1px solid var(--divider); padding-top: 10px; }
  .open { height: 36px; padding: 0 4px; background: none; border: 0; color: var(--ink); font: 700 13px var(--font); text-decoration: underline; cursor: pointer; }
  .rules { width: 36px; height: 36px; padding: 0; border-radius: 10px; background: var(--surface); border: 1px solid var(--line); color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .error { color: var(--goal); }
</style>
