// The phone's Trends pages, shared between the Trends page (which scrolls)
// and the tab bar (whose Trends tab becomes the page selector while Trends
// is open). One column of cards makes a page.

class PhonePages {
  /** How many pages there are. */
  count = $state(1);
  /** The pages in view, first and last: the same page when it sits square, two while a swipe straddles them. */
  a = $state(0);
  b = $state(0);
  /** Which way the highlight last moved, so its leading edge goes first and the trailing edge follows. */
  right = $state(true);
  /** Goes to a page; set by the Trends page while it's open. */
  go: ((i: number) => void) | null = null;

  set(a: number, b: number) {
    if (a === this.a && b === this.b) return;
    this.right = b > this.b || a > this.a;
    this.a = a;
    this.b = b;
  }
}

export const phonePages = new PhonePages();
