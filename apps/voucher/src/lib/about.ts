// What each tablet card is for and how to read it, shown inside the card
// while arranging (Home.svelte). One entry per panel in lib/cards.ts' PANELS,
// so a new card can't ship without its explanation. Keep each one true to
// what the card's code does: when a card changes, change its entry here.
//
// A color, or a mark the card always draws in one color, is written
// {hue:words}, and the explanation shows those words in that color; the
// hues and the markup are in $core/about.ts.
import type { PanelId } from "./cards";
import { defineAbout } from "$core/about";

export const ABOUT = defineAbout<PanelId>()({
  insights: {
    for: "What my history turned up, and rule changes worth trying for two weeks.",
    read: [
      "One row per finding, the biggest and surest first. The top one sits on a raised row. The first three come first, and the rest scroll under \"N more\".",
      "Every kind: what goes with what (as Counterfoil's Good Days lists them), this week against the 4 weeks before, where lost planned time falls, things that keep happening, Before and after on recent Markers, new records, and lapses.",
      "A sentence says what and when. Sources and blocklists are named in {sources:their own colors}. The pill is the change, {green:green} when better and {crimson:crimson} when worse, and {gold:gold} for a record.",
      "The picture: a ratio dumbbell (Days without, hollow, and with, filled), a sparkline of the last two weeks with the usual {gray:dashed}, an arrow from before a Marker to after it, the hours of the Day with {crimson:the hours that matter}, a record's bar, or the last Days' squares.",
      "The bars say how sure, from shuffling weeks or comparing other weeks in your history: 1 bar Low, 2 Medium, 3 High. Records and lapses are counts, so they have none.",
      "The × hides a finding until it changes a lot, and that kind of finding ranks lower for a while. Tap a row for what it rests on.",
      "\"Try …\" opens the exact rule change, when it starts, and when its verdict comes. Starting it sets a {marker:Marker}; tightenings start at once, the rest at 06:00.",
      "A running Experiment is a dashed row, \"Trying …, Day 5 of 14\". Its first 3 Days settle, the next 14 are measured, and Before and after gives the verdict the Day after, with one notification on the phone. One runs at a time.",
      "Under two weeks of history it counts the Days until the first findings, with what each kind still waits for.",
    ],
  },
  earned: {
    for: "When a Day's Vouchers came in, and from which sources.",
    read: [
      "Day shows one Day hour by hour, 06:00 to 06:00. Week and Month show a bar per Day. Swipe or use the arrows to go back in time.",
      "Each bar is split by source, {sources:one color each}, with its count on top. Curfew's hours are shaded in {night:the night color}.",
      "A {gold:gold star} under a bar marks the hour the Daily goal was met. In Week and Month it marks each Day that met it.",
      "A {marker:flag} over a bar means a Marker in that hour or Day.",
      "In Day only, a {sleep:faint band with a solid top edge} is time asleep, to the minute (hatched when estimated): the end of the night before and the start of that evening's. A {calendar:thin lane} under the bars marks your calendar's busy stretches.",
      "The list below totals each source for what's in view. Tap a bar to list just that hour or Day, and tap it again to go back.",
    ],
  },
  heat: {
    for: "How each Day went at a glance, across the weeks and the year.",
    read: [
      "One {green:square} per Day, a column per week starting Monday. {green:Greener} means more Vouchers, measured against the Daily goal. A {gold:gold square} with a dark dot met the goal.",
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
      "In Day only, a {sleep:faint band with a solid top edge} is time asleep (hatched when estimated), and a {calendar:thin lane} under the bars marks your calendar's busy stretches.",
      "\"Walked away 49 of 67\" counts the times you opened a blocked app while nothing was unlocked, and how many of those ended without an Unlock. Tap a bar to list that hour or Day.",
    ],
  },
  log: {
    for: "Exactly what happened on one Day, entry by entry.",
    read: [
      "Every Voucher earned, every {salmon:Unlock}, and every Marker, newest first, each with its time. Earnings name the app and the task.",
      "The {gold:gold row} is the moment the Daily goal was met, with the Streak at that point.",
      "\"+0, Bank full, lost\" is a Voucher earned while the Bank was full. A {red:red row} is a Gap, when a device had Voucher off, and for how long.",
      "A {sleep:moon} row is the night that led into the Day, at its wake-up time, with its hours asleep. A hollow moon means the night was estimated.",
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
      "A {calendar:thin lane} under the baseline marks the Day's calendar events, so a flat stretch of the line has its reason.",
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
      "A {sleep:tick} on each Day marks when you woke, hollow when the night was estimated, and at 06:00 when you woke before it. From tick to dot is how long you held out after waking.",
      "The {gold:dashed gold line} is the middle first Unlock of the last 4 weeks. A {gray:fainter gray one} marks the 4 weeks before, shown when the two are 10 minutes or more apart.",
      "{night:Curfew's hours} are shaded. A {marker:flag} beside a week's date marks a Marker.",
      "Tap a dot to pick its Day for the other cards. The picked Day is ringed.",
      "In Arrange mode, the From wake switch measures each dot from that Day's wake-up instead of 06:00, on an axis of hours after waking, and the dashed lines become the usual time from waking to the first Unlock. Days without a tracked wake-up are left out: an estimated one comes from the first time you used a device, which may be the Unlock itself.",
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
  replay: {
    for: "How a week, month, or year went, in eight averages.",
    read: [
      "Each number is in its meaning's color. The top row is Vouchers a Day, in {green:green}, and the share of Days that met the Daily goal, in {gold:gold}.",
      "The middle row is how the Vouchers came: the top source, {sources:in its own color}, with its share of Vouchers; the busiest hour, the clock hour that earned the most, in {green:green}; and Distraction minutes a Day, in {ink:ink}, since each blocklist has its own color.",
      "The bottom row is the Day around them: the share of Days that went well, from your Curfew answers, counting Yes and Mostly, in {green:green}; time asleep a night, in {sleep:the sleep color}; and calendar events a Day, in {calendar:the calendar color}. Nights not recorded and Days without a calendar are left out, not counted as none.",
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
      "The strip shows the last 4 weeks, one square a Day. {green:Bright green} is Yes, a {mostly:half-filled dim green} square Mostly, {crimson:crimson} No, and {gray:gray} no answer. A {gold:gold frame} means the goal was met, and a {marker:corner tick} marks a Marker.",
      "Once there are 10 answers, the line underneath says what any mismatch suggests.",
    ],
  },
  compare: {
    for: "Whether a change worked.",
    read: [
      "Pick a Marker with the arrows in the title, such as a rule change or a new term. The card compares the 14 Days before it with 14 Days after, skipping the first 3 after it while things settle.",
      "Rows cover Vouchers a Day, the share of goal Days, Distraction and Unlocked minutes a Day, the share of blocked opens you walked away from, the typical Day's longest focus stretch, time asleep a night, and calendar events a Day. Nights and Days with nothing recorded are left out.",
      "The arrow is {green:green} when a row moved the good way and {crimson:crimson} when it moved the bad way. More events is neither, so its arrow is in {ink:ink}. \"=\" means it moved less than 15%, or 2 points for a percentage.",
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
  planned: {
    for: "Whether time I planned went where I planned it.",
    read: [
      "Time blocks are tasks with a start time and a duration in your task manager. Each block's minutes split into Distraction in {sources:each blocklist's color}, {green:in sources}, elsewhere (other apps, or away from devices), and hatched no data.",
      "As on Distraction time, the minutes an Unlock was open are a {salmon:salmon outline}, with the Distraction used in it filled inside. An Unlock you didn't use costs nothing: its minutes show as whatever your devices saw. Distraction outside any Unlock, from a device that wasn't enforcing, is filled with no outline.",
      "Only Distraction counts as lost, and nothing claims source time was spent on the block's task. The bar and number at the top are the share of planned time lost in what's in view, leaving out no data.",
      "Day shows the picked Day's blocks at their times from 06:00 to 06:00, with {night:Curfew's hours} shaded and a check over each done block.",
      "Week and Month show a column per Day, as tall as its share lost, split by blocklist with the Distraction inside Unlocks at the bottom, and the share an Unlock was open {salmon:outlined}. {marker:Thin lines} mark Markers, and the picked Day is lit.",
      "A block's Distraction is shared among blocklists by the Day's Distraction minutes, since devices don't say which app each minute was in. On a Day a device sent its Distraction minutes without their times, or none sent any (Windows doesn't), Distraction isn't known, so elsewhere shows as no data.",
    ],
  },
});
