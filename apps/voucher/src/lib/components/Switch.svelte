<script lang="ts">
  let { on, label, onchange }: { on: boolean; label: string; onchange: (on: boolean) => void } = $props();
</script>

<button class="switch" class:on aria-pressed={on} aria-label={label} onclick={() => onchange(!on)}><span class="dot"></span></button>

<style>
  .switch { width: 52px; height: 30px; min-height: 30px; border-radius: 15px; border: 0; position: relative; padding: 0; flex-shrink: 0; background: #3a3f45; }
  .dot { position: absolute; top: 4px; left: 4px; width: 22px; height: 22px; border-radius: 50%; background: var(--muted); transition: left .15s; }
  .on { background: var(--voucher); }
  .on .dot { left: 26px; background: var(--ground); }
</style>
