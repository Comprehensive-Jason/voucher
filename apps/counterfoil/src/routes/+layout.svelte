<script lang="ts">
  import "$core/theme.css";
  import { motionVars } from "$core/motion";
  import { setArrangementContext } from "$core/arrangement.svelte";
  import Toast from "$core/components/Toast.svelte";
  import { arrangement } from "$lib/cards";
  import { allowLedger } from "$core/api";
  import { mayCall } from "$lib/allowed";

  // Counterfoil reads, and writes only Markers, goals, and the Daily goal;
  // it asks the Ledger for nothing else (lib/allowed.js).
  allowLedger(mayCall);

  // Every animation's timing comes from $core/motion.ts, as CSS variables on
  // the root, set before anything draws.
  if (typeof document !== "undefined") {
    for (const part of motionVars().split("; ")) {
      const [name, value] = part.split(": ");
      document.documentElement.style.setProperty(name, value);
    }
  }

  let { children } = $props();
  // Counterfoil's one arrangement of its cards, for the dashboard and any
  // card that reads its own options.
  setArrangementContext(arrangement);
</script>

<div class="screen">
  <div class="body">{@render children()}</div>
  <!-- Short messages at the spot when an action doesn't go through ($core/toast.svelte.ts). -->
  <Toast />
</div>

<style>
  .screen { position: relative; height: 100vh; height: 100dvh; display: flex; flex-direction: column; }
  .body { flex: 1; min-height: 0; overflow-y: auto; }
</style>
