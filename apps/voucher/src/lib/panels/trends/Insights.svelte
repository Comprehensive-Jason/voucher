<script lang="ts">
  // Voucher's Insights card: $core's, with what only Voucher may do. A
  // suggestion's "Try …" opens the confirm sheet (TrySheet), a running
  // Experiment's row opens ExperimentSheet, and a judged one's proof asks
  // Keep it or Go back. When an Experiment's verdict Day comes, this works
  // the verdict out with Before and after and sends it to the Ledger, where
  // the phone's Enforcer picks it up for its one notification.
  import InsightsCard from "$core/insights/InsightsCard.svelte";
  import { judge, progress } from "$core/insights/experiments";
  import { insights } from "$core/insights/store.svelte";
  import type { Context } from "$core/insights";
  import type { Actions, Experiment, Finding } from "$core/insights/types";
  import { curfew } from "$core/curfew.svelte";
  import { notes } from "$core/notes.svelte";
  import { actionFailed } from "$core/toast.svelte";
  import type { Blocklist, DayTotal, Pending, Settings } from "$core/types";
  import TrySheet from "$lib/components/TrySheet.svelte";
  import ExperimentSheet from "$lib/components/ExperimentSheet.svelte";

  let { history, timeZone, settings, pending, blocklists }: {
    history: DayTotal[]; timeZone: string; settings: Settings | null; pending: Pending[]; blocklists: Record<string, Blocklist>;
  } = $props();
  const today = $derived(history.at(-1)?.day ?? "");

  let trying = $state<Finding | null>(null);
  let running = $state<Experiment | null>(null);
  const actions: Actions = {
    tryIt: (f) => (trying = f),
    experiment: (e) => (running = e),
    decide: async (e, keep) => {
      try { await insights.end(e.id, keep); } catch (err) { actionFailed(err, "The Ledger didn't take that. Try again."); }
    },
  };

  // Due verdicts, sent once each.
  const sent = new Set<number>();
  $effect(() => {
    if (!insights.kept || !history.length) return;
    const ctx: Context = {
      days: history.slice(0, -1), today, current: history.at(-1) ?? null, timeZone,
      dayStart: Math.round(curfew.end * 60), curfewStart: Math.round(curfew.start * 60),
      blocklists, markers: notes.markers, settings, pending, experiments: insights.state.experiments,
    };
    for (const e of insights.state.experiments) {
      if (e.status !== "running" || sent.has(e.id) || !progress(e, today).due) continue;
      const v = judge(e, ctx);
      if (!v) continue;
      sent.add(e.id);
      insights.judge(e.id, { title: v.title, text: v.text, outcome: v.outcome, back: v.back }).catch(() => sent.delete(e.id));
    }
  });
</script>

<!-- A Ledger from before Insights can't keep dismissals or run Experiments: then it shows findings only. -->
<InsightsCard {history} {timeZone} {settings} {pending} {blocklists} actions={insights.kept ? actions : undefined} />
{#if trying?.suggestion}<TrySheet f={trying} s={trying.suggestion} {today} onclose={() => (trying = null)} />{/if}
{#if running}<ExperimentSheet e={running} {today} onclose={() => (running = null)} />{/if}
