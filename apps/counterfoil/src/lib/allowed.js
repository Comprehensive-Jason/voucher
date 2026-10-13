// The Ledger requests Counterfoil may make: reads, and Markers. Never a
// Redeem, a rule change, a report from a device, or a check-in (a new device
// checking in would show up as Gaps). $core/api.ts refuses anything else
// before it's sent, and the dev server's Ledger proxy refuses it too
// (vite.config.js), so it never reaches the Ledger either way. Plain
// JavaScript, so the Vite config can import it as it is.
const READS = ["/key", "/status", "/history", "/day", "/markers", "/calendars", "/insights"];
const WRITES = ["/marker", "/marker/remove"];

/**
 * Whether Counterfoil may make this Ledger request.
 * @param {string} method
 * @param {string} path
 * @returns {boolean}
 */
export function mayCall(method, path) {
  const route = path.split("?")[0];
  if (method === "GET") return READS.includes(route);
  if (method === "POST") return WRITES.includes(route);
  return false;
}
