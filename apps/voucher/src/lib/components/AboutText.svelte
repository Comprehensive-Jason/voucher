<script lang="ts">
  // A line of a card's explanation (lib/about.ts), with its {hue:words}
  // markup shown in color. HIGHLIGHT there picks the look for every card:
  // "text" colors the words, "mark" keeps them in ink on a wash of the color
  // with a solid underline in it.
  import { HIGHLIGHT, HUES, runs } from "../about";
  let { text }: { text: string } = $props();
  const parts = $derived(runs(text));
</script>

{#each parts as r, i (i)}{#if r.hue}<span class="hue {HIGHLIGHT}" class:multi={r.hue === "sources"} style="--hue: {HUES[r.hue].mark}; --hue-text: {HUES[r.hue].text}">{r.text}</span>{:else}{r.text}{/if}{/each}

<style>
  .hue { font-weight: 500; }
  /* A: the words in the color, a lighter tint of it for the dark hues. */
  .text { color: var(--hue-text); }
  /* B: ink words on a soft wash of the color, underlined in it. */
  .mark { color: var(--ink); background: color-mix(in oklab, var(--hue) 22%, var(--surface)); box-shadow: inset 0 -2px 0 var(--hue); border-radius: 3px 3px 0 0; padding: 0 2px; margin: 0 -2px; -webkit-box-decoration-break: clone; box-decoration-break: clone; }
  /* Several colors (a source's own): a band of source colors under the words in either look. */
  .multi { color: var(--ink); background: var(--hue) no-repeat left bottom / 100% 2px; box-shadow: none; padding-bottom: 1px; }
  .mark.multi { background: var(--hue) no-repeat left bottom / 100% 2px, color-mix(in oklab, var(--ink) 10%, var(--surface)); }
</style>
