<script lang="ts">
  // What a finding rests on, from tapping its row: its sentence, a bigger
  // picture with its labels, the numbers behind it, and how sure. A
  // correlation is drawn on What goes with a good Day's ratio scale
  // ($core/panels/trends/goodDayAxes.ts): Days without, hollow, at ×1, and
  // Days with, filled, with how many Days each side has. Records and lapses
  // are counts, so they have no bars. A suggestion's "Try" and a judged
  // Experiment's Keep it and Go back are here too, where the app allows them.
  import Sheet from "../components/Sheet.svelte";
  import AboutText from "../components/AboutText.svelte";
  import { scaleFor } from "../panels/trends/goodDayAxes";
  import Bars from "./Bars.svelte";
  import Pill from "./Pill.svelte";
  import Visual from "./Visual.svelte";
  import type { Experiment, Finding } from "./types";

  let { f, experiment, onclose, ontry, ondecide }: {
    f: Finding;
    /** The judged Experiment a verdict finding is about. */
    experiment?: Experiment;
    onclose: () => void;
    ontry?: (f: Finding) => void;
    ondecide?: (e: Experiment, keep: boolean) => void;
  } = $props();

  const KIND: Record<Finding["kind"], string> = { correlation: "Goes together", shift: "This week", planned: "Planned time", pattern: "Keeps happening", verdict: "Before and after", record: "Record", lapse: "Lapse" };
  let width = $state(0);
  const t = $derived(f.proof.tested);
  const scale = $derived(t ? scaleFor([t], Math.max(120, width)) : null);
  const at = $derived(t && scale ? scale.at(t) : null);
  const show = (v: number) => (t?.unit === "vouchers" ? v.toFixed(1) : `${Math.round(v)}${t?.unit === "percent" ? "%" : " min"}`);
  const noun = $derived(t?.per === "stretch" ? "stretches" : "Days");
</script>

<Sheet {onclose} label="proof-h">
  <span class="cap kind">{experiment ? "Experiment's verdict" : KIND[f.kind]}</span>
  <h2 id="proof-h"><AboutText parts={f.sentence} /></h2>
  <div class="head">
    {#if f.pill}<Pill text={f.pill.text} tone={f.pill.tone} />{/if}
    {#if f.confidence}<Bars level={f.confidence} />{/if}
  </div>

  <div class="picture" bind:clientWidth={width}>
    {#if t && scale && at}
      <div class="axis">{#each scale.axis.ticks as tick, i (i)}{#if tick.text}<span style="left: {tick.at * 100}%" class:first={tick.at < 0.02} class:last={tick.at > 0.98}>{tick.text}</span>{/if}{/each}</div>
      <div class="track">
        {#each scale.grid as g, i (i)}<i class="grid" class:zero={Math.abs(g - scale.zero) < 1e-6} style="left: {g * 100}%"></i>{/each}
        <span class="line" class:worse={f.pill?.tone === "worse"} style="left: {Math.min(at[0], at[1]) * 100}%; width: {Math.abs(at[1] - at[0]) * 100}%"></span>
        <span class="dot hollow" style="left: {at[0] * 100}%; border-color: {t.color}"></span>
        <span class="dot" style="left: {Math.min(1, Math.max(0, at[1])) * 100}%; background: {t.color}"></span>
        <span class="label was" style="left: {at[0] * 100}%">{show(t.withoutAvg)}</span>
        <span class="label" style="left: {Math.min(1, Math.max(0, at[1])) * 100}%">{show(t.withAvg)}</span>
      </div>
      <div class="split" aria-label="{t.withoutN} {noun} without, {t.withN} with">
        <span class="side"><i class="ring" style="border-color: {t.color}"></i>{t.withoutN} {noun} without</span>
        <span class="sbar"><i class="without" style="flex: {t.withoutN}"></i><i class="with" style="flex: {t.withN}; background: {t.color}"></i></span>
        <span class="side"><i class="disc" style="background: {t.color}"></i>{t.withN} with</span>
      </div>
    {:else if width}
      <Visual v={f.proof.big ?? f.visual} w={width} h={96} big axis={f.proof.big?.axis} />
    {/if}
  </div>

  {#if experiment?.verdict}<p class="verdict"><b>{experiment.verdict.title}.</b> {experiment.verdict.text}</p>{/if}
  <dl class="facts">
    {#each f.proof.facts as [label, value], i (i)}<dt>{label}</dt><dd>{value}</dd>{/each}
  </dl>
  {#if f.proof.note}<p class="note">{f.proof.note}</p>{/if}

  <div class="actions">
    {#if experiment && ondecide}
      <button class="btn ghost" onclick={() => ondecide(experiment, false)}>{experiment.verdict?.back ?? "Go back"}</button>
      <button class="btn primary" onclick={() => ondecide(experiment, true)}>Keep it</button>
    {:else if f.suggestion && ontry}
      <button class="btn ghost" onclick={onclose}>Close</button>
      <button class="btn primary" onclick={() => ontry(f)}>{f.suggestion.button}</button>
    {:else}
      <button class="btn ghost" onclick={onclose}>Close</button>
    {/if}
  </div>
</Sheet>

<style>
  .kind { color: var(--muted); }
  h2 :global(.hue) { font-weight: 700; }
  .head { display: flex; align-items: center; gap: 10px; }
  .picture { min-height: 40px; }
  .facts { margin: 0; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 6px 16px; font-size: 13.5px; }
  dt { color: var(--muted); }
  dd { margin: 0; color: var(--ink); font-family: var(--mono); font-size: 12.5px; text-align: right; }
  .verdict { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--ink-soft); }
  .verdict b { color: var(--ink); }
  .note { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .actions { display: grid; grid-template-columns: auto 1fr; gap: 10px; margin-top: 2px; }

  /* The ratio scale, as on What goes with a good Day's two-thirds rows. */
  .axis { position: relative; height: 14px; }
  .axis span { position: absolute; top: 0; transform: translateX(-50%); font: 500 var(--axis-size)/12px var(--mono); color: var(--axis-ink); white-space: nowrap; }
  .axis .first { transform: none; }
  .axis .last { transform: translateX(-100%); }
  .track { position: relative; height: 54px; margin-top: 2px; }
  .track > * { position: absolute; }
  .grid { top: 0; bottom: 0; width: 1px; background: var(--line); }
  .grid.zero { background: var(--axis-ink); }
  .line { top: 29px; height: 2px; background: var(--voucher); }
  .line.worse { top: 28.5px; height: 3px; background: var(--worse); }
  .dot { top: 30px; width: 12px; height: 12px; border-radius: 50%; transform: translate(-50%, -50%); }
  .dot.hollow { width: 11px; height: 11px; border: 1.8px solid; background: var(--surface); }
  .label { top: 4px; transform: translateX(-50%); font: 600 11px/12px var(--mono); color: var(--ink); white-space: nowrap; }
  .label.was { top: 40px; color: var(--muted); }
  .split { display: grid; grid-template-columns: auto minmax(40px, 1fr) auto; align-items: center; gap: 10px; margin-top: 10px; font: 500 11px var(--mono); color: var(--muted); }
  .side { display: inline-flex; align-items: center; gap: 6px; white-space: nowrap; }
  .ring { width: 9px; height: 9px; border-radius: 50%; border: 1.6px solid; }
  .disc { width: 10px; height: 10px; border-radius: 50%; }
  .sbar { display: flex; gap: 2px; height: 6px; }
  .sbar i { display: block; min-width: 3px; height: 100%; border-radius: 2px; }
  .sbar .without { border: 1px solid var(--axis-ink); }
</style>
