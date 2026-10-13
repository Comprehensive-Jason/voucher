<script lang="ts">
  // Which calendars count toward each Day's calendar load (events and busy
  // minutes, for Trends; nothing earns from them). Calendars are listed and
  // chosen on Android, grouped by account, each with its color. A calendar
  // is kept as its account and display name, which every device that syncs
  // it shares; the device the choice is saved on reports it, so an event is
  // never counted twice. Another Android device can take reporting over. On
  // Windows and in the browser preview the sheet explains this and shows the
  // current choice. (`?calendars=pick` previews Android's list, and
  // `?calendars=ask` its request for access.)
  import { onMount } from "svelte";
  import Sheet from "$core/components/Sheet.svelte";
  import { chooseCalendars } from "$core/api";
  import { deviceCalendars, deviceId, requestCalendarAccess } from "$lib/device";
  import { actionFailed } from "$core/toast.svelte";
  import type { CalendarChoice, CalendarId, DeviceCalendars } from "$core/types";

  let { choice, onclose, onsaved }: {
    choice: CalendarChoice;
    onclose: () => void;
    onsaved: (choice: CalendarChoice) => void;
  } = $props();

  const key = (c: CalendarId) => `${c.account}\n${c.name}`;
  /** This device's calendars; undefined while asking, null off Android. */
  let here = $state<DeviceCalendars | null | undefined>(undefined);
  let me = $state("");
  let picked = $state(new Set<string>());
  let saving = $state(false);

  async function look() { here = await deviceCalendars(); }
  onMount(() => {
    picked = new Set(choice.calendars.map(key));
    look();
    deviceId().then((id) => (me = id));
    // Android answers the access request in its own dialog: look again when the app is back.
    const again = () => { if (document.visibilityState === "visible" && here && !here.granted) look(); };
    document.addEventListener("visibilitychange", again);
    window.addEventListener("focus", again);
    const poll = setInterval(again, 2000);
    return () => { document.removeEventListener("visibilitychange", again); window.removeEventListener("focus", again); clearInterval(poll); };
  });

  /** Calendars grouped by account, accounts in the order they come. */
  function byAccount(list: CalendarId[]): [string, CalendarId[]][] {
    const groups = new Map<string, CalendarId[]>();
    for (const c of list) groups.set(c.account, [...(groups.get(c.account) ?? []), c]);
    return [...groups];
  }
  const listed = $derived(here?.granted ? byAccount(here.calendars) : []);
  /** Chosen calendars this device doesn't have: saving here drops them. */
  const missing = $derived(here?.granted ? choice.calendars.filter((c) => !here!.calendars.some((h) => key(h) === key(c))) : []);
  const reporter = $derived(choice.device);
  const changed = $derived(here?.granted
    ? reporter !== me || picked.size !== choice.calendars.length || choice.calendars.some((c) => !picked.has(key(c)))
    : false);

  function toggle(c: CalendarId) {
    const next = new Set(picked);
    if (next.has(key(c))) next.delete(key(c)); else next.add(key(c));
    picked = next;
  }
  async function save(calendars: CalendarId[]) {
    saving = true;
    try { onsaved(await chooseCalendars(me, calendars)); }
    catch (e) { actionFailed(e, "The Ledger didn't save the calendars. Try again."); }
    saving = false;
  }
  const saveChoice = () => save(here!.calendars.filter((c) => picked.has(key(c))));
  const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? "" : "s"}`;
</script>

<Sheet {onclose} label="calendars-h">
  <h2 id="calendars-h">Calendars</h2>
  <p class="lead">Each Day's events and busy time, for Trends. They don't earn Vouchers. Only when events start and end is sent: no titles, people, or places. All-day, declined, and free events don't count.</p>

  {#if here === undefined}
    <p class="empty">Looking for this device's calendars…</p>
  {:else if here === null}
    <div class="notice">
      <div class="ntext"><span class="cap">Chosen on Android</span>Calendars are chosen on the Android phone or tablet that reads them. This shows the current choice.</div>
    </div>
    {#if choice.calendars.length}
      {#each byAccount(choice.calendars) as [account, list] (account)}
        <div class="group">
          <span class="cap account">{account}</span>
          {#each list as c (key(c))}
            <div class="row still"><span class="color" style="background: {c.color ?? 'var(--muted)'}"></span><span class="name">{c.name}</span></div>
          {/each}
        </div>
      {/each}
    {:else}
      <p class="empty box">No calendars chosen yet</p>
    {/if}
  {:else if !here.granted}
    <div class="notice">
      <div class="ntext"><span class="cap">Calendar access</span>To list this device's calendars, Voucher needs to read them.</div>
      <button class="btn small fix" onclick={requestCalendarAccess}>Allow access</button>
    </div>
  {:else}
    {#if !listed.length}<p class="empty box">This device has no calendars</p>{/if}
    {#each listed as [account, list] (account)}
      <div class="group" role="group" aria-label={account}>
        <span class="cap account">{account}</span>
        {#each list as c (key(c))}
          {@const on = picked.has(key(c))}
          <button class="row pressdim" role="checkbox" aria-checked={on} onclick={() => toggle(c)}>
            <span class="color" style="background: {c.color ?? 'var(--muted)'}"></span>
            <span class="name">{c.name}</span>
            <span class="box" class:on>
              {#if on}<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>{/if}
            </span>
          </button>
        {/each}
      </div>
    {/each}
    {#if missing.length}
      <p class="foot">{plural(missing.length, "chosen calendar")} ({missing.map((c) => c.name).join(", ")}) {missing.length === 1 ? "isn't" : "aren't"} on this device. Saving here drops {missing.length === 1 ? "it" : "them"}.</p>
    {/if}
  {/if}

  <div class="reporter">
    <span class="label">
      <span class="cap">Reported by</span>
      <span class="mono who">{reporter ? `${reporter}${reporter === me ? " (this device)" : ""}` : "No device yet"}</span>
    </span>
    {#if here?.granted && reporter && reporter !== me && !missing.length}
      <button class="btn small" disabled={saving} onclick={() => save(choice.calendars)}>Report from this device</button>
    {/if}
  </div>
  {#if here?.granted}
    <p class="note">Saving makes this device the one that reports these calendars, so an event is never counted twice.</p>
    <div class="actions">
      <button class="btn ghost" onclick={onclose}>Cancel</button>
      <button class="btn primary" disabled={!changed || saving} onclick={saveChoice}>Save</button>
    </div>
  {:else}
    <button class="btn small done" onclick={onclose}>Done</button>
  {/if}
</Sheet>

<style>
  .group { display: flex; flex-direction: column; }
  .account { padding: 4px 0 6px; text-transform: none; letter-spacing: .02em; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .row { display: flex; align-items: center; gap: 12px; min-height: 48px; padding: 0 2px; border: 0; border-top: 1px solid var(--divider); background: none; color: var(--ink); font: 500 15px var(--font); text-align: left; cursor: pointer; transition: background-color var(--t-quick), var(--press); }
  .row.still { cursor: default; min-height: 40px; }
  .row:focus-visible { outline: 2px solid var(--voucher); outline-offset: -2px; }
  .color { width: 14px; height: 14px; border-radius: 4px; flex: none; }
  .name { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .box { flex: none; width: 24px; height: 24px; border-radius: 7px; border: 2px solid var(--line); display: inline-flex; align-items: center; justify-content: center; color: var(--voucher-ink); transition: background-color var(--t-quick), border-color var(--t-quick); }
  .box.on { background: var(--voucher); border-color: var(--voucher); }
  .reporter { display: flex; align-items: center; gap: 10px; padding: 10px 12px; border-radius: 14px; background: var(--raised); }
  .reporter .label { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 3px; }
  .who { font-size: 13px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .note { margin: -4px 0 0; font-size: 12px; line-height: 1.4; color: var(--muted); }
  .actions { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; }
  .done { align-self: center; min-width: 120px; }
</style>
