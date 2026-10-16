// The Ledger, over HTTP: its address and the coach code from the
// environment, and one request function. The coach code is the Ledger's
// narrow one (access.coach.code): it reads, sets goals, and changes the
// Daily goal, and the Ledger answers 403 to anything else. This server asks
// for nothing outside that, and checks so before sending (`mayCall`).
import { readFileSync } from "node:fs";
import process from "node:process";

export type Connection = { url: string; code: string | null };

/** COUNTERFOIL_LEDGER_URL, and the code from COUNTERFOIL_CODE or the file
 *  named by COUNTERFOIL_CODE_FILE. Throws a message saying what's missing. */
export function connection(env: NodeJS.ProcessEnv = process.env): Connection {
  const url = env.COUNTERFOIL_LEDGER_URL?.trim().replace(/\/+$/, "");
  if (!url) throw new Error("Set COUNTERFOIL_LEDGER_URL to the Ledger's address, such as http://100.64.0.1:8787.");
  if (!/^https?:\/\//.test(url)) throw new Error("COUNTERFOIL_LEDGER_URL must start with http:// or https://.");
  let code = env.COUNTERFOIL_CODE?.trim() || null;
  if (!code && env.COUNTERFOIL_CODE_FILE) {
    try { code = readFileSync(env.COUNTERFOIL_CODE_FILE, "utf8").trim() || null; } catch (e) {
      throw new Error(`Can't read COUNTERFOIL_CODE_FILE (${env.COUNTERFOIL_CODE_FILE}): ${(e as Error).message}`);
    }
  }
  return { url, code };
}

/** The requests this server makes: reads, goals, and a Daily goal change. */
const POSTS = ["/goal", "/goal/remove", "/change"];
export function mayCall(method: string, path: string, body?: unknown): boolean {
  const route = path.split("?")[0];
  if (method === "GET") return true;
  if (method !== "POST" || !POSTS.includes(route)) return false;
  // A change may only be the Daily goal's.
  return route !== "/change" || (typeof body === "object" && body !== null && Object.keys(body).length === 1 && "DailyGoal" in body);
}

/** An error the Ledger answered with, its status and message kept. */
export class LedgerError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

export async function ledger<T>(c: Connection, method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!mayCall(method, path, body)) throw new Error(`${method} ${path.split("?")[0]} isn't a request this server makes`);
  let reply: Response;
  try {
    reply = await fetch(`${c.url}${path}`, {
      method,
      headers: { ...(c.code ? { Authorization: `Bearer ${c.code}` } : {}), ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new Error(`Can't reach the Ledger at ${c.url}: ${(e as Error).message}. Is Tailscale up?`);
  }
  const text = await reply.text();
  if (reply.status === 401) throw new LedgerError(401, "The Ledger wants its coach code: set COUNTERFOIL_CODE or COUNTERFOIL_CODE_FILE.");
  if (reply.status === 403) throw new LedgerError(403, "The Ledger refused this: the coach code may only read, set goals, and change the Daily goal.");
  if (!reply.ok) {
    let why = text;
    try { const j = JSON.parse(text); why = j.message ?? (j.refused ? `refused: ${j.refused}` : text); } catch { /* plain text */ }
    throw new LedgerError(reply.status, `The Ledger answered ${reply.status}: ${why}`);
  }
  try { return JSON.parse(text) as T; } catch { throw new Error(`The Ledger's reply isn't JSON: ${text.slice(0, 120)}`); }
}
