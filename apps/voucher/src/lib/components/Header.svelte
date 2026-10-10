<script lang="ts">
  // The phone's Today header: the Voucher mark and name. (On the tablet the
  // mark sits on the Bank's line and Rules opens from the page bar's row.)
  // `night` turns the mark indigo during Curfew. The Streak sits with the
  // Daily goal, in the Bank meter.
  import Brand from "./Brand.svelte";
  let { night = false }: { night?: boolean } = $props();
</script>

<header><Brand {night} /></header>

<style>
  header { display: flex; align-items: center; min-height: 44px; }
</style>
