<script lang="ts" module>
  import type { DaySummary as KeptDay } from "../types";
  /** The Log's last look at today, so it reopens filled (back from Rules, say) while it asks again. */
  const kept: { today: string | null; timeZone: string; shown: KeptDay | null } = { today: null, timeZone: "UTC", shown: null };
</script>

<script lang="ts">
  // The Log: one Day's earnings and Unlocks, newest first, with the moment
  // the Daily goal was met marked in place. Arrows step through past Days.
  // One line per entry, each naming its app ("Todoist, Weekly review"), the
  // same on the phone and the tablet. `compact` is the tablet's slot: the
  // card fills it and only the rows scroll.
  import { onMount, untrack } from "svelte";
  import { shownByNotice } from "../health.svelte";
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
  import CardHead from "../components/CardHead.svelte";
  import { notes } from "../notes.svelte";
  let list = $state<HTMLDivElement>();

  let { compact = false }: { compact?: boolean } = $props();

  /** The Ledger keeps half a year of entries; older Days have totals only. */
  const OLDEST = 183;

  let today = $state<string | null>(kept.today);
  let timeZone = $state(kept.timeZone);
  let back = $state(0);
  let shown = $state<DaySummary | null>(kept.shown);
  let error = $state<string | null>(null);

  const day = $derived(today ? shiftDay(today, -back) : null);

  type Row = { time: string; title: string; color: string; value: string; tone: "earn" | "spend" | "lost" | "goal" | "note"; marker: MarkerKind; at?: string };
  const rows = $derived.by((): Row[] => {
    if (!shown) return [];
    const out: Row[] = [];
    // Markers sit among the entries by time, newest first like them.
    const marks = [...(shown.markers ?? [])].reverse();
    const markRow = (m: (typeof marks)[number]): Row => ({ time: clock(m.at, timeZone), title: m.text,
      color: "", value: "", tone: "note", marker: m.rule ? "rule" : "note", at: m.rule ? undefined : m.at });
    for (const e of shown.log) {
      while (marks.length && marks[0].at > e.at) out.push(markRow(marks.shift()!));
      if (shown.goal_met_at && e.at === shown.goal_met_at && e.kind === "earned") {
        // The milestone sits just above the earning that met the goal.
        out.push({ time: clock(e.at, timeZone), title: `Daily goal met · Streak: ${shown.streak} ${shown.streak === 1 ? "Day" : "Days"}`, color: "var(--goal)", value: "", tone: "goal", marker: "goal" });
      }
      if (e.kind === "earned") {
        const s = sourceOf(e.task);
        // Tasks name the app they were finished in, Todoist or ClickUp.
        const id = e.task.split(":")[0];
        const app = id === "todoist" || id === "clickup" ? serviceOf(id).name : s.name;
        // One line per entry, so every entry names its app; a Voucher a full Bank lost says so.
        const title = `${app}, ${e.title || "a task"}${e.kept ? "" : " (Bank full, lost)"}`;
        out.push({ time: clock(e.at, timeZone), title,
          color: s.color, value: e.kept ? "+1" : "+0", tone: e.kept ? "earn" : "lost", marker: e.kept ? "source" : "lost" });
      } else if (e.kind === "gap") {
        const mins = Math.round((new Date(e.until).getTime() - new Date(e.at).getTime()) / 60000);
        out.push({ time: clock(e.at, timeZone), title: `${e.device}, Voucher was off for ${mins >= 60 ? `${Math.floor(mins / 60)} h ${mins % 60} min` : `${mins} min`}`,
          color: "var(--danger)", value: "", tone: "lost", marker: "gap" });
      } else {
        out.push({ time: clock(e.at, timeZone), title: `Unlocked ${e.minutes} min · ${e.tickets} ${e.tickets === 1 ? "Voucher" : "Vouchers"} torn`,
          color: "var(--spend)", value: `−${e.tickets}`, tone: "spend", marker: "redeemed" });
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
      shown = await ledger<DaySummary>("GET", `/day?date=${d}`);
      if (back === 0) Object.assign(kept, { today, timeZone, shown });
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

  // Markers are added from the Marker button beside the status card; the Log
  // lists them among the entries and can remove one written by hand.
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
  <!-- The date switcher is the card's title; the name "Log" is on its tab. -->
  <CardHead title="Log"
    nav={{ label: day && today ? dayLabel(day, today) : "", back: back < OLDEST, forward: back > 0, onback: () => step(1), onforward: () => step(-1) }}
    today={{ show: back > 0, onclick: () => { back = 0; load(); share(); } }} />

  {#if error && !shownByNotice(error)}
    <p class="error">{error}</p>
  {:else if shown}
    <div class="frame">
    <ScrollCue target={list} />
    <!-- A different Day's rows fade in, rather than replacing these at once. -->
    {#key day}
    <div class="rows" bind:this={list} in:fade={{ duration: ms("base") }}>
      {#each rows as r}
        <div class="row">
          <span class="mono time">{r.time}</span>
          <span class="dot"><Marker kind={r.marker} color={r.color} /></span>
          <span class="title" class:goal={r.tone === "goal"}>{r.title}</span>
          {#if r.at}
            <button class="iconbtn small bare drop" aria-label="Remove this Marker" onclick={() => removeMarker(r.at!)}>
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
  {/if}
</div>

<style>
  .log { display: flex; flex-direction: column; gap: 2px; }
  .earn { color: var(--voucher); }
  /* An Unlock's minus count, in the salmon Unlocks and torn Vouchers have everywhere. */
  .spend { color: var(--spend); }
  .frame { position: relative; display: flex; flex-direction: column; }
  .rows { position: relative; display: flex; flex-direction: column; }
  /* One line per entry; a long one wraps rather than being cut off. */
  .row { display: grid; grid-template-columns: 44px 12px minmax(0, 1fr) 32px; gap: 10px; align-items: center; padding: 9px 0; border-bottom: 1px solid var(--divider); }
  .time { font-size: 12px; color: var(--muted); }
  .dot { display: flex; align-items: center; justify-content: center; }
  .title { min-width: 0; font-size: 13px; line-height: 1.3; overflow-wrap: anywhere; }
  .title.goal { color: var(--goal); }
  /* Keeps a Marker's row as tall as the others. */
  .drop { margin: -8px 0; }
  .value { font-size: 13px; font-weight: 500; text-align: right; }
  .value.lost { color: var(--muted); }
  .error { color: var(--goal); }
  /* On the tablet only the rows scroll (and bounce at either end); the
     header sits above them, outside the scrolling part. */
  .compact { flex: 1; height: 100%; min-height: 0; }
  .compact .frame { flex: 1; min-height: 0; }
  .compact .rows { flex: 1; min-height: 0; overflow-y: auto; overscroll-behavior-y: contain; margin-right: -8px; padding-right: 8px; }
</style>
