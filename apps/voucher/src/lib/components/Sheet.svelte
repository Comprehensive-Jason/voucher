<script lang="ts">
  // A bottom sheet over a scrim. Tapping the scrim closes it. It slides up as
  // it opens and back down as it closes, as pages opening over others do, while
  // the scrim fades. (Global transitions, so they play however the sheet is
  // opened or closed.)
  import { fade, fly } from "svelte/transition";
  import { easeIn, easeOut, ms } from "../motion";
  let { onclose, children }: { onclose: () => void; children: import("svelte").Snippet } = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose} transition:fade|global={{ duration: ms("base") }}></div>
<div class="sheet" role="dialog" aria-modal="true"
  in:fly|global={{ y: "100%", opacity: 1, duration: ms("move"), easing: easeOut }}
  out:fly|global={{ y: "100%", opacity: 1, duration: ms("move"), easing: easeIn }}>{@render children()}</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 10; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; max-height: 80vh; overflow-y: auto; border-radius: 24px 24px 0 0; background: var(--surface); border-top: 1px solid var(--line); padding: 24px 20px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; }
</style>
