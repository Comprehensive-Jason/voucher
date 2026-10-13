// For a dev server only: lets a browser build read a real Ledger. With
// LEDGER_PROXY (the Ledger's address, such as http://100.x.y.z:8787) and
// LEDGER_CODE (its access code) set, the dev server forwards /ledger/... to
// the Ledger with the code added as its Authorization header. The code stays
// in the dev server; the page learns only the path, through
// import.meta.env.VITE_LEDGER_PROXY, and $core/api.ts sends its Ledger calls
// there instead of answering from sample data. Requests `allow` refuses get
// a 404 from the dev server and never reach the Ledger. A build never has it.

/**
 * The proxy and define entries for an app's vite.config.js.
 * @param {string} command Vite's command: "serve" or "build".
 * @param {Record<string, string | undefined>} env process.env.
 * @param {(method: string, path: string) => boolean} [allow] which requests may pass.
 */
export function ledgerProxy(command, env, allow) {
  const target = env.LEDGER_PROXY;
  if (command !== "serve" || !target) return { define: {}, proxy: undefined };
  const code = env.LEDGER_CODE;
  return {
    define: { "import.meta.env.VITE_LEDGER_PROXY": JSON.stringify("/ledger") },
    proxy: {
      "/ledger": {
        target,
        changeOrigin: true,
        rewrite: (/** @type {string} */ path) => path.replace(/^\/ledger/, ""),
        headers: code ? { Authorization: `Bearer ${code}` } : {},
        // A request the app may not make goes no further: the dev server answers 404.
        bypass: (/** @type {any} */ req) => (allow && !allow(req.method ?? "GET", String(req.url ?? "").replace(/^\/ledger/, "")) ? false : undefined),
      },
    },
  };
}
