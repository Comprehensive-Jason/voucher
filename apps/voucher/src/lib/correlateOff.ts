// correlate() runs in a Web Worker (correlate.worker.ts), one for the whole
// app, started when a card first asks. It takes 10 to 40 ms on the tablet,
// which on the main thread lengthened every redraw that new history brings
// (the one after closing Rules, especially). If the worker can't start (no
// module workers, the script won't load, or it never answers its first
// question), the same function runs on the main thread instead, so a card
// works either way and the answer is the same: correlate's shuffles are
// seeded from the Days.
//
// This file sits beside the worker because `new URL(..., import.meta.url)`
// takes a plain relative path: Vite bundles the worker from it, and an
// alias such as $lib wouldn't resolve there.
import { correlateRequest, type Request, type Tested } from "./correlate";

/** undefined: not started yet; null: unavailable, so the main thread does it. */
let worker: Worker | null | undefined;
/** Whether the worker has answered once: after that it's trusted however long it takes. */
let proven = false;
let sent = 0;
const waiting = new Map<number, { request: Request; resolve: (t: Tested[]) => void }>();
/** How long a first answer may take before the worker is given up on. */
const FIRST_ANSWER_MS = 8000;

function giveUp() {
  if (worker) console.warn("What goes with a good Day: the worker didn't start, so it compares on the main thread");
  worker?.terminate();
  worker = null;
  for (const [id, w] of waiting) { waiting.delete(id); w.resolve(correlateRequest(w.request)); }
}

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = new Worker(new URL("./correlate.worker.ts", import.meta.url), { type: "module" });
  } catch {
    return (worker = null);
  }
  worker.onmessage = (e: MessageEvent<{ id: number; tested: Tested[] }>) => {
    proven = true;
    const w = waiting.get(e.data.id);
    if (!w) return;
    waiting.delete(e.data.id);
    w.resolve(e.data.tested);
  };
  worker.onerror = (e) => { e.preventDefault(); giveUp(); };
  worker.onmessageerror = giveUp;
  return worker;
}

/** correlate() off the main thread, or on it when the worker can't be had. */
export function correlateOff(request: Request): Promise<Tested[]> {
  const w = startWorker();
  if (!w) return Promise.resolve(correlateRequest(request));
  return new Promise((resolve) => {
    const id = ++sent;
    waiting.set(id, { request, resolve });
    if (!proven) setTimeout(() => { if (!proven && worker === w) giveUp(); }, FIRST_ANSWER_MS);
    try { w.postMessage({ id, request }); } catch { giveUp(); }
  });
}
