<script lang="ts">
  // Rules, Sources: what earns Vouchers, and how fast. Every source is a group
  // with one counter: Tasks, Workout, Steps, and named groups of apps whose
  // time adds up. Switching a source off or slowing it applies now; switching
  // on, speeding up, or adding waits for 06:00. Under them, Calendars: which
  // calendars count toward each Day's events and busy time (for Trends,
  // never for earning), chosen in CalendarSheet.
  import { shownByNotice } from "$core/health.svelte";
  import { actionFailed } from "$core/toast.svelte";
  import { onMount } from "svelte";
  import { sheet } from "$core/sheet.svelte";
  import { ledger, plannedToday, RULES_CHANGED, sameAnswer, statusNow } from "$core/api";
  import RuleSlider from "../components/RuleSlider.svelte";
  import Switch from "$core/components/Switch.svelte";
  import RulesColumn from "../components/RulesColumn.svelte";
  import RulesCard from "../components/RulesCard.svelte";
  import TokenSheet from "../components/TokenSheet.svelte";
  import ColorSheet from "../components/ColorSheet.svelte";
  import CalendarSheet from "../components/CalendarSheet.svelte";
  import { RATE_RANGE, compareSources, defaultColorOf, memberName, needsToken, rateText, serviceOf, styleOf } from "$core/sources";
  import { hhmm, until } from "../rules";
  import { andList, tokenAction, tokenPending, type TokenNeed } from "../tokens.svelte";
  import type { Source, SourceKind, Status } from "$core/types";

  let status = $state<Status | null>(statusNow());
  let error = $state<string | null>(null);
  /** The task services the open token sheet asks for, as they were when it opened. */
  let reconnecting = $state<TokenNeed[] | null>(null);
  let note = $state<string | null>(null);
  /** The source whose color is being picked. */
  let coloring = $state<string | null>(null);
  /** Its color dot, for a message if the Ledger turns the color down. */
  let colorDot: Element | null = null;
  /** Whether the calendar sheet is open. */
  let choosingCalendars = $state(false);
  const calendars = $derived(status?.calendars ?? { device: null, calendars: [] });
  /** "3 calendars, reported by SM-S928U-4f2a", or what they're for. */
  const calendarLine = $derived(calendars.calendars.length
    ? `${calendars.calendars.length} calendar${calendars.calendars.length === 1 ? "" : "s"}, reported by ${calendars.device}`
    : "None chosen. Events and busy time per Day, for Trends");
  /** The rate a source's knob is snapped to while dragging, shown greyed. */
  let ratePreview = $state<Record<string, number | null>>({});
  async function setColor(id: string, color: string | null) {
    coloring = null;
    try { await ledger("POST", "/change", { SourceColor: { id, color } }); await load(); } catch (e) { actionFailed(e, "The Ledger turned this color down.", colorDot); }
  }

  const RANGE = RATE_RANGE;
  // Tasks, Workout, and Steps first, then groups of apps by name (compareSources).
  const groups = $derived(status ? Object.entries(status.settings.sources)
    .sort(([a, x], [b, y]) => compareSources({ id: a, name: x.name || a }, { id: b, name: y.name || b })) : []);
  /** New groups waiting for the morning, which the Ledger doesn't list yet. */
  const comingUp = $derived((status?.pending ?? []).filter(([c]) => (c as any).AddSource)
    .map(([c, at]) => ({ id: (c as any).AddSource.id as string, source: (c as any).AddSource.source as Source, at })));

  /** "Readwise Reader, Moon+ Reader Pro +1": what a group counts. */
  function members(s: Source): string {
    if (s.kind === "workout") return "Heart rate zones";
    if (s.kind === "steps") return "Health Connect";
    const names = [...new Set(s.packages.map((p) => memberName(p, s.labels)))];
    if (!names.length) return "Nothing yet";
    const list = names.length > 3 ? `${names.slice(0, 3).join(", ")} +${names.length - 3}` : names.join(", ");
    // Tasks also reads Todoist's time blocks (a due time and a duration), for Trends.
    const blocks = s.kind === "tasks" ? plannedToday(status) : 0;
    return blocks ? `${list} · ${blocks} time block${blocks === 1 ? "" : "s"} today` : list;
  }
  const rate = rateText;
  function pendingFor(id: string): { on: boolean; every: number; at: string } | null {
    const hit = status?.pending.find(([c]) => (c as any).Source?.id === id);
    return hit ? { ...(hit[0] as any).Source, at: hit[1] } : null;
  }
  /** The task services in this group that need a new token (not one just saved here), and why. */
  const brokenServices = (s: Source): TokenNeed[] => s.kind === "tasks"
    ? s.packages.filter((p) => needsToken(status?.source_errors[p]) && !tokenPending(p)).map((p) => ({ service: p, problem: status!.source_errors[p] }))
    : [];
  function problemOf(s: Source): string | null {
    if (s.kind !== "tasks") return null;
    // Every broken service is named; services with the same problem share one clause.
    const byText = new Map<string, string[]>();
    for (const p of s.packages) {
      const problem = status?.source_errors[p];
      if (!problem) continue;
      const text = needsToken(problem) && tokenPending(p) ? "token saved, checking soon" : needsToken(problem) ? `${problem}, not counting` : `${problem}, retrying`;
      byText.set(text, [...(byText.get(text) ?? []), serviceOf(p).name]);
    }
    return byText.size ? [...byText].map(([text, names]) => `${names.join(" and ")}: ${text}`).join("; ") : null;
  }

  async function load() {
    try { { const s = await ledger<Status>("GET", "/status"); if (!sameAnswer(s, status)) status = s; } error = null; } catch (e) { error = String(e); }
  }
  async function set(id: string, on: boolean, every: number) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { Source: { id, on, every } });
      note = effect === "Now" ? "Applied now." : `Waits for ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { actionFailed(e, "The Ledger turned this change down."); }
  }
  /** Higher is stricter and applies now; lower waits for 06:00. */
  async function maxHeartRate(bpm: number) {
    try {
      const effect = await ledger<"Now" | { At: string }>("POST", "/change", { MaxHeartRate: bpm });
      note = effect === "Now" ? "Applied now." : `Waits for ${hhmm(status!.settings.morning_boundary)}.`;
      await load();
    } catch (e) { actionFailed(e, "The Ledger turned this change down."); }
  }

  onMount(() => {
    // Fresh answers once the page has slid in (lib/sheet.svelte.ts).
    const cancel = sheet.afterSlide(load);
    // Reload when a change is made anywhere on Rules.
    window.addEventListener(RULES_CHANGED, load);
    return () => { cancel(); window.removeEventListener(RULES_CHANGED, load); };
  });

  /** On the tablet each panel is a column with its own heading. */
  let { heading = false }: { heading?: boolean } = $props();
</script>

<RulesColumn title="Sources" count={status ? `${groups.filter(([, s]) => s.on).length} on` : undefined} column={heading}>
  {#if error && !shownByNotice(error)}<p class="error">{error}</p>{/if}

  {#if status}
    {#each groups as [id, s] (id)}
      {@const style = styleOf(id)}
      {@const problem = problemOf(s)}
      {@const broken = brokenServices(s)}
      {@const waiting = pendingFor(id)}
      <RulesCard>
        <div class="line">
          <button class="dot pressdim" style="background: {style.color}" aria-label="{style.name} color" onclick={(e) => { coloring = id; colorDot = e.currentTarget; }}></button>
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
            <button class="iconbtn small" aria-label="Lower maximum heart rate" onclick={() => maxHeartRate(hr - 1)}>−</button>
            <span class="mono hrval">{hr}</span>
            <button class="iconbtn small" aria-label="Higher maximum heart rate" onclick={() => maxHeartRate(hr + 1)}>+</button>
          </div>
        {/if}
        {#if waiting}
          <div class="waiting">{waiting.on ? (s.on ? `${rate(s.kind, waiting.every)}` : "On") : "Off"} at {hhmm(status.settings.morning_boundary)}, {until(waiting.at)}</div>
        {/if}
        {#if broken.length}
          <button class="btn small" aria-label="{tokenAction(broken)} {andList(broken.map((b) => serviceOf(b.service).name))}" onclick={() => (reconnecting = broken)}>{tokenAction(broken)}</button>
        {/if}
      </RulesCard>
    {/each}
    {#each comingUp as g (g.id)}
      <RulesCard tone="coming" row>
        <span class="dot static" style="background: {g.source.color ?? defaultColorOf(g.id)}"></span>
        <span class="label">
          <span class="name">{g.source.name}</span>
          <span class="sub warn">Starts at {hhmm(status.settings.morning_boundary)}, {until(g.at)} · {members(g.source)}</span>
        </span>
      </RulesCard>
    {/each}
    <a class="btn wide" href="/rules/sources/group">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14" /></svg>New source
    </a>
    <div class="footnote">Off or slower: now. On, faster, or new: at {hhmm(status.settings.morning_boundary)}.</div>
    {#if note}<div class="footnote">{note}</div>{/if}
    <RulesCard>
      <div class="line">
        <svg class="calicon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--muted)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15.5" rx="3" /><path d="M3.5 10h17M8 3v4M16 3v4" /></svg>
        <span class="label">
          <span class="name">Calendars</span>
          <span class="sub">{calendarLine}</span>
        </span>
      </div>
      <button class="btn small calbtn" onclick={() => (choosingCalendars = true)}>Choose calendars</button>
    </RulesCard>
  {/if}
</RulesColumn>

{#if reconnecting}
  <TokenSheet services={reconnecting} onclose={() => (reconnecting = null)}
    onsaved={(saved, done) => { note = `${saved.length > 1 ? "Tokens" : "Token"} saved. Tasks count again from the next check, within 5 minutes.`; if (done) reconnecting = null; load(); }} />
{/if}

{#if choosingCalendars}
  <CalendarSheet choice={calendars} onclose={() => (choosingCalendars = false)}
    onsaved={() => { choosingCalendars = false; load(); }} />
{/if}

{#if coloring && status}
  {@const style = styleOf(coloring)}
  <ColorSheet title="{style.name} color" current={style.color} fallback={defaultColorOf(coloring)}
    onpick={(c) => setColor(coloring!, c)} onclose={() => (coloring = null)} />
{/if}

<style>
  .line { display: flex; align-items: center; gap: 10px; min-height: 40px; }
  .open { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; color: var(--ink); text-decoration: none; }
  /* The color dot opens the color picker; its tap area is bigger than it looks. */
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
  .hr .iconbtn { font: 700 16px var(--font); }
  .waiting { font-size: 12px; color: var(--goal); }
  /* The shared .btn, as a link. */
  a.btn { text-decoration: none; }
  .calicon { flex: none; }
  .calbtn { align-self: flex-start; }
  .footnote { font-size: 12px; color: var(--muted); line-height: 1.4; }
  .error { margin: 0; color: var(--danger-text); }
</style>
