// The Ledger requests Counterfoil may make: reads, Markers, goals, and the
// Daily goal. Never a Redeem, a check-in (a new device checking in would
// show up as Gaps), a report from a device, or any rule change but the
// Daily goal's: a POST /change body must be exactly {"DailyGoal": n}, which
// the Ledger handles like any Daily goal change (a lower one waits for the
// next Day, and it leaves a rule Marker). $core/api.ts refuses anything
// else before it's sent, and the dev server's Ledger proxy refuses it too
// (packages/core/ledgerProxy.js, which reads the body to check), so it never
// reaches the Ledger either way. The Ledger's coach code allows the same
// and refuses the rest itself. Plain JavaScript, so the Vite config can
// import it as it is.
const READS = ["/key", "/status", "/history", "/day", "/markers", "/calendars", "/insights", "/goals"];
const WRITES = ["/marker", "/marker/remove", "/goal", "/goal/remove"];

/**
 * Whether a POST /change body is a Daily goal change and nothing else.
 * @param {unknown} body
 */
export const isDailyGoalChange = (body) =>
  typeof body === "object" && body !== null && !Array.isArray(body) && Object.keys(body).length === 1 && Number.isInteger(/** @type {Record<string, unknown>} */ (body).DailyGoal);

/**
 * Whether Counterfoil may make this Ledger request.
 * @param {string} method
 * @param {string} path
 * @param {unknown} [body] the request's body, parsed; only a /change reads it
 * @returns {boolean}
 */
export function mayCall(method, path, body) {
  const route = path.split("?")[0];
  if (method === "GET") return READS.includes(route);
  if (method === "POST" && route === "/change") return isDailyGoalChange(body);
  if (method === "POST") return WRITES.includes(route);
  return false;
}
