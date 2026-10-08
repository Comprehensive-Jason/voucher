<script lang="ts">
  // Rules, Sources: what earns Vouchers, and how fast. Every source is a group
  // with one counter: Tasks, Workout, Steps, and named groups of apps whose
  // time adds up. Switching a source off or slowing it applies now; switching
  // on, speeding up, or adding waits for 06:00.
  import { onMount } from "svelte";
  import { ledger, RULES_CHANGED } from "../api";
  import RuleSlider from "../components/RuleSlider.svelte";
  import Switch from "../components/Switch.svelte";
  import TokenSheet from "../components/TokenSheet.svelte";
  import ColorSheet from "../components/ColorSheet.svelte";
  import { defaultColorOf, needsToken, serviceOf, styleOf } from "../sources";
  import { hhmm, until } from "../rules";
  import type { Source, SourceKind, Status } from "../types";

  let status = $state<Status | null>(null);
  let error = $state<string | null>(null);
  let reconnecting = $state<string | null>(null);
  let note = $state<string | null>(null);
  /** The source whose colour is being picked. */
  let coloring = $state<string | null>(null);
  /** The rate a source's knob is snapped to while dragging, shown greyed. */
  let ratePreview = $state<Record<string, number | null>>({});
  async function setColor(id: string, color: string | null) {
    coloring = null;
    try { await ledger("POST", "/change", { SourceColor: { id, color } }); await load(); } catch (e) { error = String(e); }
  }

  // Rate ranges: tasks, minutes, or steps per Voucher.
  const RANGE: Record<SourceKind, { min: number; max: number; step: number }> = {
    tasks: { min: 1, max: 5, step: 1 },
    workout: { min: 5, max: 30, step: 5 },
    focus: { min: 10, max: 120, step: 5 },
    steps: { min: 500, max: 10000, step: 500 },
  };
  // Tasks, Workout, and Steps first, then groups of apps by name.
  const FIRST = ["tasks", "workout", "steps", "obsidian", "reading", "anki"];
  const rank = (id: string) => (FIRST.includes(id) ? FIRST.indexOf(id) : FIRST.length);
  const groups = $derived(status ? Object.entries(status.settings.sources)
    .sort(([a, x], [b, y]) => rank(a) - rank(b) || (x.name || a).localeCompare(y.name || b)) : []);
  /** New groups waiting for the morning, which the Ledger doesn't list yet. */
  const comingUp = $derived((status?.pending ?? []).filter(([c]) => (c as any).AddSource)
    .map(([c, at]) => ({ id: (c as any).AddSource.id as string, source: (c as any).AddSource.source as Source, at })));

  /** "Readwise Reader, Moon+ Reader Pro +1": what a group counts. */
  function members(s: Source): string {
    if (s.kind === "workout") return "Heart rate zones";
    if (s.kind === "steps") return "Health Connect";
    const names = [...new Set(s.packages.map((p) => s.labels?.[p] ?? p.replace(/^win:/, "")))];
    if (!names.length) return "Nothing yet";
    return names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
  }
  function rate(kind: SourceKind, every: number) {
    if (kind === "tasks") return every === 1 ? "1 per task" : `1 per ${every} tasks`;
    if (kind === "steps") return `1 per ${every.toLocaleString("en-US")} steps`;
    if (kind === "workout") return `1 per ${every} zone min`;
    return `1 per ${every} min`;
  }
  function pendingFor(id: string): { on: boolean; every: number; at: string } | null {
    const hit = status?.pending.find(([c]) => (c as any).Source?.id === id);
    return hit ? { ...(hit[0] as any).Source, at: hit[1] } : null;
  }
  /** The task services in this group that need a new token. */
  const brokenServices = (s: Source) => s.kind === "tasks" ? s.packages.filter((p) => needsToken(status?.source_errors[p])) : [];
  function problemOf(s: Source): string | null {
    if (s.kind !== "tasks") return null;
    for (const p of s.packages) {
      const problem = status?.source_errors[p];
      if (problem) return `${serviceOf(p).name}: ${needsToken(problem) ? `${problem}, not counting` : `${problem}, retrying`}`;
    }
    return null;
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
  /** Higher is stricter and applies now; lower waits for 06:00. */
  async function maxHeartRate(bpm: number) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { MaxHeartRate: bpm });
      note = effect === "Now" ? "Applied now." : `Waits for ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { error = String(e); }
  }

  onMount(() => {
    load();
    // Reload when a change is made anywhere on Rules.
    window.addEventListener(RULES_CHANGED, load);
    return () => window.removeEventListener(RULES_CHANGED, load);
  });

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
</script>

<div class="panel">
  {#if heading}<div class="colhead"><span class="coltitle">Sources</span><span class="colhint">On or faster waits for {status ? hhmm(status.settings.morning_boundary) : "06:00"}</span></div>{/if}
  {#if error}<p class="error">{error}</p>{/if}

  {#if status}
    {#each groups as [id, s] (id)}
      {@const style = styleOf(id)}
      {@const problem = problemOf(s)}
      {@const broken = brokenServices(s)}
      {@const waiting = pendingFor(id)}
      <div class="card">
        <div class="line">
          <button class="dot" style="background: {style.color}" aria-label="{style.name} colour" onclick={() => (coloring = id)}></button>
          <a class="open" href="/rules/sources/group?id={encodeURIComponent(id)}" aria-label="Edit {style.name}">
            <span class="label">
              <span class="name" class:off={!s.on}>{style.name}</span>
              <span class="sub" class:warn={!!problem}>{problem ?? (s.on ? members(s) : `Off · ${members(s)}`)}</span>
            </span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
          </a>
          <Switch on={s.on} label="{style.name} {s.on ? 'on' : 'off'}" onchange={(on) => set(id, on, s.every)} />
        </div>
        {#if s.on && (s.kind !== "tasks" || broken.length < s.packages.length)}
          <div class="rate">
            <div class="mono rtext" class:preview={ratePreview[id] != null && ratePreview[id] !== s.every}>{rate(s.kind, ratePreview[id] ?? s.every)}</div>
            <RuleSlider small strict="right" {...RANGE[s.kind]} value={s.every} onpreview={(v) => (ratePreview[id] = v)}
              pending={waiting && waiting.on ? waiting.every : null} onchange={(v) => set(id, true, v)} />
          </div>
        {/if}
        {#if s.kind === "workout" && s.on}
          {@const hr = s.max_heart_rate ?? 195}
          <div class="hr">
            <span class="hrlabel">Max heart rate</span>
            <button class="step" aria-label="Lower maximum heart rate" onclick={() => maxHeartRate(hr - 1)}>−</button>
            <span class="mono hrval">{hr}</span>
            <button class="step" aria-label="Higher maximum heart rate" onclick={() => maxHeartRate(hr + 1)}>+</button>
          </div>
        {/if}
        {#if waiting}
          <div class="waiting">{waiting.on ? (s.on ? `${rate(s.kind, waiting.every)}` : "On") : "Off"} at {hhmm(status.settings.morning_boundary)}, {until(waiting.at)}</div>
        {/if}
        {#each broken as service}
          <button class="reconnect" onclick={() => (reconnecting = service)}>Reconnect {serviceOf(service).name}</button>
        {/each}
      </div>
    {/each}
    {#each comingUp as g (g.id)}
      <div class="card coming">
        <div class="line">
          <span class="dot static" style="background: {g.source.color ?? defaultColorOf(g.id)}"></span>
          <span class="label">
            <span class="name">{g.source.name}</span>
            <span class="sub warn">Starts at {hhmm(status.settings.morning_boundary)}, {until(g.at)} · {members(g.source)}</span>
          </span>
        </div>
      </div>
    {/each}
    <a class="new" href="/rules/sources/group">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>New source
    </a>
    <div class="foot">Tap a source to rename it or change its apps. Off or slower applies now. On, faster, or new waits for {hhmm(status.settings.morning_boundary)}.</div>
    {#if note}<div class="foot">{note}</div>{/if}
  {/if}
</div>

{#if reconnecting}
  <TokenSheet source={reconnecting} onclose={() => (reconnecting = null)}
    onsaved={() => { note = "Token saved. It counts again from the next check, within 5 minutes."; reconnecting = null; load(); }} />
{/if}

{#if coloring && status}
  {@const style = styleOf(coloring)}
  <ColorSheet title="{style.name} colour" current={style.color} fallback={defaultColorOf(coloring)}
    onpick={(c) => setColor(coloring!, c)} onclose={() => (coloring = null)} />
{/if}

<style>
  .panel { display: flex; flex-direction: column; gap: 10px; }
  .card { border-radius: 14px; background: var(--surface); border: 1px solid var(--line); padding: 8px 14px; display: flex; flex-direction: column; gap: 6px; }
  .card.coming { border-style: dashed; background: none; }
  .line { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; }
  /* The colour dot opens the colour picker; its tap area is bigger than it looks. */
  .dot { width: 14px; height: 14px; border-radius: 4px; flex-shrink: 0; border: 0; padding: 0; cursor: pointer; box-shadow: 0 0 0 7px transparent; }
  .dot.static { cursor: default; }
  .dot:focus-visible { outline: 2px solid var(--voucher); outline-offset: 3px; }
  .label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 2px; }
  .name { font-size: 15px; font-weight: 700; }
  .name.off { color: var(--muted); }
  .sub { font-size: 12px; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .sub.warn { color: var(--goal); }
  .rate { display: grid; grid-template-columns: minmax(110px, max-content) 1fr; gap: 12px; align-items: center; }
  .rtext { font-size: 13px; font-weight: 700; white-space: nowrap; }
  .rtext.preview { color: var(--muted); }
  .hr { display: flex; align-items: center; gap: 10px; font-size: 13px; }
  .hrlabel { flex: 1; color: var(--muted); }
  .hrval { min-width: 36px; text-align: center; font-weight: 700; }
  .step { width: 32px; height: 32px; border-radius: 10px; border: 1px solid var(--line); background: none; color: var(--ink); font: 700 16px var(--font); }
  .waiting { font-size: 12px; color: var(--goal); }
  .reconnect { height: 32px; border-radius: 10px; border: 1px solid var(--goal-line); background: var(--goal-bg); color: var(--goal); font: 700 13px var(--font); }
  .new { min-height: 48px; border-radius: 14px; border: 2px dashed #3a3f45; color: var(--ink); font: 700 14px var(--font); display: flex; align-items: center; justify-content: center; gap: 8px; text-decoration: none; }
  .foot { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .error { color: var(--goal); }
  .colhead { display: flex; justify-content: space-between; align-items: baseline; height: 24px; }
  .coltitle { font-size: 18px; font-weight: 700; line-height: 24px; }
  .colhint { font-size: 12px; color: var(--muted); }
</style>
