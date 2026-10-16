<script lang="ts">
  // The goal editor: add a goal, or change or remove one, from the Goals
  // card. A goal is a measure, which way (at least or at most), a target,
  // and a Day or a week. Under the fields, the last 12 weeks' hit rate at
  // that target, week by week, so a target can be set where it bites.
  //
  // The Daily goal is the first goal, but only its target changes here, and
  // through POST /change like Voucher's Rules: it starts with the next Day,
  // a lower one waits for 06:00 like every loosening, and it leaves a rule
  // Marker. Every other goal saves at once.
  import { untrack } from "svelte";
  import Sheet from "$core/components/Sheet.svelte";
  import StepField from "$core/components/StepField.svelte";
  import ZoomSwitch from "$core/components/ZoomSwitch.svelte";
  import Visual from "$core/insights/Visual.svelte";
  import { goalRuns, weeklyRates } from "$core/insights/goals";
  import { evaluate, measureChoices, measureInfo, showValue, type Direction, type Goal, type MeasureInfo, type Named, type NewGoal, type Period } from "$core/goals";
  import { goals } from "$core/goals.svelte";
  import { styleOf } from "$core/sources";
  import { actionFailed } from "$core/toast.svelte";
  import { clock } from "$core/time";
  import type { DayTotal, Status } from "$core/types";

  let { goal: opened, history, status, onclose }: { goal: Goal | null; history: DayTotal[]; status: Status; onclose: () => void } = $props();
  /** The goal as the sheet opened on it: the draft starts from it, and a
   *  reload of the list while the sheet is open doesn't reset the fields. */
  const goal = untrack(() => opened);

  const named = (id: string): Named => { const s = styleOf(id); return { name: s.name, color: s.color }; };
  const choices = $derived(measureChoices(status.settings.sources, named).filter((m) => !m.id.startsWith("source") || status.settings.sources[m.id.split(":")[1]]?.on || m.id === goal?.measure));
  const daily = goal?.daily ?? false;

  /** Where a new goal of a measure starts, by period. */
  const START: Record<string, { day: number; week: number }> = {
    vouchers: { day: 10, week: 80 }, focus: { day: 90, week: 600 }, longest: { day: 45, week: 90 }, distraction: { day: 60, week: 420 },
    unlocks: { day: 3, week: 20 }, asleep: { day: 420, week: 420 }, bedtime: { day: 1410, week: 1410 }, wake: { day: 450, week: 450 },
  };
  const startOf = (info: MeasureInfo, period: Period) => START[info.id]?.[period] ?? (info.unit === "days" ? 3 : period === "day" ? 3 : 15);
  /** One tap's step, and the range, in the measure's unit. */
  const stepOf = (info: MeasureInfo) => (info.unit === "clock" ? 15 : info.unit === "minutes" ? (info.id === "longest" ? 5 : 15) : 1);
  const maxOf = (info: MeasureInfo, period: Period) => (info.unit === "clock" ? 1440 : info.unit === "days" ? 7 : info.unit === "minutes" ? (period === "day" ? 1440 : 1440 * 7) : daily ? 100 : 500);

  // The draft, from the goal or a first measure.
  const first = goal?.measure ?? "focus";
  let measure = $state(first);
  let direction = $state<Direction>(goal?.direction ?? "at_least");
  let period = $state<Period>(goal?.period ?? "day");
  let target = $state(goal ? goal.pending?.target ?? goal.target : 90);
  const info = $derived(measureInfo(measure, status.settings.sources, named)!);

  function pick(id: string) {
    const next = measureInfo(id, status.settings.sources, named);
    if (!next) return;
    measure = id;
    direction = next.direction;
    if (next.weeklyOnly) period = "week";
    target = startOf(next, period);
  }
  function setPeriod(p: Period) {
    if (p === period) return;
    period = p;
    target = startOf(info, p);
  }

  const draft = $derived<Goal>({ id: goal?.id ?? "draft", measure, direction, target, period, daily });
  const others = $derived(goals.list.filter((g) => g.id !== goal?.id));
  /** Why this draft can't be saved, if it can't. */
  const problem = $derived(
    !daily && measure === "vouchers" && direction === "at_least" && period === "day" ? "That's the Daily goal: change it instead."
    : others.some((g) => !g.daily && g.measure === measure && g.direction === direction && g.period === period) ? "There's a goal like this already."
    : null,
  );

  // The last 12 weeks at this target.
  const reading = $derived({ timeZone: status.settings.time_zone, logFirstDay: status.log_first_day });
  const preview = $derived.by(() => {
    if (!info) return null;
    const asked = daily ? { ...draft, daily: false } : draft;
    const r = evaluate(asked, history, info, reading);
    return { rates: weeklyRates(r.periods, period, 12), r };
  });
  const rate12 = $derived(preview?.r.rate12 ? Math.round((preview.r.rate12.met / preview.r.rate12.of) * 100) : null);

  const clockWords = $derived(info.unit !== "clock" ? null : `${info.id === "bedtime" ? "In bed" : "Up"} ${direction === "at_most" ? "by" : "at or after"}${period === "week" ? ", on average" : ""}`);
  const format = (v: number) => (info.unit === "clock" ? showValue({ ...info, id: "wake" }, v) : showValue(info, v, { units: true }));
  const per = $derived(info.unit === "clock" ? "" : period === "day" ? "a Day" : info.week === "mean" ? "a night, on average" : "a week");
  const title = $derived(goal ? goalRuns(goal, measureInfo(goal.measure, status.settings.sources, named)!, []).map((r) => r.text).join("") : "New goal");
  const when = (at: string) => clock(at, status.settings.time_zone);

  let saving = $state(false), removing = $state(false), previewW = $state(0);
  let saveButton = $state<HTMLButtonElement>();
  async function save() {
    saving = true;
    try {
      if (daily) {
        if (target !== goal!.target || goal!.pending) await goals.setDaily(target);
      } else {
        const g: NewGoal = { ...(goal ? { id: goal.id } : {}), measure, direction, target, period };
        await goals.save(g);
      }
      onclose();
    } catch (e) { actionFailed(e, "The Ledger didn't take that goal. Try again.", saveButton); }
    saving = false;
  }
  async function remove() {
    if (!removing) { removing = true; return; }
    try { await goals.remove(goal!.id); onclose(); } catch (e) { actionFailed(e, "The Ledger didn't remove it. Try again."); removing = false; }
  }
</script>

<Sheet {onclose} label="goal-h" tone={daily ? "goal" : "default"}>
  <h2 id="goal-h">{title}</h2>

  {#if !daily}
    <label class="field">
      <span class="cap">Measure</span>
      <select value={measure} onchange={(e) => pick(e.currentTarget.value)}>
        <optgroup label="Work">
          {#each choices.filter((c) => c.productive) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </optgroup>
        <optgroup label="Rest and health">
          {#each choices.filter((c) => !c.productive) as c (c.id)}<option value={c.id}>{c.name}</option>{/each}
        </optgroup>
      </select>
    </label>
    <div class="pair">
      <ZoomSwitch size="large" label="Which way" value={direction} onchange={(v) => (direction = v as Direction)}
        options={info.unit === "clock" ? [{ id: "at_most", label: "By" }, { id: "at_least", label: "Not before" }] : [{ id: "at_least", label: "At least" }, { id: "at_most", label: "At most" }]} />
      <ZoomSwitch size="large" label="Counted over" value={period} onchange={(v) => setPeriod(v as Period)}
        options={info.weeklyOnly ? [{ id: "week", label: "A week" }] : [{ id: "day", label: "A Day" }, { id: "week", label: "A week" }]} />
    </div>
  {/if}

  <div class="field">
    <span class="cap">{daily ? "Vouchers a Day" : clockWords ?? "Target"}</span>
    <StepField label="Target" value={target} step={stepOf(info)} min={info.unit === "clock" ? 0 : daily ? 1 : 0} max={maxOf(info, period)} wrap={info.unit === "clock"}
      {format} unit={daily ? "" : per} onchange={(v) => (target = v)} />
  </div>

  {#if preview}
    <div class="preview" bind:clientWidth={previewW}>
      <div class="phead"><span class="cap">Last 12 weeks at this target</span><b>{rate12 === null ? "–" : `${rate12}%`}</b></div>
      {#if previewW}<Visual v={{ kind: "rates", rates: preview.rates, recent: 0, good: true }} w={previewW - 24} h={30} />{/if}
    </div>
  {/if}

  {#if daily}
    <p class="why">A new Daily goal starts with the next Day, at 06:00. A lower one is a loosening, so it waits like every loosening; it shows in Voucher's Waiting changes and as a rule Marker.{#if goal?.pending} Waiting now: {goal.pending.target} from {when(goal.pending.at)}.{/if}</p>
  {:else if problem}
    <p class="why problem">{problem}</p>
  {:else}
    <p class="why">Goals other than the Daily goal never change what's blocked or earned, so this saves at once. Past weeks are counted at today's target.</p>
  {/if}

  <div class="buttons">
    {#if goal && !daily}<button class="btn small danger" onclick={remove}>{removing ? "Tap again to remove" : "Remove"}</button>{/if}
    <span class="gap"></span>
    <button class="btn small ghost" onclick={onclose}>Cancel</button>
    <button class="btn small primary" bind:this={saveButton} disabled={saving || !!problem} onclick={save}>{goal ? "Save" : "Add goal"}</button>
  </div>
</Sheet>

<style>
  .field { display: flex; flex-direction: column; gap: 6px; }
  select { height: 44px; padding: 0 12px; border-radius: 14px; border: 1px solid var(--line); background: var(--raised); color: var(--ink); font: 600 15px var(--font); }
  select:focus-visible { outline: 2px solid var(--voucher); outline-offset: 1px; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .preview { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 14px; background: var(--raised); }
  .phead { display: flex; align-items: baseline; justify-content: space-between; }
  .phead b { font: 700 15px var(--mono); color: var(--goal); }
  .why { margin: 0; font-size: 13px; line-height: 1.45; color: var(--muted); }
  .why.problem { color: var(--worse-text); }
  .buttons { display: flex; align-items: center; gap: 8px; }
  .gap { flex: 1; }
  @media (max-width: 420px) { .pair { grid-template-columns: 1fr; } }
</style>
