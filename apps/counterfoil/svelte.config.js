// A single-page app (adapter-static with an index.html fallback), as Voucher
// is, so a Tauri shell can wrap it later.
import adapter from "@sveltejs/adapter-static";
import { vitePreprocess } from "@sveltejs/vite-plugin-svelte";

/** @type {import('@sveltejs/kit').Config} */
const config = {
  preprocess: vitePreprocess(),
  kit: {
    adapter: adapter({
      fallback: "index.html",
    }),
    // What the apps share, compiled here as source (packages/core).
    alias: {
      $core: "../../packages/core/src",
    },
  },
};

export default config;
