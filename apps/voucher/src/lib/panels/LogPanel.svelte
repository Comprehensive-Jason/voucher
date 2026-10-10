<script lang="ts">
  // The Log: one Day's earnings and Redemptions, newest first, with the moment
  // the Daily goal was met marked in place. Arrows step through past Days.
  // `compact` is the tablet's side card: one line per entry, no totals.
  import { onMount, untrack } from "svelte";
  import { selection } from "../selection.svelte";
  import { ledger } from "../api";
  import { POLL_MS } from "../live.svelte";
  import { serviceOf, sourceOf } from "../sources";
  import Marker, { type MarkerKind } from "../components/Marker.svelte";
  import { clock, dayLabel, shiftDay } from "../time";
  import type { DaySummary } from "../types";
  import ScrollCue from "../components/ScrollCue.svelte";
  import { fade } from "svelte/transition";
  import { ms } from "../motion";
  import TodayButton from "../components/TodayButton.svelte";
  import { notes } from "../notes.svelte";
  let list = $state<HTMLDivElement>();

  let { compact = false }: { compact?: boolean } = $props();

  /** The Ledger keeps half a year of entries; older Days have totals only. */
  const OLDEST = 183;

  let today = $state<string | null>(null);
  let timeZone = $state("UTC");
  let back = $state(0);
  let shown = $state<DaySummary | null>(null);
  let before = $state<DaySummary | null>(null);
  let error = $state<string | null>(null);

  const day = $derived(today ? shiftDay(today, -back) : null);

  type Row = { time: string; title: string; source: string; color: string; value: string; tone: "earn" | "spend" | "lost" | "goal" | "note"; marker: MarkerKind; at?: string };
  const rows = $derived.by((): Row[] => {
    if (!shown) return [];
    const out: Row[] = [];
    // Markers sit among the entries by time, newest first like them.
    const marks = [...(shown.markers ?? [])].reverse();
    const markRow = (m: (typeof marks)[number]): Row => ({ time: clock(m.at, timeZone), title: m.text, source: m.rule ? "Rule change" : "Marker",
      color: "", value: "", tone: "note", marker: m.rule ? "rule" : "note", at: m.rule ? undefined : m.at });
    for (const e of shown.log) {
      while (marks.length && marks[0].at > e.at) out.push(markRow(marks.shift()!));
      if (shown.goal_met_at && e.at === shown.goal_met_at && e.kind === "earned") {
        // The milestone sits just above the earning that met the goal.
        out.push({ time: clock(e.at, timeZone), title: "Daily goal met", source: `Streak: ${shown.streak} ${shown.streak === 1 ? "day" : "days"}`, color: "var(--goal)", value: "", tone: "goal", marker: "goal" });
      }
      if (e.kind === "earned") {
        const s = sourceOf(e.task);
        // Tasks name the app they were finished in, Todoist or ClickUp.
        const id = e.task.split(":")[0];
        const app = id === "todoist" || id === "clickup" ? serviceOf(id).name : s.name;
        // The compact card has no source line, so every entry names its app.
        const title = compact ? `${app}, ${e.title || "a task"}` : e.title || "A task";
        out.push({ time: clock(e.at, timeZone), title, source: e.kept ? app : `${app} · Bank full, lost`,
          color: s.color, value: e.kept ? "+1" : "+0", tone: e.kept ? "earn" : "lost", marker: e.kept ? "source" : "lost" });
      } else if (e.kind === "gap") {
        const mins = Math.round((new Date(e.until).getTime() - new Date(e.at).getTime()) / 60000);
        out.push({ time: clock(e.at, timeZone), title: `Voucher was off for ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`,
          source: e.device, color: "#ff8a7a", value: "", tone: "lost", marker: "gap" });
      } else {
        out.push({ time: clock(e.at, timeZone), title: `Unlocked ${e.minutes} min · ${e.tickets} ${e.tickets === 1 ? "Voucher" : "Vouchers"}`, source: "All distractions",
          color: "var(--ink)", value: `−${e.tickets}`, tone: "spend", marker: "redeemed" });
      }
    }
    for (const m of marks) out.push(markRow(m));
    return out;
  });

  async function load() {
    try {
      // Asked every time, so the Log moves on when a new Day starts.
      const status = await ledger<{ today: DaySummary; settings: { time_zone: string } }>("GET", "/status");
      today = status.today.day;
      timeZone = status.settings.time_zone;
      const d = day!;
      [shown, before] = await Promise.all([
        ledger<DaySummary>("GET", `/day?date=${d}`),
        ledger<DaySummary>("GET", `/day?date=${shiftDay(d, -1)}`),
      ]);
      error = null;
    } catch (e) {
      error = String(e);
    }
  }

  function step(by: number) {
    back = Math.min(OLDEST, Math.max(0, back + by));
    load();
    share();
  }
  /** The Day this Log moved to, for the other cards (null for today). */
  function share() {
    if (today) selection.set("log", { day: back === 0 ? null : shiftDay(today, -back), picked: false });
  }
  // A Day picked on another card opens here too.
  $effect(() => {
    selection.seq;
    untrack(() => {
      if (selection.from === "log" || !today) return;
      const want = selection.day ?? today;
      const next = Math.min(OLDEST, Math.max(0, Math.round((Date.parse(`${today}T12:00:00Z`) - Date.parse(`${want}T12:00:00Z`)) / 86_400_000)));
      if (next !== back) { back = next; load(); }
    });
  });

  // ---- Adding a Marker ----
  // A dated note for this Day ("new term", "dose up"): now when it's today,
  // midday of a past Day otherwise. Charts draw it as a thin line.
  let writing = $state(false);
  let draft = $state("");
  let saving = $state(false);
  async function saveMarker() {
    const text = draft.trim();
    if (!text || !day) return;
    saving = true;
    try {
      await notes.add(text, back === 0 ? undefined : new Date(`${day}T12:00:00`).toISOString());
      draft = ""; writing = false;
      await load();
    } catch (e) { error = String(e); }
    saving = false;
  }
  async function removeMarker(at: string) {
    await notes.remove(at);
    await load();
  }

  // Today's Log keeps itself current; a past Day doesn't change.
  onMount(() => {
    load();
    const timer = setInterval(() => { if (back === 0) load(); }, POLL_MS);
    return () => clearInterval(timer);
  });
</script>

<div class="log" class:compact>
  <header>
    {#if compact}<span class="cap">Log</span>{:else}<h1>Log</h1>{/if}
    <span class="spacer"></span>
    <button class="add" class:on={writing} aria-label="Add a Marker" title="Add a Marker: a dated note charts show as a line" onclick={() => (writing = !writing)}>
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 21V4M5 4h11l-2.5 4L16 12H5" /></svg>
    </button>
    <TodayButton show={back > 0} onclick={() => { back = 0; load(); share(); }} />
    <div class="switcher">
      <button class="day" aria-label="Previous day" disabled={back >= OLDEST} onclick={() => step(1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
      </button>
      <div class="cap label">{day && today ? dayLabel(day, today) : ""}</div>
      <button class="day" aria-label="Next day" disabled={back === 0} onclick={() => step(-1)}>
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6l6 6-6 6" /></svg>
      </button>
    </div>
  </header>

  {#if error}
    <p class="error">{error}</p>
  {:else if shown}
    {#if !compact}
    <div class="totals">
      <div><div class="cap">Earned</div><div class="mono big earn">+{shown.earned}</div></div>
      <div><div class="cap">Redeemed</div><div class="mono big spend">−{shown.redeemed}</div></div>
      <div><div class="cap">Unlocked</div><div class="mono big">{shown.unlocked_minutes} min</div></div>
    </div>
    {/if}

    {#if writing}
      <form class="write" transition:fade={{ duration: ms("base") }} onsubmit={(e) => { e.preventDefault(); saveMarker(); }}>
        <!-- svelte-ignore a11y_autofocus -->
        <input bind:value={draft} maxlength="200" placeholder={back === 0 ? "What changed? (new term, dose up, …)" : `A note for ${day}`} autofocus />
        <button type="submit" disabled={!draft.trim() || saving}>Add</button>
      </form>
    {/if}
    <div class="frame">
    <ScrollCue target={list} />
    <!-- A different Day's rows fade in, rather than replacing these at once. -->
    {#key day}
    <div class="rows" bind:this={list} in:fade={{ duration: ms("base") }}>
      {#each rows as r}
        <div class="row">
          <span class="mono time">{r.time}</span>
          <span class="dot"><Marker kind={r.marker} color={r.color} /></span>
          <span class="what">
            <span class="title" class:goal={r.tone === "goal"}>{r.title}</span>
            {#if !compact}<span class="src">{r.source}</span>{/if}
          </span>
          {#if r.at}
            <button class="drop" aria-label="Remove this Marker" onclick={() => removeMarker(r.at!)}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
            </button>
          {:else}
            <span class="mono value {r.tone}">{r.value}</span>
          {/if}
        </div>
      {:else}
        <p class="empty">{shown.earned > 0 ? "Only this Day's totals are kept now." : "Nothing earned or unlocked this Day."}</p>
      {/each}
    </div>
    {/key}
    </div>

    {#if before && day && today && !compact}
      <footer>
        <span>{dayLabel(shiftDay(day, -1), today)}: {before.earned} earned, {before.redeemed} redeemed</span>
        <span class="mono" class:met={before.goal_met}>{before.goal_met ? "goal met" : "goal missed"}</span>
      </footer>
    {/if}
  {/if}
</div>

<style>
  .log { display: flex; flex-direction: column; gap: 14px; }
  header { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  h1 { margin: 0; font-size: 26px; font-weight: 700; }
  .switcher { display: flex; align-items: center; }
  .label { color: var(--ink); min-width: 92px; text-align: center; }
  .day { min-width: 44px; min-height: 44px; display: flex; align-items: center; justify-content: center; background: none; border: 0; color: var(--muted); }
  .day:disabled { opacity: .35; }
  .totals { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); border-radius: 16px; background: var(--surface); border: 1px solid var(--line); }
  .totals > div { padding: 12px 14px; display: flex; flex-direction: column; gap: 6px; }
  .totals > div + div { border-left: 1px solid var(--line); }
  .big { font-size: 24px; font-weight: 700; line-height: 1; }
  .earn { color: var(--voucher); }
  /* A Redemption's minus count, in the colour Vouchers spent have everywhere. */
  .spend { color: var(--spend); }
  .spacer { flex: 1; }
  .frame { position: relative; display: flex; flex-direction: column; }
  .rows { position: relative; display: flex; flex-direction: column; }
  .row { display: grid; grid-template-columns: 44px 12px minmax(0, 1fr) auto; gap: 10px; align-items: center; height: 43px; border-bottom: 1px solid var(--divider); }
  .time { font-size: 12px; color: var(--muted); }
  .dot { display: flex; align-items: center; justify-content: center; }
  .what { min-width: 0; }
  .title { display: block; font-size: 14px; font-weight: 500; line-height: 1.25; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
  .title.goal { color: var(--goal); }
  .add { width: 36px; height: 36px; border: 0; border-radius: 10px; background: none; color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; transition: background-color var(--t-base), color var(--t-base); }
  .add.on { background: #2a2140; color: #b69cff; }
  .write { display: flex; gap: 8px; }
  .write input { flex: 1; min-width: 0; height: 38px; padding: 0 12px; border-radius: 10px; border: 1px solid var(--line); background: #1f2226; color: var(--ink); font: 500 14px var(--font); }
  .write input:focus { outline: none; border-color: #b69cff; }
  .write button { height: 38px; padding: 0 14px; border-radius: 10px; border: 0; background: #b69cff; color: #16121f; font: 700 13px var(--font); cursor: pointer; transition: opacity var(--t-base); }
  .write button:disabled { opacity: .4; }
  .drop { width: 28px; height: 28px; border: 0; border-radius: 8px; background: none; color: var(--muted); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .src { display: block; font-size: 12px; line-height: 1.25; color: var(--muted); }
  .value { font-size: 14px; font-weight: 700; }
  .value.lost { color: var(--muted); }
  .empty { color: var(--muted); font-size: 14px; }
  footer { display: flex; justify-content: space-between; align-items: center; font-size: 13px; color: var(--muted); }
  footer .met { color: var(--goal); }
  .error { color: var(--goal); }
  .compact { gap: 2px; }
  /* On the tablet only the rows scroll (and bounce at either end); the
     header sits above them, outside the scrolling part. */
  .compact { flex: 1; height: 100%; min-height: 0; }
  .compact header { flex: none; margin: 0 -12px 0 0; padding: 8px 0 6px; }
  .compact .frame { flex: 1; min-height: 0; }
  .compact .rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; margin-right: -8px; padding-right: 8px; }
  .compact .label { min-width: 0; }
  .compact .row { height: auto; padding: 9px 0; grid-template-columns: 44px 12px minmax(0, 1fr) 28px; }
  .compact .title { font-size: 13px; font-weight: 400; line-height: 1.3; white-space: normal; }
  .compact .value { font-size: 13px; font-weight: 500; text-align: right; }
</style>
