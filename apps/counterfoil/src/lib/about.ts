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
});
