<script lang="ts">
  // One-tap Markers for life events ("Sick", "New term"), so Before and after
  // can compare the Days either side of them. A tap adds a Marker for now,
  // which the Ledger files under today's Day; the chip then shows a check and
  // tapping it again takes the Marker back. "Other…" opens a small field for anything else. A
  // Marker already written today (here, in the Log, or on another device) shows
  // as added too. Looks like the "Why now?" chips (ReasonChips); a darker
  // surface can tint them with --chip-bg, --chip-line, and --chip-ink.
  import { fade } from "svelte/transition";
  import { SvelteMap } from "svelte/reactivity";
  import { ms } from "../motion";
  import { MARKER_CHOICES, dayNow, notes } from "../notes.svelte";

  let { choices = MARKER_CHOICES }: { choices?: string[] } = $props();

  const key = (text: string) => text.trim().toLowerCase();
  /** Taps still on their way to the Ledger, shown as added meanwhile: key to words. */
  const sending = new SvelteMap<string, string>();
  let failed = $state(false);
  let writing = $state(false);
  let draft = $state("");

  $effect(() => { notes.load(); });

  /** Today's hand-written Markers, by key, and their own words. */
  const mine = $derived(notes.on(dayNow()).filter((m) => !m.rule));
  const today = $derived(new Map(mine.map((m) => [key(m.text), m.text])));
  const added = (text: string) => today.has(key(text)) || sending.has(key(text));
  /** Today's Markers that aren't one of the choices: "Other…" entries, and any from the Log. */
  const others = $derived([...new Map([...today, ...sending])].filter(([k]) => !choices.some((c) => key(c) === k)).map(([, text]) => text));

  async function add(text: string) {
    text = text.trim();
    if (!text || added(text)) return;
    failed = false;
    sending.set(key(text), text);
    try { await notes.add(text); } catch { failed = true; }
    sending.delete(key(text));
  }

  /** Takes a tapped choice back: removes today's Markers with those words. */
  async function undo(text: string) {
    if (sending.has(key(text))) return;
    failed = false;
    try { for (const m of mine.filter((m) => key(m.text) === key(text))) await notes.remove(m.at); } catch { failed = true; }
  }
  const toggle = (text: string) => (added(text) ? undo(text) : add(text));

  /** Saves "Other…"; if the Ledger can't be reached, the words come back to try again. */
  async function save() {
    const text = draft.trim();
    if (!text) return;
    draft = ""; writing = false;
    await add(text);
    if (failed) { draft = text; writing = true; }
  }
</script>

{#snippet check()}
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
{/snippet}

<div class="markerchips">
  <div class="chips">
    {#each choices as c (c)}
      {@const on = added(c)}
      <button class:on aria-pressed={on} title={on ? "Tap again to take it back" : undefined} onclick={() => toggle(c)}>{#if on}{@render check()}{/if}{c}</button>
    {/each}
    {#each others as text (text)}
      <button class="on other" aria-pressed="true" title="{text}: tap again to take it back" onclick={() => undo(text)}>{@render check()}<span>{text}</span></button>
    {/each}
    {#if !writing}
      <button onclick={() => (writing = true)}>Other…</button>
    {/if}
  </div>
  {#if writing}
    <form class="write" in:fade={{ duration: ms("base") }} onsubmit={(e) => { e.preventDefault(); save(); }}>
      <!-- svelte-ignore a11y_autofocus -->
      <input bind:value={draft} maxlength="200" placeholder="What changed?" aria-label="A Marker for today" autofocus
        onkeydown={(e) => { if (e.key === "Escape") { e.stopPropagation(); writing = false; draft = ""; } }} />
      <button class="btn small" type="submit" disabled={!draft.trim()}>Save</button>
    </form>
  {/if}
  {#if failed}<p class="failed" in:fade={{ duration: ms("base") }}>Couldn't reach the Ledger; tap it again.</p>{/if}
</div>

<style>
  .markerchips { display: flex; flex-direction: column; gap: 8px; }
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  /* The "Why now?" chips' shape (ReasonChips); added ones fill with the Markers' cream. */
  .chips button { display: inline-flex; align-items: center; gap: 5px; max-width: 100%; height: 32px; padding: 0 12px; border-radius: 999px; border: 1px solid var(--chip-line, var(--line)); background: var(--chip-bg, var(--raised)); color: var(--chip-ink, var(--ink)); font: 600 13px var(--font); cursor: pointer; transition: background-color var(--t-base), color var(--t-base), border-color var(--t-base), scale var(--t-quick) var(--ease-out); }
  .chips button:active:not(:disabled) { scale: .94; }
  .chips button.on { background: var(--marker); border-color: var(--marker); color: var(--ground); cursor: default; }
  .chips button svg { flex: none; }
  .other span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .write { display: flex; gap: 8px; }
  .write input { flex: 1; min-width: 0; height: 34px; padding: 0 12px; border-radius: 11px; border: 1px solid var(--chip-line, var(--line)); background: var(--chip-bg, var(--raised)); color: var(--ink); font: 500 14px var(--font); }
  .write input:focus { outline: none; border-color: var(--marker); }
  .write .btn { background: var(--chip-bg, var(--raised)); border-color: var(--chip-line, var(--line)); }
  .failed { margin: 0; font-size: 12.5px; color: var(--goal); }
</style>
