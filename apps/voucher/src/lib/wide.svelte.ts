// Whether the screen is wide enough for the tablet's three-column layout
// (a landscape tablet or a desktop window).
const QUERY = "(min-width: 1000px)";

class Wide {
  on = $state(typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  constructor() {
    if (typeof window !== "undefined") {
      window.matchMedia(QUERY).addEventListener("change", (e) => (this.on = e.matches));
    }
  }
}

export const wide = new Wide();
