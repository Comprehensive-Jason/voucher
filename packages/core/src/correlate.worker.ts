// What goes with a good Day, worked out off the main thread: correlate()
// takes 10 to 40 ms on the tablet, and run on the main thread it lengthened
// the redraw after each new history. correlateOff.ts sends a Request and
// gets the Tested list back, tagged with the number it was sent with. Vite
// bundles this file as a module worker; correlateOff.ts falls back to the
// main thread when it can't start.
import { correlateRequest, type Request } from "./correlate";

/** The worker's global scope, typed by hand: the app's types are the page's (DOM), not a worker's. */
const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; request: Request }>) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = (e) => {
  const { id, request } = e.data;
  scope.postMessage({ id, tested: correlateRequest(request) });
};
