<script lang="ts">
  // "Try …" on an Insight opens this: the exact rule change, when it starts
  // (a tightening at once, anything else at 06:00, the Daily goal with the
  // next Day), the Days that settle and the Days measured, and when the
  // verdict comes. Starting it is one request ($core/insights/store): the
  // Ledger makes the change as any rule change and writes its Marker in the
  // Experiment's words.
  import Sheet from "$core/components/Sheet.svelte";
  import AboutText from "$core/components/AboutText.svelte";
  import Marker from "$core/components/Marker.svelte";
  import { schedule } from "$core/insights/experiments";
  import { insights } from "$core/insights/store.svelte";
  import { plan, startsWhen, tryTitle } from "$core/insights/text";
  import type { Finding, Suggestion } from "$core/insights/types";
  import { shiftDay } from "$core/time";
  import { actionFailed } from "$core/toast.svelte";

  let { f, s, today, onclose }: { f: Finding; s: Suggestion; today: string; onclose: () => void } = $props();

  // A tightening starts today; the Daily goal, and anything else, with the next Day.
  const starts = $derived(s.tightens && s.rule !== "Daily goal" ? today : shiftDay(today, 1));
  const days = $derived(plan(s, schedule(starts), today));
  let busy = $state(false);

  /** Curfew on an 18:00 to 06:00 strip: the night now, and what the change adds. */
  const curfewStrip = $derived.by(() => {
    if (s.rule !== "Curfew") return null;
    const m = (t: string) => { const [h, mm] = t.split(":").map(Number); return h * 60 + mm; };
    const x = (min: number) => ((((min - 18 * 60) % 1440) + 1440) % 1440) / (12 * 60);
    return { was: x(m(s.was.slice(0, 5))), now: x(m(s.now.slice(0, 5))) };
  });

  async function start(e: Event) {
    busy = true;
    try {
      await insights.start(s, f.id);
      onclose();
    } catch (err) {
      actionFailed(err, "The Ledger didn't start it. Another Experiment may be running.", e.currentTarget as Element);
    } finally { busy = false; }
  }
</script>

<Sheet {onclose} label="try-h">
  <span class="cap exp"><Marker kind="rule" color="var(--marker)" size={12} />Experiment, two weeks</span>
  <h2 id="try-h">{tryTitle(s)}</h2>
  <p class="why"><AboutText parts={f.sentence} />{#if f.pill}{" "}({f.pill.text}){/if}. Before and after will say whether this helped.</p>
  <div class="change">
    <span class="cap">The rule change</span>
    <div class="line"><span class="name">{s.rule}</span><span class="was">{s.was}</span><span class="now">{s.now}</span></div>
    {#if curfewStrip}
      <svg class="strip" viewBox="0 0 300 30" aria-hidden="true">
        <rect x="0" y="2" width="300" height="14" rx="3" fill="var(--well)" />
        <rect x={curfewStrip.was * 300} y="2" width={300 - curfewStrip.was * 300} height="14" fill="var(--night-band)" />
        <rect x={curfewStrip.was * 300} y="2" width={300 - curfewStrip.was * 300} height="2" fill="var(--night)" />
        {#if curfewStrip.now < curfewStrip.was}
          <rect x={curfewStrip.now * 300} y="2" width={(curfewStrip.was - curfewStrip.now) * 300} height="14" fill="color-mix(in srgb, var(--night) 30%, transparent)" />
          <rect x={curfewStrip.now * 300} y="2" width={(curfewStrip.was - curfewStrip.now) * 300} height="2" fill="var(--night)" />
        {/if}
        <text x="0" y="29" text-anchor="start">18:00</text>
        <text x={curfewStrip.now * 300} y="29" text-anchor="end" style="fill: var(--night)">{s.now.slice(0, 5)}</text>
        <text x={curfewStrip.was * 300 + 3} y="29" text-anchor="start">{s.was.slice(0, 5)}</text>
        <text x="300" y="29" text-anchor="end">06:00</text>
      </svg>
    {/if}
    <span class="applies" class:waits={!s.tightens || s.rule === "Daily goal"}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5 9-10" /></svg>
      {startsWhen(s, s.now.slice(0, 5))}
    </span>
  </div>
  <div class="points">
    <p>A Marker, <AboutText parts={[{ text: days.marker, hue: "marker" }]} />, goes on {starts === today ? "today" : "with the next Day"}.</p>
    <p><b>{days.settle[0]}</b> to <b>{days.settle[1]}</b> settle in. <b>{days.measured[0]}</b> to <b>{days.measured[1]}</b> are compared with the 14 Days before.</p>
    <p>The verdict comes on <b>{days.verdict}</b>, in one notification.</p>
    <p>{days.ending}</p>
  </div>
  <div class="actions">
    <button class="btn ghost" onclick={onclose}>Not now</button>
    <button class="btn primary" disabled={busy} onclick={start}>Start the experiment</button>
  </div>
</Sheet>

<style>
  .exp { color: var(--marker); display: flex; align-items: center; gap: 7px; }
  .why { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--muted); }
  .why :global(.hue) { color: var(--ink); }
  .change { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; border-radius: 14px; background: var(--raised); }
  .line { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; font-size: 15px; }
  .name { font-weight: 700; }
  .was { font: 500 13px var(--mono); color: var(--faint); text-decoration: line-through; text-decoration-color: var(--line-strong); }
  .now { font: 700 15px var(--mono); color: var(--ink); }
  .strip { display: block; width: 100%; height: auto; overflow: visible; }
  .strip text { font: 500 9px var(--mono); fill: var(--faint); }
  .applies { display: flex; align-items: center; gap: 6px; font-size: 12.5px; color: var(--voucher); }
  .applies.waits { color: var(--goal); }
  .points { display: flex; flex-direction: column; gap: 6px; }
  .points p { position: relative; margin: 0; padding-left: 13px; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .points p::before { content: ""; position: absolute; left: 2px; top: .66em; width: 4px; height: 4px; border-radius: 50%; background: var(--muted); }
  .points b { color: var(--ink); font-family: var(--mono); font-weight: 600; }
  .actions { display: grid; grid-template-columns: auto 1fr; gap: 10px; margin-top: 2px; }
</style>
