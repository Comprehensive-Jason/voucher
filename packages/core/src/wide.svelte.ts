// Whether the screen is wide enough for the tablet's multi-column layout
// (a landscape tablet or a desktop window), and whether it stands upright:
// a portrait tablet shows two columns, the Today column and one column of
// cards that scrolls up and down.
const QUERY = "(min-width: 1000px)";
const PORTRAIT = "(orientation: portrait)";

class Wide {
  on = $state(typeof window !== "undefined" && window.matchMedia(QUERY).matches);
  portrait = $state(typeof window !== "undefined" && window.matchMedia(PORTRAIT).matches);
  constructor() {
    if (typeof window !== "undefined") {
      window.matchMedia(QUERY).addEventListener("change", (e) => (this.on = e.matches));
      window.matchMedia(PORTRAIT).addEventListener("change", (e) => (this.portrait = e.matches));
    }
  }
}

export const wide = new Wide();
