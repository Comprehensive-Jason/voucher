// What each tablet card is for and how to read it, shown inside the card
// while arranging (Home.svelte). One entry per panel in arrangement's PANELS,
// so a new card can't ship without its explanation. Keep each one true to
// what the card's code does: when a card changes, change its entry here.
//
// A color, or a mark the card always draws in one color (the gold Daily goal
// line, a Marker's flag, Curfew's shading, a salmon Unlock), is written
// {hue:words}, and the explanation shows those words in that color
// (components/AboutText.svelte). Hues are the keys of HUES; an unknown one
// fails type-check. Neutral outlines and rings aren't marked unless the
// text names their color ("gray", "ink").
import type { PanelId } from "./arrangement.svelte";

/** Each hue's color on the card (`mark`, its theme token) and as 13px text on
 *  --surface (`text`, at least 4.5:1). The dark ones get a lighter tint of the
 *  same OKLCH hue for text: crimson #e85770 (5.1:1, token 2.7:1), the danger
 *  red #fe3e30 (5.0:1, token 4.49:1), and Marker #9271fe (5.1:1, token 3.0:1),
 *  turned 15 degrees toward violet, since the Marker violet-blue lightened
 *  on its own hue is Curfew's indigo. `sources` has no one color: the words
 *  get a band of source colors under them instead. */
export const HUES = {
  green: { mark: "var(--voucher)", text: "var(--voucher)" },
  mostly: { mark: "var(--mostly-ink)", text: "var(--mostly-ink)" },
  gold: { mark: "var(--goal)", text: "var(--goal)" },
  salmon: { mark: "var(--spend)", text: "var(--spend)" },
  crimson: { mark: "var(--worse)", text: "#e85770" },
  red: { mark: "var(--danger)", text: "#fe3e30" },
  marker: { mark: "var(--marker)", text: "#9271fe" },
  night: { mark: "var(--night)", text: "var(--night)" },
  energy: { mark: "var(--energy)", text: "var(--energy)" },
  gray: { mark: "var(--muted)", text: "var(--muted)" },
  ink: { mark: "var(--ink)", text: "var(--ink)" },
  sources: { mark: "linear-gradient(90deg, #05afa5, #289ffb, #b57ae2, #e6688d, #8ba60c)", text: "var(--ink)" },
} as const;
export type Hue = keyof typeof HUES;

/** How the colored words look: "text" colors the words themselves; "mark"
 *  keeps them in ink on a soft wash of the color, with a solid underline in
 *  it. One switch for every card. */
export const HIGHLIGHT: "text" | "mark" = "text";

export type About = {
  /** The question the card answers, in a sentence or two. */
  for: string;
  /** What its marks, colors, numbers, and controls mean, one short point each. */
  read: readonly string[];
};

/** A piece of explanation text: plain, or in a hue. */
export type Run = { text: string; hue?: Hue };

const RUN = /\{(\w+):([^{}]+)\}/g;

/** Splits "{gold:dashed gold line}" markup into runs. */
export function runs(text: string): Run[] {
  const out: Run[] = [];
  let at = 0;
  for (const m of text.matchAll(RUN)) {
    if (m.index > at) out.push({ text: text.slice(at, m.index) });
    out.push(m[1] in HUES ? { text: m[2], hue: m[1] as Hue } : { text: m[2] });
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ text: text.slice(at) });
  return out;
}

// Type-level check of the markup: every {key:words} must name a hue.
type Unknown<S extends string> = S extends `${string}{${infer K}:${string}}${infer Rest}` ? (K extends Hue ? never : K) | Unknown<Rest> : never;
type Checked<S> = S extends string ? ([Unknown<S>] extends [never] ? S : `Unknown hue "${Unknown<S>}"`) : S;
type CheckAll<T> = { [P in keyof T]: { for: T[P] extends { for: infer F } ? Checked<F> : never; read: T[P] extends { read: infer R extends readonly string[] } ? { [I in keyof R]: Checked<R[I]> } : never } };
function checked<const T extends Record<PanelId, About>>(t: T & CheckAll<T>): Record<PanelId, About> {
  if (import.meta.env?.DEV) for (const a of Object.values<About>(t)) for (const line of [a.for, ...a.read]) {
    const left = line.replace(RUN, (m, k: string) => (k in HUES ? "" : m));
    if (/[{}]/.test(left)) console.error(`about.ts: bad color markup in "${line}"`);
  }
  return t;
}

export const ABOUT = checked({
  earned: {
    for: "When a Day's Vouchers came in, and from which sources.",
    read: [
      "Day shows one Day hour by hour, 06:00 to 06:00. Week and Month show a bar per Day. Swipe or use the arrows to go back in time.",
      "Each bar is split by source, {sources:one color each}, with its count on top. Curfew's hours are shaded in {night:the night color}.",
      "A {gold:gold star} under a bar marks the hour the Daily goal was met. In Week and Month it marks each Day that met it.",
      "A {marker:flag} over a bar means a Marker in that hour or Day.",
      "The list below totals each source for what's in view. Tap a bar to list just that hour or Day, and tap it again to go back.",
    ],
  },
  heat: {
    for: "How each Day went at a glance, across the weeks and the year.",
    read: [
      "One {green:square} per Day, a column per week starting Monday. {green:Greener} means more Vouchers, measured against the Daily goal. A {gold:gold square} met the goal.",
      "A {marker:corner tick} marks a Day with a Marker.",
      "Swipe back for earlier weeks. Year fits the last 53 weeks into the same width.",
      "Tap a square to show that Day on the other cards. The outlined square is the Day they show, and Today brings you back.",
    ],
  },
  distraction: {
    for: "How much time went to Distractions, when, and how much of it Unlocks allowed.",
    read: [
      "Bars are minutes in Distractions as your devices report them, {sources:one color per blocklist}. Apps on no blocklist count as Other.",
      "Day shows one Day hour by hour. Week and Month show a bar per Day.",
      "The {salmon:salmon outline} behind a bar is the time Unlocks allowed. A {salmon:salmon triangle} under it counts the Vouchers torn.",
      "A hatched hour is one Voucher wasn't watching for 15 minutes or more, so a low bar there means unknown, not none.",
      "\"Walked away 49 of 67\" counts the times you opened a blocked app while nothing was unlocked, and how many of those ended without an Unlock. Tap a bar to list that hour or Day.",
    ],
  },
  log: {
    for: "Exactly what happened on one Day, entry by entry.",
    read: [
      "Every Voucher earned, every {salmon:Unlock}, and every Marker, newest first, each with its time. Earnings name the app and the task.",
      "The {gold:gold row} is the moment the Daily goal was met, with the Streak at that point.",
      "\"+0, Bank full, lost\" is a Voucher earned while the Bank was full. A {red:red row} is a Gap, when a device had Voucher off, and for how long.",
      "The arrows step back through about half a year. Older Days keep only their totals. A Day picked on another card opens here too.",
      "The × on a Marker you wrote removes it.",
    ],
  },
  pace: {
    for: "Whether I'm ahead of or behind my usual pace today.",
    read: [
      "The {green:green line} climbs with each Voucher today, or on the picked Day. The {green:dot} is where it stands now, with the count beside it.",
      "The {green:faint green band} is your usual Day, the middle half of the 30 Days before it, hour by hour. The whisker through the dot is the usual range at this hour.",
      "The {gold:dashed gold line} is the Daily goal. The {gold:gold tick} on it, with its time, is when you usually reach it.",
      "The Day runs 06:00 to 06:00 with {night:Curfew's hours} shaded. A {marker:thin line} marks a Marker.",
    ],
  },
  trend: {
    for: "Whether I'm earning more and spending less than before.",
    read: [
      "{green:Green} is Vouchers earned a Day and {salmon:salmon} is Vouchers torn on Unlocks, each a 7-day average. The {ink:dotted ink line} is what you kept, earned minus torn.",
      "The bold number at each line's right end is its latest average. The faint one at the left is where it started.",
      "The {gold:dashed gold line} is the Daily goal. {marker:Thin lines} mark Markers, so a bend in the lines can be matched to what changed.",
      "The switch shows 12 weeks or 6 months. Today joins once it's over.",
    ],
  },
  when: {
    for: "Which hours of the Day I earn in.",
    read: [
      "A row per Day, or the average Day of each week or month, and a cell per hour from 06:00. {green:Brighter green} means more Vouchers. Empty Curfew hours are tinted in {night:the night color}.",
      "Newest is at the bottom. Scroll up for earlier rows.",
      "The outlined column is the busiest hour over every Day the log keeps hours for, with its time over it.",
      "A {marker:flag} after a date marks a Marker. Day, Week, and Month switch along with the other cards, and the picked Day's row is in bold.",
    ],
  },
  runway: {
    for: "How long I hold out each morning before the first Unlock.",
    read: [
      "A row per week, newest at the bottom. Each {salmon:dot} is a Day's first Unlock on the hours from 06:00 to 06:00, so further right means a longer morning.",
      "A {salmon:hollow dot} in the \"none\" column is a Day with no Unlock at all.",
      "The {gold:dashed gold line} is the middle first Unlock of the last 4 weeks. A {gray:fainter gray one} marks the 4 weeks before, shown when the two are 10 minutes or more apart.",
      "{night:Curfew's hours} are shaded. A {marker:flag} beside a week's date marks a Marker.",
      "Tap a dot to pick its Day for the other cards. The picked Day is ringed.",
    ],
  },
  strength: {
    for: "Whether meeting the Daily goal is becoming a habit.",
    read: [
      "The {gold:gold line} is a score from 0% to 100%. Each goal Day moves it about a nineteenth of the way up, each miss the same toward 0%, so a miss dents it and never resets it.",
      "{green:Green ticks} along the bottom are goal Days. A {crimson:crimson bar} there is a lapse, missed Days in a row ended by a goal Day. A {crimson:faint crimson band} marks a lapse longer than usual.",
      "The number at the right end is the latest score. The {gold:ring} two weeks back carries that Day's score for comparison.",
      "\"Lapses: usually 2 Days\" is the middle lapse length once there are 3. From 9 lapses on it gives the last 6, and what earlier ones were if that differs.",
      "{marker:Thin lines} mark Markers. Today joins once it's over.",
    ],
  },
  streaks: {
    for: "Which sources I'm keeping up, Day after Day.",
    read: [
      "A row per switched-on source and a square per Day, filled in {sources:the source's color} when it earned at least one Voucher.",
      "The number at the right is how many Days in a row the source has earned up to now. Today doesn't break a run while it's still going. The longest current run is in {ink:ink}.",
      "Scroll sideways for earlier Days. Month names and each Monday's date run along the top.",
      "A {marker:corner tick} marks a Day with a Marker. Tap a square to pick its Day for the other cards, and its column gets an outline.",
    ],
  },
  records: {
    for: "My bests, to try to beat.",
    read: [
      "Most Vouchers in a Day, the longest Streak, the most goal Days in one Monday-to-Sunday week, the latest first Unlock, and the most Vouchers from one source in a Day.",
      "Each shows its {gold:value} and when it was set. Records only go up.",
      "{gold:\"New\"} marks a record set today.",
    ],
  },
  best: {
    for: "When each kind of work goes best.",
    read: [
      "A row per source showing how its Vouchers spread over the hours from 06:00 to 06:00, added up over the chosen range.",
      "Each row is scaled to its own busiest hour, so a quiet source's shape shows as clearly as a busy one's. Heights don't compare between rows.",
      "The busiest hour's bar is solid, with its time over it. {night:Curfew's hours} are shaded.",
      "The switch picks which Days count: 4 weeks, 12 weeks, 6 months, or all of them.",
    ],
  },
  gooddays: {
    for: "When one thing happens, what else tends to go better or worse: the same Day, the Day after, or the night after.",
    read: [
      "Each finding compares Days with something to Days without it, like \"Anki Days\", \"Day after Workout\", or \"Night after Anki\".",
      "What happens: a source earning, {night:a good night} (asleep at least as long as on half your nights), a busy Day (calendar time among your busiest third of Days), and late Distraction (15 minutes or more after 22:00).",
      "What it looks at: each source's Vouchers, the share of Vouchers torn, the share of blocked opens you walked away from, the Day's longest focus stretch in minutes, {night:time asleep}, and your {energy:energy} answer. Findings are grouped by which of these changed.",
      "A night belongs to the Day it leads into, so sleep is only compared with the Day before it and a good night only with its own Day. Late Distraction is only compared with that night's sleep and the next Day's energy.",
      "A Day missing something (no night recorded, no calendar chosen, no energy answer) is left out of that comparison, not counted as zero.",
      "\"Focus stretch length\" works a little differently: it compares work stretches that had at least 10 minutes of {salmon:an Unlock}, or of Distraction, in the hour before with ones that didn't.",
      "The pill is the change, {green:green} when better and {crimson:crimson} when worse. The split bar counts Days without, hollow, and with, filled.",
      "The bars say how sure the card is that a difference isn't just luck: 1 bar maybe, 2 bars probably, and 3 bars very likely. Findings that are more likely luck than real are hidden.",
      "A finding shows once it has at least 8 Days on each side and a change of at least a quarter of the usual level, or a tenth when the card is very sure. Each group's scale fits what it shows.",
      "These are things that go together, not proof that one causes the other.",
    ],
  },
  replay: {
    for: "How a week, month, or year went, in six averages.",
    read: [
      "Vouchers a Day, the top source and its share of Vouchers, and the share of Days that met the Daily goal, {gold:in gold}.",
      "Distraction minutes a Day, the busiest hour, and the share of Days that went well, from your Curfew answers, counting Yes and Mostly.",
      "It shows the period holding the picked Day, and the arrows step through periods. Week and Month switch with the other cards. Year is this card's own.",
      "Today counts only when it's the period's only Day. Days no device reported are left out of the Distraction minutes.",
    ],
  },
  focus: {
    for: "Whether I'm focusing in longer stretches.",
    read: [
      "A stretch is unbroken time in one source. Switching between its apps or sites, or stepping away for under 2 minutes, doesn't end it.",
      "Each {gray:gray column} spans the middle half of a period's stretches. The {ink:ink line} runs through each period's typical stretch, the median, with the latest at the right end and the first, faint, over the first column.",
      "Week shows each of the last 7 Days, Month the last 5 weeks, and Year the last 12 months.",
      "A {marker:flag} over a column marks a Marker in that period.",
    ],
  },
  verdicts: {
    for: "Whether the Daily goal measures what I care about.",
    read: [
      "The table counts your answers to the Curfew question, \"Did today go the way you wanted?\", over the last 8 weeks, split by whether the goal was met.",
      "Goal Days that went badly and missed Days that went well are the ones to look at. They say the goal or the sources may be weighing the wrong things.",
      "The strip shows the last 4 weeks, one square a Day. {green:Bright green} is Yes, {mostly:dim green} Mostly, {crimson:crimson} No, and {gray:gray} no answer. A {gold:gold frame} means the goal was met, and a {marker:corner tick} marks a Marker.",
      "Once there are 10 answers, the line underneath says what any mismatch suggests.",
    ],
  },
  compare: {
    for: "Whether a change worked.",
    read: [
      "Pick a Marker with the arrows in the title, such as a rule change or a new term. The card compares the 14 Days before it with 14 Days after, skipping the first 3 after it while things settle.",
      "Rows cover Vouchers a Day, the share of goal Days, Distraction and Unlocked minutes a Day, the share of blocked opens you walked away from, and the typical Day's longest focus stretch.",
      "The arrow is {green:green} when a row moved the good way and {crimson:crimson} when it moved the bad way. \"=\" means it moved less than 15%, or 2 points for a percentage.",
      "The line underneath checks luck on Vouchers a Day by asking how often two same-length stretches elsewhere in your history differ as much. \"Likely real\" means 10% or fewer do.",
    ],
  },
  reasons: {
    for: "What pulls me toward an Unlock.",
    read: [
      "Each row is a reason you tapped after an Unlock (\"Why now?\") in the last 4 weeks, most common first, with a {salmon:bar} and its count. The top reason's bar is in {salmon:full color}.",
      "The four cells split each reason by part of the Day: Morning 06 to 12, Afternoon 12 to 17, Evening 17 to 22, and Night 22 to 06. {salmon:Deeper salmon} means more.",
      "The line on top says how many of the period's Unlocks had a reason.",
    ],
  },
});
