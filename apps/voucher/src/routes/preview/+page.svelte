<script lang="ts">
  // A look at what Voucher puts outside the app, from today's real numbers:
  // the live wallpaper (drawn as VoucherWallpaper.kt draws it) and the watch
  // Tile proposed for the Galaxy Watch (the Bank as the outer ring, the three
  // sources closest to their next Voucher as rings inside it). The switches
  // try it in other states. Only a preview: neither is installed from here.
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { Live } from "$lib/live.svelte";
  import { styleOf } from "$lib/sources";
  import ZoomSwitch from "$lib/components/ZoomSwitch.svelte";
  import type { Today } from "$lib/types";

  const live = new Live();
  onMount(() => live.start());
  type Look = "now" | "curfew" | "empty" | "full";
  let look = $state<Look>("now");

  /** Today's numbers, changed to the state being tried. */
  const data = $derived.by((): Today | null => {
    const d = live.data;
    if (!d) return null;
    if (look === "curfew") return { ...d, curfewActive: true };
    if (look === "empty") return { ...d, bank: 0 };
    if (look === "full") return { ...d, bank: d.bankLimit };
    return d;
  });

  // ---- The wallpaper, as VoucherWallpaper.kt paints it ----
  let canvas = $state<HTMLCanvasElement>();
  $effect(() => {
    const d = data, c = canvas;
    if (!d || !c) return;
    const g = c.getContext("2d")!;
    const w = c.width, h = c.height;
    const curfew = d.curfewActive;
    g.fillStyle = curfew ? "#151935" : "#0e0f11";
    g.fillRect(0, 0, w, h);
    const limit = d.bankLimit || 24;
    const top = h - h * Math.min(1, Math.max(0, d.bank / limit)) * 0.62;
    let parts = d.sources.filter((s) => s.earned > 0).map((s) => ({ color: styleOf(s.id).color, n: s.earned }));
    if (!parts.length) parts = [{ color: "#6c7177", n: 1 }];
    const total = parts.reduce((a, p) => a + p.n, 0);
    let x = 0;
    for (const p of parts) {
      const bw = (w * p.n) / total;
      g.globalAlpha = curfew ? 110 / 255 : 95 / 255;
      g.fillStyle = curfew ? "#2e3a78" : p.color;
      g.fillRect(x, top, bw, h - top);
      x += bw;
    }
    g.globalAlpha = 70 / 255;
    g.fillStyle = curfew ? "#7d8cff" : "#ffffff";
    g.fillRect(0, top, w, h * 0.003);
    g.globalAlpha = 0.8;
    g.fillStyle = "#f2f2f0";
    g.font = `700 ${w * 0.035}px "JetBrains Mono", monospace`;
    let line = `${d.bank} of ${limit} in the Bank`;
    if (d.goalTarget > 0) line += `  ·  today ${d.goalDone} of ${d.goalTarget}`;
    if (d.streakDays > 0) line += `  ·  ${d.streakDays} day streak`;
    if (curfew) line += "  ·  Curfew";
    g.fillText(line, w * 0.06, top - h * 0.015);
    g.globalAlpha = 1;
  });

  // ---- The watch Tile ----
  /** The three switched-on sources closest to their next Voucher, with how far along each is. */
  const closest = $derived((data?.sources ?? [])
    .filter((s) => s.on && s.every > 1)
    .map((s) => ({ ...styleOf(s.id), share: Math.min(1, s.progress / s.every) }))
    .sort((a, b) => b.share - a.share)
    .slice(0, 3));
  const ring = (r: number, share: number) => {
    const c = 2 * Math.PI * r;
    return { r, dash: `${c * share} ${c}` };
  };
  const bank = $derived(ring(88, data ? data.bank / (data.bankLimit || 24) : 0));
</script>

<main>
  <header>
    <button class="back" aria-label="Back" onclick={() => goto("/")}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
    </button>
    <h1>Wallpaper and watch</h1>
    <ZoomSwitch label="State" options={[{ id: "now", label: "Now" }, { id: "curfew", label: "Curfew" }, { id: "empty", label: "Empty Bank" }, { id: "full", label: "Full Bank" }]} value={look} onchange={(v) => (look = v as Look)} />
  </header>
  <p class="note">A preview from today's numbers. The wallpaper is installed with the app and chosen in Android's wallpaper picker; the watch Tile isn't built yet.</p>
  {#if data}
    <div class="row">
      <figure>
        <!-- The S24 Ultra's screen shape, at a third of its pixels. -->
        <div class="phone"><canvas bind:this={canvas} width="480" height="1040"></canvas></div>
        <figcaption>Live wallpaper: the Bank as a fill in today's source colours</figcaption>
      </figure>
      <figure>
        <div class="watch" class:night={data.curfewActive}>
          <svg viewBox="0 0 200 200" role="img" aria-label="Watch Tile">
            <!-- The Bank, the outer ring. -->
            <circle cx="100" cy="100" r={bank.r} fill="none" stroke="#1d4d33" stroke-width="12" />
            <circle cx="100" cy="100" r={bank.r} fill="none" stroke={data.curfewActive ? "#7d8cff" : "#3ddc84"} stroke-width="12" stroke-linecap="round" stroke-dasharray={bank.dash} transform="rotate(-90 100 100)" />
            <!-- The three sources closest to their next Voucher, inside it. -->
            {#each closest as s, i}
              {@const r = ring(68 - i * 15, s.share)}
              <circle cx="100" cy="100" r={r.r} fill="none" stroke={s.color} stroke-opacity=".22" stroke-width="9" />
              <circle cx="100" cy="100" r={r.r} fill="none" stroke={s.color} stroke-width="9" stroke-linecap="round" stroke-dasharray={r.dash} transform="rotate(-90 100 100)" />
            {/each}
            <text x="100" y="104" text-anchor="middle" class="big">{data.bank}</text>
            <text x="100" y="122" text-anchor="middle" class="small">of {data.bankLimit}</text>
          </svg>
        </div>
        <figcaption>Watch Tile: the Bank outside; inside, {closest.map((s) => s.name).join(", ") || "your sources"}</figcaption>
      </figure>
    </div>
  {:else}
    <p class="note">Loading today's numbers…</p>
  {/if}
</main>

<style>
  main { padding: calc(24px + env(safe-area-inset-top)) 28px 28px; display: flex; flex-direction: column; gap: 16px; }
  header { display: flex; align-items: center; gap: 12px; flex-wrap: wrap; }
  h1 { margin: 0; font-size: 24px; flex: 1; }
  .back { width: 40px; height: 40px; border: 0; border-radius: 12px; background: none; color: var(--ink); display: flex; align-items: center; justify-content: center; cursor: pointer; }
  .note { margin: 0; color: var(--muted); font-size: 14px; }
  .row { display: flex; flex-wrap: wrap; gap: 40px; align-items: flex-start; }
  figure { margin: 0; display: flex; flex-direction: column; gap: 10px; align-items: center; }
  figcaption { font-size: 13px; color: var(--muted); max-width: 300px; text-align: center; }
  .phone { width: 240px; aspect-ratio: 480 / 1040; border-radius: 28px; overflow: hidden; border: 6px solid #2a2e33; }
  .phone canvas { width: 100%; height: 100%; display: block; }
  .watch { width: 260px; aspect-ratio: 1; border-radius: 50%; background: #000; border: 10px solid #2a2e33; padding: 14px; box-sizing: border-box; }
  .watch svg { width: 100%; height: 100%; display: block; }
  .watch .big { font: 700 34px var(--font); fill: #f2f2f0; }
  .watch .small { font: 600 12px var(--mono); fill: #a3a8ad; }
  .watch circle { transition: stroke-dasharray var(--t-move) var(--ease-out), stroke var(--t-base); }
</style>
