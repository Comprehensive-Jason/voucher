import type { Experiment } from "./insights/types";

// What the Today screen receives from the app's Rust side (see src-tauri/src/lib.rs).
export interface Today {
  bank: number;
  bankLimit: number;
  unlockMinutes: number;
  /** End of the running Unlock in Unix seconds, if its signature checked out. */
  unlockEndsAt: number | null;
  curfewActive: boolean;
  curfewStart: string;
  curfewEnd: string;
  /** The current Day, "2026-10-07"; it starts when Curfew ends. */
  day: string;
  /** Vouchers earned this Day, forfeited ones included. */
  goalDone: number;
  goalTarget: number;
  streakDays: number;
  sources: SourceProgress[];
  /** Today's log, newest first. */
  log: Entry[];
  /** When the running Unlock's Vouchers began (Unix seconds), and how many were torn. */
  unlockStartedAt: number | null;
  unlockVouchers: number;
  /** Minutes a tear could still add before Curfew; null from older Ledgers. */
  curfewRoomMinutes: number | null;
  /** Colours chosen on Rules, by source id. */
  sourceColors: Record<string, string>;
  /** Names of the switched-on blocklists. */
  blocklists: string[];
}

export type SourceKind = "tasks" | "workout" | "focus" | "steps";

/** One source's standing today, from the Ledger. */
export interface SourceProgress {
  id: string;
  /** The group's name, such as "Reading". */
  name?: string;
  color?: string;
  kind: SourceKind;
  on: boolean;
  /** One Voucher per this many tasks or minutes. */
  every: number;
  /** Tasks or minutes toward the next Voucher. */
  progress: number;
  /** Vouchers earned today. */
  earned: number;
}

export type Mode = "locked" | "running" | "curfew" | "full" | "empty";

export function modeOf(t: Today, nowSeconds: number): Mode {
  if (t.curfewActive) return "curfew";
  if (t.unlockEndsAt !== null && t.unlockEndsAt > nowSeconds) return "running";
  if (t.bank >= t.bankLimit) return "full";
  if (t.bank === 0) return "empty";
  return "locked";
}

/** One line of the Ledger's log. */
export type Entry =
  | { kind: "earned"; at: string; task: string; title: string; kept: boolean }
  /** `tickets` is the Ledger's stored name for the Vouchers torn. */
  | { kind: "redeemed"; at: string; tickets: number; minutes: number }
  /** An Enforcer stopped checking in from `at` until `until`. */
  | { kind: "gap"; at: string; device: string; until: string };

/** One Day's score and log, from the Ledger's `GET /day`. */
export interface DaySummary {
  day: string;
  earned: number;
  redeemed: number;
  unlocked_minutes: number;
  goal: number;
  goal_met: boolean;
  goal_met_at: string | null;
  streak: number;
  by_source: Record<string, number>;
  /** Newest first. */
  log: Entry[];
  sources: SourceProgress[];
  /** Minutes in each Distraction app per clock hour (24, midnight first), all
   *  devices together; empty past the kept log, absent from older Ledgers. */
  usage?: Record<string, number[]>;
  /** The blocklist (id) each of those apps is on, where a device said. */
  usage_lists?: Record<string, string>;
  /** Markers that fall in this Day, oldest first. */
  markers?: Marker[];
  /** Minutes in each clock hour each device was silent (not enforcing). */
  silent?: Record<string, number[]>;
  /** The night that ended on this Day's morning; absent from older Ledgers. */
  sleep?: Sleep | null;
  /** The reporting device's calendar load; null when none was sent. */
  calendar?: CalendarDay | null;
  /** An old answer to "How was your energy today?", 1 to 5. Deprecated: the
   *  app no longer asks, but the Ledger still sends answers it kept. */
  energy?: Energy | null;
  /** Time blocks planned in a task manager that start in this Day, oldest
   *  first, with how their minutes went. Absent from older Ledgers. */
  planned?: PlannedBlock[];
}

/** A dated note on the timeline, by hand or (rule) written by the Ledger when a rule changed. */
export interface Marker { at: string; text: string; rule: boolean }

/** The answer to "Did today go the way you wanted?". */
export type Verdict = "yes" | "mostly" | "no";

/** One Day in the Ledger's `GET /history`. */
export interface DayTotal {
  day: string; earned: number; redeemed: number; goal_met: boolean;
  /** Vouchers earned per source; empty for Days older than the kept log. */
  by_source?: Record<string, number>;
  /** Minutes Unlocked this Day; absent from older Ledgers. */
  unlocked_minutes?: number;
  /** Minutes in each Distraction app, all devices together. */
  used?: Record<string, number>;
  /** The blocklist (id) each of those apps is on, where a device said. */
  used_lists?: Record<string, string>;
  /** The Day's Daily goal; absent from older Ledgers. */
  goal?: number;
  /** Vouchers earned per clock hour (24, midnight first); empty past the kept log. */
  hours?: number[];
  /** The Day's first tear, if the log still holds it. */
  first_tear?: string | null;
  /** How many times Vouchers were torn: each tear is one Unlock (or an extension), however many it spent. */
  tears?: number;
  /** Vouchers earned per clock hour for each source; empty past the kept log. */
  source_hours?: Record<string, number[]>;
  /** Every unbroken stretch in a focus app, in minutes; empty past the kept log. */
  stretches?: number[];
  /** Opens of a blocked app, and how many ended without an Unlock. */
  opens?: number;
  walked?: number;
  /** Whether any device reported Distraction minutes: if not, zero means "not measured". */
  reported?: boolean;
  /** Minutes in each clock hour each device was silent (not enforcing). */
  silent?: Record<string, number[]>;
  /** The Day's answer to the Curfew question. */
  verdict?: Verdict | null;
  /** Why each Unlock happened, where one was given: [clock hour, reason]. */
  reasons?: [number, string][];
  /** The night that ended on this Day's morning; absent from older Ledgers. */
  sleep?: Sleep | null;
  /** The reporting device's calendar load; null when none was sent. */
  calendar?: CalendarDay | null;
  /** An old answer to "How was your energy today?", 1 to 5. Deprecated: the
   *  app no longer asks, but the Ledger still sends answers it kept. */
  energy?: Energy | null;
  /** The focus stretches whose Enforcer said when each started and in which
   *  source, oldest first; older Enforcers send lengths only, so these can be
   *  fewer than `stretches`. Absent from older Ledgers, empty past the log. */
  timed_stretches?: TimedStretch[];
  /** Unlocks that ran this Day, [from, to], oldest first, from the log.
   *  Absent from older Ledgers, empty past the log. */
  unlocks?: [string, string][];
  /** When Distraction apps and sites were in use, [from, to], every device's
   *  merged, oldest first: null unless every device that reported
   *  Distraction minutes also sent spans (older Enforcers send minutes per
   *  hour only). Absent from older Ledgers. */
  distraction_spans?: [string, string][] | null;
  /** Time blocks planned in a task manager that start in this Day, oldest
   *  first, with how their minutes went. Absent from older Ledgers, empty
   *  past the log. */
  planned?: PlannedBlock[];
}

/** One time block planned in a task manager (a task with a due time and a
 *  duration), as the Ledger snapshotted it: no title, and never matched to
 *  an app. A block edited after it started keeps the plan it had then. */
export interface PlannedBlock {
  start: string;
  minutes: number;
  /** When its task was completed; null if it wasn't. */
  done_at: string | null;
  /** The task manager it came from, such as "todoist". */
  service: string;
  split: PlannedSplit;
  /** Minutes each earning source was active in the block, outside
   *  Distraction; two at once each count, so these can add up to more than
   *  `split.sources`. */
  source_minutes: Record<string, number>;
  /** Vouchers earned by finishing tasks inside the block, any task's. */
  task_vouchers: number;
}

/** Where a block's minutes went: `sources`, `distraction`, `other`, and
 *  `unknown` add up to its minutes (Distraction first, then sources, then
 *  other, then unknown). Overlapping blocks each count the minutes they
 *  share. The Unlock fields lie over that split instead of adding to it:
 *  `unlocked` is the minutes an Unlock was open, and `distraction_unlocked`
 *  and the three `unlocked_*` say what they went to and add up to it. An
 *  Unlock left unused costs nothing. Older Ledgers send the four parts only,
 *  with Unlocks counted in `distraction`. */
export interface PlannedSplit {
  /** In an earning source (a timed focus stretch), outside Distraction. */
  sources: number;
  /** In a Distraction app or site, from devices' Distraction spans, in an
   *  Unlock or not (outside one, a device wasn't enforcing). On a Day whose
   *  `distraction_spans` is null, only what the devices that sent spans saw. */
  distraction: number;
  /** Anything else while a device was reporting: other apps, or away from
   *  devices. Neutral. */
  other: number;
  /** No device was reporting then (none sent anything for the Day, all were
   *  silent, or it hasn't happened yet). */
  unknown: number;
  /** Minutes with an Unlock open. Absent from older Ledgers. */
  unlocked?: number;
  /** Of `distraction`, the minutes inside an Unlock. */
  distraction_unlocked?: number;
  /** Of `sources`, the minutes inside an Unlock. */
  unlocked_sources?: number;
  /** Of `other`, the minutes inside an Unlock. */
  unlocked_other?: number;
  /** Of `unknown`, the minutes inside an Unlock. */
  unlocked_unknown?: number;
}

/** A focus stretch with when it started and its source's id. */
export interface TimedStretch { start: string; minutes: number; source: string }

/** A Day's night of sleep, from the Ledger. It belongs to the Day its
 *  wake-up leads into: the local date of the wake time, so a 05:30 wake-up
 *  (still in Curfew) counts toward the Day starting at 06:00 that morning. */
export interface Sleep {
  bedtime: string;
  wake: string;
  /** Minutes asleep: Health Connect's session less its awake stages, or an
   *  estimate's whole stretch less brief use in the small hours. */
  asleep: number;
  /** "health_connect", or "estimated" from when devices were last and first used. */
  source: "health_connect" | "estimated";
  /** The app that recorded it (Health Connect only), such as "Samsung Health". */
  origin?: string;
  /** The device that read it from Health Connect. */
  device?: string;
}

/** A Day's calendar load: timed events only (no all-day, declined, or free
 *  ones), with no titles, people, or places. */
export interface CalendarDay {
  /** Timed events starting in this Day (any event: a calendar can't say which are meetings). */
  events: number;
  /** Minutes with at least one event, overlaps counted once. */
  busy_minutes: number;
  /** Busy minutes per clock hour (24, midnight first); empty past the kept log. */
  busy_hours: number[];
  /** Events starting in each clock hour (24, midnight first); empty past the kept log. */
  event_hours: number[];
  /** Busy stretches, overlaps merged, oldest first, as [start, end]; empty past the kept log. */
  busy: [string, string][];
}

/** "How was your energy today?": 1 drained to 5 full of energy. Deprecated: no longer asked. */
export type Energy = 1 | 2 | 3 | 4 | 5;

/** One calendar, named the same on every device that syncs it. */
export interface CalendarId {
  /** Such as "you@example.com". */
  account: string;
  /** Its display name, such as "Classes". */
  name: string;
  /** "#rrggbb", for showing the choice where calendars can't be listed. */
  color?: string;
}

/** Which calendars count toward the calendar load, and the one device that reads them. */
export interface CalendarChoice {
  /** The device the choice was saved on, which reports the calendars; null before any choice. */
  device: string | null;
  calendars: CalendarId[];
}

/** The calendars on this Android device, from the Android side. */
export interface DeviceCalendars {
  /** Whether Voucher may read calendars here. */
  granted: boolean;
  calendars: CalendarId[];
}

/** What the phone itself measured today, from the Android side. */
export interface DeviceUsage {
  /** False without usage access: minutes are unknown, opens are still counted. */
  measured: boolean;
  /** Minutes in foreground per Distraction app today, most first. */
  apps: { label: string; minutes: number }[];
  /** Times a paused app was opened today, and how many of those ended without a tear. */
  blockedOpens: number;
  closedWithoutTearing: number;
  /** Opens of each paused app today, most first. */
  attempts: { label: string; count: number }[];
}

/** The phone's protection parts, from the Android side. */
export interface Protection {
  /** Voucher is Device Owner: it can pause apps, and can't be uninstalled. */
  deviceOwner: boolean;
  /** Usage access: Focused time and Distraction minutes can be measured. */
  usageAccess: boolean;
  /** The Accessibility service that draws the blocked-app screen and measures site time. */
  overlay: boolean;
}

/** A pending change as the Ledger sends it: `[change, effective_at]`. */
export type Pending = [Record<string, unknown>, string];

export interface Settings {
  time_zone: string;
  bank_limit: number;
  unlock_minutes: number;
  curfew_start: string;
  curfew_end: string;
  morning_boundary: string;
  daily_goal: number;
  sources: Record<string, Source>;
  blocklists: Record<string, Blocklist>;
  released_devices: string[];
}

/** A source: a named group with one counter and one Earning rate. Its
 *  `packages` are apps (Focus) or services (Tasks: `todoist`, `clickup`). */
export interface Source {
  name: string;
  kind: SourceKind;
  on: boolean;
  every: number;
  packages: string[];
  labels?: Record<string, string>;
  max_heart_rate?: number;
  color?: string;
}

export interface Status {
  bank: number;
  curfew_active: boolean;
  settings: Settings;
  pending: Pending[];
  today: DaySummary;
  /** What went wrong with each polled source's last check, such as "sign-in expired". */
  source_errors: Record<string, string>;
  /** False until first-run setup finishes; until then changes apply at once. */
  setup_complete: boolean;
  /** While the grace period after setup runs (every change applies at once), when it ends. */
  grace_until?: string | null;
  /** The first Day with any history; Trends scrolls back no further. Older Ledgers omit it. */
  first_day?: string;
  /** The oldest Day whose hour-by-hour log is kept. */
  log_first_day?: string;
  /** Which calendars count, and the device that reports them; absent from older Ledgers. */
  calendars?: CalendarChoice;
  /** Experiments running, or judged and waiting for Keep it or Go back; absent from older Ledgers. */
  experiments?: Experiment[];
}

export interface BlockedApp { package: string; label: string; note: string | null; on: boolean; added: boolean }
export interface BlockedSite { site: string; note: string | null; on: boolean; added: boolean }
export interface Blocklist { name: string; color: string; premade: boolean; on: boolean; apps: BlockedApp[]; sites: BlockedSite[] }
