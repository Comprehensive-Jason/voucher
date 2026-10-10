<script lang="ts">
  // The small shape before a line in the Log and the All-day list, telling
  // kinds of event apart by shape as well as colour: a source's rounded
  // square, a hollow one for a Voucher lost to a full Bank, a star for the
  // Daily goal met, a dashed red ring for a time Voucher was off (a warning:
  // nothing was protected), a salmon triangle pointing right, the way a torn
  // Voucher goes, for an Unlock, and a flag for a Marker (--marker by hand,
  // grey for a rule change).
  export type MarkerKind = "source" | "lost" | "redeemed" | "goal" | "gap" | "note" | "rule";
  let { kind, color = "currentColor", size = 12 }: { kind: MarkerKind; color?: string; size?: number } = $props();
</script>

<svg width={size} height={size} viewBox="0 0 12 12" aria-hidden="true" class="marker">
  {#if kind === "source"}
    <rect x="1" y="1" width="10" height="10" rx="3" fill={color} />
  {:else if kind === "lost"}
    <rect x="1.75" y="1.75" width="8.5" height="8.5" rx="2.5" fill="none" stroke={color} stroke-width="1.5" />
  {:else if kind === "goal"}
    <path d="M6 .6l1.6 3.4 3.7.4-2.8 2.5.8 3.7L6 8.8 2.7 10.6l.8-3.7L.7 4.4l3.7-.4z" fill="var(--goal)" />
  {:else if kind === "note" || kind === "rule"}
    <path d="M3 11V1.2M3 1.6h6.4l-1.6 2.4 1.6 2.4H3" fill={kind === "note" ? "var(--marker)" : "var(--muted)"} stroke={kind === "note" ? "var(--marker)" : "var(--muted)"} stroke-width="1.4" stroke-linejoin="round" stroke-linecap="round" />
  {:else if kind === "gap"}
    <circle cx="6" cy="6" r="4.6" fill="none" stroke="var(--danger)" stroke-width="1.5" stroke-dasharray="2.4 1.8" />
  {:else}
    <!-- An Unlock: a triangle pointing right, the way a torn Voucher goes. -->
    <path d="M2.2 1.2l8.6 4.8-8.6 4.8z" fill="var(--spend)" stroke="var(--spend)" stroke-width="1" stroke-linejoin="round" />
  {/if}
</svg>

<style>
  .marker { flex: none; display: block; }
</style>
