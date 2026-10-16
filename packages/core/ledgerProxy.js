// For a dev server only: lets a browser build read a real Ledger. With
// LEDGER_PROXY (the Ledger's address, such as http://100.x.y.z:8787) and
// LEDGER_CODE (its access code) set, the dev server forwards /ledger/... to
// the Ledger with the code added as its Authorization header. The code stays
// in the dev server; the page learns only the path, through
// import.meta.env.VITE_LEDGER_PROXY, and $core/api.ts sends its Ledger calls
// there instead of answering from sample data. Requests `allow` refuses get
// a 404 from the dev server and never reach the Ledger. To check a POST by
// its body (Counterfoil may send /change only for the Daily goal), the proxy
// reads the body first, then sends it on as it came. A build never has it.

/**
 * The proxy and define entries for an app's vite.config.js.
 * @param {string} command Vite's command: "serve" or "build".
 * @param {Record<string, string | undefined>} env process.env.
 * @param {(method: string, path: string, body?: unknown) => boolean} [allow] which requests may pass.
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
        // The body read for the check goes out again as the request's body.
        configure: (/** @type {any} */ proxy) => {
          proxy.on("proxyReq", (/** @type {any} */ out, /** @type {any} */ req) => {
            if (!req.readBody) return;
            out.setHeader("Content-Length", req.readBody.length);
            out.write(req.readBody);
          });
        },
        // A request the app may not make goes no further: the dev server answers 404.
        bypass: async (/** @type {any} */ req) => {
          if (!allow) return undefined;
          const method = req.method ?? "GET", path = String(req.url ?? "").replace(/^\/ledger/, "");
          let body;
          if (method === "POST") {
            req.readBody = await readAll(req);
            try { body = req.readBody.length ? JSON.parse(req.readBody.toString("utf8")) : undefined; } catch { body = undefined; }
          }
          return allow(method, path, body) ? undefined : false;
        },
      },
    },
  };
}

/**
 * A request's whole body.
 * @param {AsyncIterable<Uint8Array>} req
 */
async function readAll(req) {
  const parts = [];
  for await (const part of req) parts.push(part);
  return Buffer.concat(parts);
}
