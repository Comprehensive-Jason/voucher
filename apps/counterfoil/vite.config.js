import { defineConfig } from "vite";
import { sveltekit } from "@sveltejs/kit/vite";
// @ts-expect-error type error without @types/node package
import process from "node:process";
// The address a tablet on the network loads the dev build from, as for
// Voucher (TAURI_DEV_HOST=192.168.1.16 npm run dev:counterfoil).
const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(() => ({
  plugins: [sveltekit()],
  // One Svelte for the app and packages/core alike.
  resolve: { dedupe: ["svelte"] },
  clearScreen: false,
  // Voucher has 1420 and 1421; Counterfoil takes 1430 and 1431.
  server: {
    port: 1430,
    strictPort: true,
    host: host || "127.0.0.1",
    hmr: host
      ? {
          protocol: "ws",
          host,
          port: 1431,
        }
      : undefined,
    // packages/core sits outside the app, so the dev server may serve it too.
    fs: { allow: ["../../packages/core"] },
  },
}));
