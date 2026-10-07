<script lang="ts">
  // Rules, Sources: what earns Vouchers, and how fast. Switching a source off
  // or slowing it applies now; switching on, speeding up, or adding waits for 06:00.
  import { onMount } from "svelte";
  import { launchableApps, ledger } from "../api";
  import RuleSlider from "../components/RuleSlider.svelte";
  import Switch from "../components/Switch.svelte";
  import Sheet from "../components/Sheet.svelte";
  import TokenSheet from "../components/TokenSheet.svelte";
  import { serviceOf } from "../sources";
  import { hhmm, until } from "../rules";
  import type { SourceKind, Status } from "../types";

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);
  let reconnecting = $state<string | null>(null);
  let adding = $state(false);
  let apps = $state<{ package: string; label: string }[]>([]);
  let note = $state<string | null>(null);

  const GROUPS: { kind: SourceKind; name: string; how: string }[] = [
    { kind: "tasks", name: "Task counters", how: "API" },
    { kind: "workout", name: "Workout", how: "Health Connect" },
    { kind: "focus", name: "Focused time", how: "on screen" },
  ];
  // Rate ranges: tasks per Voucher, or minutes per Voucher.
  const RANGE: Record<SourceKind, { min: number; max: number; step: number }> = {
    tasks: { min: 1, max: 5, step: 1 },
    workout: { min: 5, max: 30, step: 5 },
    focus: { min: 10, max: 60, step: 5 },
  };
  const ORDER = ["todoist", "clickup", "workout", "obsidian", "readwise", "moonreader", "anki"];
  const rank = (id: string) => (ORDER.includes(id) ? ORDER.indexOf(id) : ORDER.length);

  function rows(kind: SourceKind) {
    if (!status) return [];
    return Object.entries(status.settings.sources).filter(([, s]) => s.kind === kind).sort(([a], [b]) => rank(a) - rank(b));
  }
  function rate(kind: SourceKind, every: number) {
    if (kind === "tasks") return every === 1 ? "1 per task" : `1 per ${every} tasks`;
    return `1 per ${every} min`;
  }
  function pendingFor(id: string): { on: boolean; every: number; at: string } | null {
    const hit = status?.pending.find(([c]) => (c as any).Source?.id === id || (c as any).AddSource?.id === id);
    if (!hit) return null;
    const c = hit[0] as any;
    return c.Source ? { ...c.Source, at: hit[1] } : { on: true, every: c.AddSource.source.every, at: hit[1] };
  }

  async function load() {
    try { status = await ledger<Status>("GET", "/status"); error = null; } catch (e) { error = String(e); }
  }
  async function set(id: string, on: boolean, every: number) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { Source: { id, on, every } });
      note = effect === "Now" ? "Applied now." : `Waits for ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { error = String(e); }
  }
  async function openAdd() { apps = await launchableApps(); adding = true; }
  async function add(app: { package: string; label: string }) {
    adding = false;
    const id = `app.${app.label.toLowerCase().replace(/[^a-z0-9]+/g, "")}`;
    try {
      await ledger("POST", "/change", { AddSource: { id, source: { kind: "focus", on: true, every: 30, packages: [app.package] } } });
      note = `${app.label} is added from ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { error = String(e); }
  }

  onMount(load);

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
</script>

<div class="panel">
  {#if heading}<div class="colhead"><span class="coltitle">Sources</span><span class="colhint">On or faster waits for {status ? hhmm(status.settings.morning_boundary) : "06:00"}</span></div>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if status}
    {#each GROUPS as g}
      <div class="group">
        <div class="ghead">
          <span class="cap"><span class="gname">{g.name}</span> · {g.how}</span>
          {#if g.kind === "focus"}
            <button class="add" aria-label="Add to {g.name}" onclick={openAdd}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>Add
            </button>
          {/if}
        </div>
        <div class="card">
          {#each rows(g.kind) as [id, s], i (id)}
            {@const style = serviceOf(id)}
            {@const problem = status.source_errors[id]}
            {@const waiting = pendingFor(id)}
            <div class="row" class:first={i === 0}>
              <div class="line">
                <div class="dot" style="background: {style.color}"></div>
                <div class="label">
                  <span class="name" class:off={!s.on}>{style.name}</span>
                  <span class="sub" class:warn={!!problem}>{problem ? `${problem}, not counting` : s.on ? style.sub ?? "" : "off"}</span>
                </div>
                <Switch on={s.on} label="{style.name} {s.on ? 'on' : 'off'}" onchange={(on) => set(id, on, s.every)} />
              </div>
              {#if s.on && !problem}
                <div class="rate">
                  <div class="mono rtext">{rate(s.kind, s.every)}</div>
                  <RuleSlider small strict="right" {...RANGE[s.kind]} value={s.every}
                    pending={waiting && waiting.on ? waiting.every : null} onchange={(v) => set(id, true, v)} />
                </div>
              {/if}
              {#if waiting}
                <div class="waiting">{waiting.on ? (s.on ? `${rate(s.kind, waiting.every)}` : "On") : "Off"} at {hhmm(status.settings.morning_boundary)}, {until(waiting.at)}</div>
              {/if}
              {#if problem}
                <button class="reconnect" onclick={() => (reconnecting = id)}>Reconnect {style.name}</button>
              {/if}
            </div>
          {/each}
        </div>
      </div>
    {/each}
    <div class="foot">Off or slower applies now. On, faster, or newly added waits for {hhmm(status.settings.morning_boundary)}.</div>
    {#if note}<div class="foot">{note}</div>{/if}
  {/if}
</div>

{#if reconnecting}
  <TokenSheet source={reconnecting} onclose={() => (reconnecting = null)}
    onsaved={() => { note = "Token saved. It counts again from the next check, within 5 minutes."; reconnecting = null; load(); }} />
{/if}

{#if adding}
  <Sheet onclose={() => (adding = false)}>
    <h2>Add Focused time</h2>
    <p class="body">Time this app is on screen and in use earns 1 Voucher per 30 minutes, from {status ? hhmm(status.settings.morning_boundary) : "06:00"}.</p>
    {#each apps as app (app.package)}
      <button class="pick" onclick={() => add(app)}><span>{app.label}</span><span class="mono pkg">{app.package}</span></button>
    {:else}
      <p class="body">The app list isn't available on this device yet.</p>
    {/each}
  </Sheet>
{/if}

<style>
  .panel { display: flex; flex-direction: column; gap: 12px; }
  .group { display: flex; flex-direction: column; gap: 4px; }
  .ghead { display: flex; align-items: center; justify-content: space-between; height: 32px; }
  .gname { color: var(--ink); }
  .add { height: 32px; padding: 0 10px; border-radius: 10px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 12px var(--font); display: flex; align-items: center; gap: 6px; }
  .card { border-radius: 14px; background: var(--surface); border: 1px solid var(--line); padding: 0 14px; }
  .row { padding: 8px 0; display: flex; flex-direction: column; gap: 6px; border-top: 1px solid var(--divider); }
  .row.first { border-top: 0; }
  .line { display: flex; align-items: center; gap: 10px; min-height: 30px; }
  .dot { width: 10px; height: 10px; border-radius: 50%; flex-shrink: 0; }
  .label { flex: 1; min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .name { font-size: 15px; font-weight: 700; }
  .name.off { color: var(--muted); }
  .sub { font-size: 12px; color: var(--muted); margin-left: 4px; }
  .sub.warn { color: var(--goal); }
  .rate { display: grid; grid-template-columns: 110px 1fr; gap: 12px; align-items: center; }
  .rtext { font-size: 13px; font-weight: 700; }
  .waiting { font-size: 12px; color: var(--goal); }
  .reconnect { height: 32px; border-radius: 10px; border: 1px solid var(--goal-line); background: var(--goal-bg); color: var(--goal); font: 700 13px var(--font); }
  .foot { font-size: 12px; color: var(--muted); line-height: 1.4; }
  h2 { margin: 0; font-size: 22px; }
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  .pick { min-height: 52px; display: flex; flex-direction: column; align-items: flex-start; justify-content: center; gap: 2px; padding: 8px 14px; border-radius: 12px; border: 1px solid var(--line); background: none; color: var(--ink); text-align: left; }
  .pkg { font-size: 11px; color: var(--muted); }
  .error { color: var(--goal); }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
  .colhint { font-size: 12px; color: var(--muted); }
</style>
