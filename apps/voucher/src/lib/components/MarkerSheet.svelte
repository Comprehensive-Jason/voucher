<script lang="ts">
  // The Marker button's sheet: the same one-tap list the Curfew question
  // offers after its answer (MarkerChips), any time of Day.
  import Sheet from "./Sheet.svelte";
  import MarkerChips from "./MarkerChips.svelte";

  let { onclose }: { onclose: () => void } = $props();
</script>

<Sheet {onclose} label="marker-q">
  <h2 id="marker-q">What changed?</h2>
  <p class="why">A tap adds a Marker for today. Before and after, in Trends, compares the two weeks either side of it.</p>
  <MarkerChips />
  <button class="btn small done" onclick={onclose}>Done</button>
</Sheet>

<style>
  h2 { margin: 0; font-size: 20px; }
  .why { margin: 0; font-size: 13.5px; line-height: 1.45; color: var(--muted); }
  .done { align-self: flex-end; }
</style>
