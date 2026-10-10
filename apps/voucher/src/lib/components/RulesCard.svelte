<script lang="ts">
  // One card for every Rules row (Limits, Sources, Distractions, Extras): one
  // radius, one padding, one border. `href` makes the whole card a link and
  // `onclick` a button; without either it's a plain box for rows that hold
  // their own controls. `row` lays the content out in a line (dot, text,
  // chevron) instead of a stack. `tone`: "plain"; "coming" (dashed, for
  // something not here until the morning); "good" (green, Protection on).
  import type { Snippet } from "svelte";

  let { href, onclick, disabled = false, row = false, tone = "plain", label, children }: {
    href?: string;
    onclick?: () => void;
    disabled?: boolean;
    row?: boolean;
    tone?: "plain" | "coming" | "good";
    /** An accessible name, when the card is a link or button whose text isn't enough. */
    label?: string;
    children: Snippet;
  } = $props();
</script>

{#if href}
  <a class="rulecard {tone}" class:row {href} aria-label={label}>{@render children()}</a>
{:else if onclick}
  <button class="rulecard {tone}" class:row {onclick} {disabled} aria-label={label}>{@render children()}</button>
{:else}
  <div class="rulecard {tone}" class:row>{@render children()}</div>
{/if}

<style>
  .rulecard { border-radius: 16px; background: var(--surface); border: 1px solid var(--line); padding: 12px 14px; display: flex; flex-direction: column; gap: 10px; color: var(--ink); font: inherit; text-align: left; text-decoration: none; }
  .row { flex-direction: row; align-items: center; gap: 12px; }
  button.rulecard { width: 100%; cursor: pointer; }
  button.rulecard:disabled { cursor: default; }
  .rulecard:focus-visible { outline: 2px solid var(--voucher); outline-offset: 2px; }
  .coming { border-style: dashed; background: none; }
  .good { background: var(--unlocked-bg); border-color: var(--unlocked-line); }
</style>
