// What each of Counterfoil's cards is for and how to read it, shown inside
// the card while arranging. One entry per panel in lib/cards.ts' PANELS; the
// hues and the {hue:words} markup are in $core/about.ts.
import type { PanelId } from "./cards";
import { defineAbout } from "$core/about";

export const ABOUT = defineAbout<PanelId>()({
  sleep: {
    for: "How my nights go, and how the Day after each one went.",
    read: [
      "A row per night, newest at the bottom, on the hours from 20:00 to 12:00. A night belongs to the Day it wakes into. {night:Curfew's hours} are shaded.",
      "A {sleep:filled bar} is a night Health Connect recorded. A {sleep:hollow dashed one} was estimated from when your devices were last and first used. Hours asleep are at the row's end.",
      "The {gold:dashed gold lines} are your usual bedtime and wake-up over the last 4 weeks, their times over them.",
      "Columns at the right show the Day after, picked here in Arrange: your Curfew answer ({green:Yes}, {mostly:Mostly}, or {crimson:No}), Vouchers earned as a {green:green bar} with a {gold:gold tick} at the Daily goal, and Distraction minutes in {sources:each blocklist's color}, hatched when no device reported.",
      "A one-third card fits two columns, a taller one all three. The legend keys each column by its head: Day, Earned, and Distr.",
      "A {marker:flag} by a date marks a Marker. Tap a row to pick its Day for the other cards. The picked Day's row is lit.",
    ],
  },
  calendar: {
    for: "Whether busy Days cost Vouchers.",
    read: [
      "A column per Day over 4 weeks. Time in your chosen calendars' events rises above the middle line in {calendar:the calendar color}, and Vouchers hang below it in {green:green}.",
      "Any timed event counts: a calendar can't say which events are meetings. All-day, declined, and free ones don't.",
      "The {gold:dashed gold line} is the Daily goal, stepping where it changed. {marker:Thin lines} mark Markers.",
      "The arrows step a week at a time. Tap a column to pick its Day for the other cards, and its column is lit.",
      "Calendars are chosen in Voucher, under Rules, Sources; until one is, the card says so.",
    ],
  },
  gooddays: {
    for: "When one thing happens, what else tends to go better or worse: the same Day, the Day after, or the night after.",
    read: [
      "Every finding, all in one place; Voucher's Insights card shows them among its others. Each compares Days with something to Days without it, like \"Anki Days\", \"Day after Workout\", or \"Night after Anki\".",
      "What happens: a source earning, {night:a good night} (asleep at least as long as on half your nights), a busy Day (calendar time among your busiest third of Days), and late Distraction (15 minutes or more after 22:00).",
      "What it looks at: each source's Vouchers, the share of blocked opens you gave in on (ones that ended in an Unlock), the Day's longest focus stretch in minutes, {gray:Distraction} minutes, and {sleep:time asleep}. Findings are grouped by which of these changed.",
      "{gray:Distraction} minutes are only compared with a good night and busy Days, never with a source: what you earn pays for Unlocks, so the two move together by design.",
      "A night belongs to the Day it leads into, so sleep is only compared with the Day before it and a good night only with its own Day. Late Distraction is only compared with that night's sleep.",
      "A Day missing something (no night recorded, no calendar chosen, no device reporting Distraction) is left out of that comparison, not counted as zero.",
      "\"Focus stretch length\" works a little differently: it compares work stretches that had at least 10 minutes of {salmon:an Unlock}, or of Distraction, in the hour before with ones that didn't.",
      "The pill is the change, {green:green} when better and {crimson:crimson} when worse. The split bar counts Days without, hollow, and with, filled.",
      "The bars say how sure the card is that a difference isn't just luck: 1 bar maybe, 2 bars probably, and 3 bars very likely. To check, it shuffles whole weeks, pairing one week's activities with another week's results thousands of times, and sees how often that gives a difference as big. Among findings with 3 bars, up to 1 in 20 is expected to be luck; with 2 bars, up to 1 in 10; with 1 bar, up to 1 in 5. Anything less sure is hidden.",
      "A finding shows once it has at least 8 Days on each side and a change of at least three tenths of how much that measure usually varies from Day to Day, or a fifth when the card is very sure. At two-thirds and Full height, every finding is read on one scale of how many times bigger or smaller it is on Days with, so halving and doubling sit equally far from ×1, where every hollow dot sits. Each side of ×1 reaches only as far as its findings do, so when they all move one way, that side takes nearly the whole width. A change past ×8 or ×1/8 is pinned at the edge with a chevron and its ratio printed.",
      "These are things that go together, not proof that one causes the other.",
    ],
  },
});
