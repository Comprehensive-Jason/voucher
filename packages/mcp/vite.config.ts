// Builds the server for Node: one file, dist/server.js, with core's source
// (the goal measures and the Insights engine) compiled in. Core's
// .svelte.ts modules use runes, so Svelte's compiler runs over them, for
// the server, where $state is a plain value. The MCP SDK and zod stay
// outside, loaded from node_modules.
import { defineConfig } from "vite";
import { svelte } from "@sveltejs/vite-plugin-svelte";
import { fileURLToPath } from "node:url";

export default defineConfig({
  plugins: [svelte({ configFile: false })],
  resolve: { dedupe: ["svelte"], alias: { $core: fileURLToPath(new URL("../core/src", import.meta.url)) } },
  // api.ts reads this in a browser; the server never goes through it.
  define: { "import.meta.env.VITE_LEDGER_PROXY": "undefined" },
  ssr: { noExternal: true, external: ["@modelcontextprotocol/sdk", "zod"], target: "node" },
  build: {
    ssr: "src/server.ts",
    outDir: "dist",
    target: "node22",
    emptyOutDir: true,
    minify: false,
    rollupOptions: { output: { entryFileNames: "server.js", banner: "#!/usr/bin/env node" } },
  },
});
