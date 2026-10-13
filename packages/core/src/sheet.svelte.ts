// Whether a page is sliding over or off the tablet's dashboard right now
// (Rules opening or closing; see routes/+layout.svelte). While it moves, the
// dashboard underneath holds still: no clock, no polls, no redraws, since on
// the tablet any redraw of the dashboard during the slide costs a frame.
class Sheet {
  moving = $state(false);
  #safety = 0;

  /** The slide is about to start; `ms` is a safety net in case its end is never heard. */
  start(ms: number) {
    this.moving = true;
    clearTimeout(this.#safety);
    this.#safety = window.setTimeout(() => this.end(), ms);
  }

  end() {
    clearTimeout(this.#safety);
    this.moving = false;
    const waiting = this.#waiting.splice(0);
    if (waiting.length) whenIdle(() => { for (const fn of waiting) fn(); });
  }

  #waiting: (() => void)[] = [];
  /** Runs `fn` now, or once the slide in progress is over and the screen has
   *  a moment: a page sliding in asks the Ledger for fresh answers after it
   *  lands, not while it moves (nor in its last frame). Returns a function
   *  that cancels it, for a page closed before then. */
  afterSlide(fn: () => void): () => void {
    if (!this.moving) { fn(); return () => {}; }
    let wanted = true;
    const run = () => { if (wanted) fn(); };
    this.#waiting.push(run);
    return () => { wanted = false; this.#waiting = this.#waiting.filter((f) => f !== run); };
  }
}

/** Runs `fn` when the screen next has a moment (within half a second either
 *  way); returns a function that cancels it. */
export function whenIdle(fn: () => void): () => void {
  if (typeof requestIdleCallback === "undefined") { const t = setTimeout(fn, 50); return () => clearTimeout(t); }
  const id = requestIdleCallback(fn, { timeout: 500 });
  return () => cancelIdleCallback(id);
}

export const sheet = new Sheet();
