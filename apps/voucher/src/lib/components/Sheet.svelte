<script lang="ts">
  // Every dialog: a bottom sheet over a scrim. Tapping the scrim closes it. It
  // slides up as it opens and back down as it closes, as pages opening over
  // others do, while the scrim fades. (Global transitions, so they play
  // however the sheet is opened or closed.) On a wide screen it stays 640 px
  // wide, centred. `tone` tints it: "goal" gold for the Daily goal's moments,
  // "night" Curfew indigo for the Curfew question.
  import { fade, fly } from "svelte/transition";
  import { easeIn, easeOut, ms } from "../motion";
  let { onclose, tone = "default", label, children }: {
    onclose: () => void;
    tone?: "default" | "goal" | "night";
    /** The id of the sheet's heading, for screen readers. */
    label?: string;
    children: import("svelte").Snippet;
  } = $props();
</script>

<div class="scrim" role="presentation" onclick={onclose} transition:fade|global={{ duration: ms("base") }}></div>
<div class="sheet {tone}" role="dialog" aria-modal="true" aria-labelledby={label}
  in:fly|global={{ y: "100%", opacity: 1, duration: ms("move"), easing: easeOut }}
  out:fly|global={{ y: "100%", opacity: 1, duration: ms("move"), easing: easeIn }}>{@render children()}</div>

<style>
  .scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, .6); z-index: 10; }
  .sheet { position: fixed; left: 0; right: 0; bottom: 0; z-index: 11; max-width: 640px; margin: 0 auto; max-height: 80vh; overflow-y: auto; border-radius: 24px 24px 0 0; background: var(--surface); border: 1px solid var(--line); border-bottom: 0; padding: 24px 20px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 14px; }
  .sheet.goal { border-color: var(--goal-line); }
  .sheet.night { background: var(--night-bg); border-color: var(--night-voucher); }
  /* One heading size for every sheet. */
  .sheet :global(h2) { margin: 0; font-size: 22px; font-weight: 700; line-height: 1.25; }
  .sheet.goal :global(h2) { color: var(--goal); }
</style>
