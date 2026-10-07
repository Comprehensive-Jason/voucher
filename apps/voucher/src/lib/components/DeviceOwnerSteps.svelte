<script lang="ts">
  // How to make Voucher Device Owner without a factory reset. Android only
  // allows it while no accounts are signed in and no other users or profiles
  // exist, so accounts are frozen for a minute rather than removed (removing a
  // Samsung account would delete Samsung Wallet cards).
  import { DEVICE_OWNER_COMMAND } from "../api";
  import Sheet from "./Sheet.svelte";

  let { onclose }: { onclose: () => void } = $props();
  let copied = $state(false);

  async function copy(text: string) {
    try { await navigator.clipboard.writeText(text); copied = true; } catch { copied = false; }
  }
</script>

<Sheet {onclose}>
  <h2>Turn on app blocking</h2>
  <p class="body">This is done once per device, from a computer with ADB, in about 20 minutes. Nothing is erased.</p>
  <ol>
    <li><b>Turn on USB debugging.</b> Settings, About phone, Software information: tap Build number 7 times. Then Developer options, USB debugging. On Samsung, turn off Auto Blocker first.</li>
    <li><b>Check for extra users.</b> Run <code>adb shell pm list users</code>. Only user 0 may be listed: delete Secure Folder, Dual Messenger, and any work profile or private space first.</li>
    <li><b>List the accounts.</b> Run <code>adb shell dumpsys account | grep "Account &#123;"</code>.</li>
    <li><b>Freeze, don't sign out.</b> For each account's app, run <code>adb shell pm disable-user --user 0 &lt;package&gt;</code> (Google: com.google.android.gms is not frozen; remove the Google account in Settings, Accounts instead and add it back after). Wait 10 seconds.</li>
    <li><b>Make Voucher Device Owner.</b> Run:
      <button class="cmd mono" onclick={() => copy(DEVICE_OWNER_COMMAND)}>{DEVICE_OWNER_COMMAND}</button>
      {#if copied}<span class="copied">Copied</span>{/if}
    </li>
    <li><b>Thaw and sign back in.</b> Run <code>adb shell pm enable &lt;package&gt;</code> for each app you froze, and add back any account you removed.</li>
    <li><b>Turn USB debugging off</b>, so ADB can't be used to undo blocking.</li>
  </ol>
  <p class="body">While Voucher is Device Owner, Secure Folder, Samsung Pass, Smart Switch, and Samsung Kids don't work. Releasing it from Rules waits for 06:00 like any Loosening.</p>
  <button class="primary" onclick={onclose}>Done</button>
</Sheet>

<style>
  h2 { margin: 0; font-size: 22px; }
  .body { margin: 0; font-size: 14px; line-height: 1.45; color: var(--muted); }
  ol { margin: 0; padding-left: 20px; display: flex; flex-direction: column; gap: 10px; font-size: 14px; line-height: 1.45; }
  code { font-family: var(--mono); font-size: 12px; background: var(--ground); padding: 1px 4px; border-radius: 4px; word-break: break-all; }
  .cmd { display: block; width: 100%; margin-top: 6px; padding: 10px; border-radius: 10px; border: 1px solid var(--line); background: var(--ground); color: var(--voucher); font-size: 12px; text-align: left; word-break: break-all; }
  .copied { font-size: 12px; color: var(--voucher); }
  .primary { min-height: 52px; border-radius: 14px; border: 0; background: var(--voucher); color: var(--voucher-ink); font: 700 16px var(--font); }
</style>
