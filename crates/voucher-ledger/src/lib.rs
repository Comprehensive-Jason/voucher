//! The Ledger's rules: crediting Vouchers to the Bank, Redeeming them for
//! signed Unlocks, Curfew, holding Loosenings until the Morning boundary, and
//! keeping score of each Day (the Daily goal, the Streak, and the log).
//! Pure logic: every method takes the current time, so tests can control it.

pub mod access;
pub mod clickup;
pub mod instances;
pub mod todoist;

use std::{
    cmp::Reverse,
    collections::{BTreeMap, HashSet},
};

use ed25519_dalek::SigningKey;
use jiff::{
    SignedDuration, Timestamp,
    civil::{Date, Time},
    tz::TimeZone,
};
use serde::{Deserialize, Serialize};
use voucher_protocol::{Unlock, sign};

/// The tunable numbers and times the rules run on.
#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Settings {
    #[serde(with = "jiff::fmt::serde::tz::required")]
    pub time_zone: TimeZone,
    pub bank_limit: u32,
    pub unlock_minutes: u32,
    pub curfew_start: Time,
    pub curfew_end: Time,
    pub morning_boundary: Time,
    /// Vouchers to earn in a Day for it to count toward the Streak.
    #[serde(default = "default_daily_goal")]
    pub daily_goal: u32,
    /// Every Activity source, by id (`tasks`, `obsidian`, …). Each is a
    /// group: one counter and one Earning rate for all of its members.
    #[serde(default = "default_sources")]
    pub sources: BTreeMap<String, Source>,
    /// Every blocklist, by id. What they block, merged, is the Distractions.
    #[serde(default = "default_blocklists")]
    pub blocklists: BTreeMap<String, Blocklist>,
    /// Devices whose Enforcer may stop blocking and give up Device Owner.
    #[serde(default)]
    pub released_devices: std::collections::BTreeSet<String>,
}

/// A named set of apps and sites that stay blocked outside an Unlock.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Blocklist {
    pub name: String,
    pub color: String,
    /// Shipped with Voucher, so it can be reset to its original entries.
    pub premade: bool,
    pub on: bool,
    pub apps: Vec<BlockedApp>,
    pub sites: Vec<BlockedSite>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockedApp {
    /// The Android package name.
    pub package: String,
    pub label: String,
    #[serde(default)]
    pub note: Option<String>,
    pub on: bool,
    /// Added by the user rather than shipped with a premade list.
    #[serde(default)]
    pub added: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct BlockedSite {
    /// A domain, which covers its subdomains, or `list:<name>` for a
    /// maintained list of domains such as `list:invidious`.
    pub site: String,
    #[serde(default)]
    pub note: Option<String>,
    pub on: bool,
    #[serde(default)]
    pub added: bool,
}

/// Everything blocked right now, merged across switched-on blocklists.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct Blocked {
    /// Android package names.
    pub apps: Vec<String>,
    /// Domains, and `list:` names for maintained lists.
    pub sites: Vec<String>,
}

/// The blocklists a new Ledger starts with.
pub fn default_blocklists() -> BTreeMap<String, Blocklist> {
    ["instagram", "youtube", "reddit", "games", "browsers"]
        .into_iter()
        .filter_map(|id| Some((id.to_string(), premade_blocklist(id)?)))
        .collect()
}

/// A premade blocklist as shipped, for first runs and for "Reset".
pub fn premade_blocklist(id: &str) -> Option<Blocklist> {
    let app = |package: &str, label: &str, note: Option<&str>| BlockedApp {
        package: package.into(),
        label: label.into(),
        note: note.map(String::from),
        on: true,
        added: false,
    };
    let site = |site: &str, note: Option<&str>| BlockedSite {
        site: site.into(),
        note: note.map(String::from),
        on: true,
        added: false,
    };
    let viewer = Some("Alternative viewer");
    let all = Some("All subdomains");
    let maintained = Some("Known public instances, kept up to date");
    let (name, color, apps, sites) = match id {
        "instagram" => (
            "Instagram",
            "#e5609b",
            vec![app("com.instagram.android", "Instagram", None)],
            vec![site("instagram.com", all)],
        ),
        "youtube" => (
            "YouTube",
            "#ff6b5b",
            vec![
                app("com.google.android.youtube", "YouTube", None),
                app("org.schabi.newpipe", "NewPipe", viewer),
                app("com.github.libretube", "LibreTube", viewer),
                app("com.futo.platformplayer", "Grayjay", viewer),
            ],
            vec![
                site("youtube.com", all),
                site("youtu.be", None),
                site("list:invidious", maintained),
                site("list:piped", maintained),
            ],
        ),
        // One entry stands for every app Android marks as a game, so new
        // games are covered without editing the list.
        "games" => (
            "Games",
            "#7d8cff",
            vec![
                app("category:game", "Every game", Some("Apps marked as games")),
                // Windows: launchers, since games start from them.
                app("win:steam.exe", "Steam", Some("Windows")),
                app(
                    "win:EpicGamesLauncher.exe",
                    "Epic Games Launcher",
                    Some("Windows"),
                ),
                app("win:GalaxyClient.exe", "GOG Galaxy", Some("Windows")),
                app("win:Battle.net.exe", "Battle.net", Some("Windows")),
                app("win:EADesktop.exe", "EA app", Some("Windows")),
            ],
            vec![],
        ),
        // Browsers that ignore the site blocklist would get around it, so
        // they stay paused outside Unlocks like any Distraction.
        "browsers" => (
            "Other browsers",
            "#5bc8ff",
            vec![
                app(
                    "com.sec.android.app.sbrowser",
                    "Samsung Internet",
                    Some("Ignores the site blocklist"),
                ),
                app(
                    "org.mozilla.firefox",
                    "Firefox",
                    Some("Ignores the site blocklist"),
                ),
                app(
                    "org.mozilla.focus",
                    "Firefox Focus",
                    Some("Ignores the site blocklist"),
                ),
                app(
                    "com.duckduckgo.mobile.android",
                    "DuckDuckGo",
                    Some("Ignores the site blocklist"),
                ),
                app(
                    "com.opera.browser",
                    "Opera",
                    Some("Ignores the site blocklist"),
                ),
                app(
                    "com.microsoft.emmx",
                    "Edge",
                    Some("Ignores the site blocklist"),
                ),
                // Windows: Chrome, Brave, Edge, and Firefox all read policy; these don't.
                app("win:opera.exe", "Opera", Some("Windows")),
                app("win:vivaldi.exe", "Vivaldi", Some("Windows")),
                app("win:waterfox.exe", "Waterfox", Some("Windows")),
                app("win:librewolf.exe", "LibreWolf", Some("Windows")),
            ],
            vec![],
        ),
        "reddit" => (
            "Reddit",
            "#ff8a3d",
            vec![app("com.reddit.frontpage", "Reddit", None)],
            vec![site("reddit.com", all)],
        ),
        _ => return None,
    };
    Some(Blocklist {
        name: name.into(),
        color: color.into(),
        premade: true,
        on: true,
        apps,
        sites,
    })
}

/// How one Activity source earns. A source is a group: everything in it
/// shares one counter toward its next Voucher and one Earning rate.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Source {
    /// What the source is called everywhere, such as "Reading".
    #[serde(default)]
    pub name: String,
    pub kind: SourceKind,
    pub on: bool,
    /// One Voucher per this many tasks (Tasks) or minutes (Workout, Focus):
    /// the Earning rate. Bigger is slower, so stricter.
    pub every: u32,
    /// The group's members. Focus: the Android packages, and `win:` programs,
    /// whose on-screen time counts, added together. Tasks: the services whose
    /// finished tasks count (`todoist`, `clickup`). Workout and Steps: none.
    /// No package belongs to two sources, so nothing earns twice.
    #[serde(default)]
    pub packages: Vec<String>,
    /// Each member's display name, such as "Moon+ Reader Pro".
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    pub labels: BTreeMap<String, String>,
    /// Workout only: the maximum heart rate zone minutes are measured
    /// against. The phone uses 195 when this is unset.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub max_heart_rate: Option<u32>,
    /// The colour the apps draw this source in, "#rrggbb"; unset means the
    /// app's own default for it.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SourceKind {
    /// Finished tasks, polled from an API by the Ledger.
    Tasks,
    /// Heart-rate zone minutes, reported by the phone from Health Connect.
    Workout,
    /// Minutes an app is on screen and in use, reported by the phone.
    Focus,
    /// Steps walked, reported by the phone from Health Connect. A Steps
    /// source's rate counts steps, not minutes.
    Steps,
}

/// The sources a new Ledger starts with.
pub fn default_sources() -> BTreeMap<String, Source> {
    let source = |name: &str, kind, every, members: &[&str]| Source {
        name: name.into(),
        kind,
        on: true,
        every,
        packages: members.iter().map(|p| p.to_string()).collect(),
        labels: members
            .iter()
            .filter_map(|p| Some((p.to_string(), known_label(p)?.to_string())))
            .collect(),
        max_heart_rate: None,
        color: None,
    };
    BTreeMap::from([
        (
            "tasks".into(),
            source("Tasks", SourceKind::Tasks, 1, &["todoist", "clickup"]),
        ),
        (
            "workout".into(),
            source("Workout", SourceKind::Workout, 15, &[]),
        ),
        (
            "obsidian".into(),
            source(
                "Obsidian",
                SourceKind::Focus,
                30,
                &["md.obsidian", "win:Obsidian.exe"],
            ),
        ),
        (
            "reading".into(),
            source(
                "Reading",
                SourceKind::Focus,
                30,
                &[
                    "com.readermobile",
                    "com.flyersoft.moonreaderp",
                    "com.flyersoft.moonreader",
                ],
            ),
        ),
        (
            "anki".into(),
            source(
                "Anki",
                SourceKind::Focus,
                30,
                &["com.ichi2.anki", "win:anki.exe"],
            ),
        ),
        // Off until switched on: not everyone carries a phone that counts steps.
        (
            "steps".into(),
            Source {
                on: false,
                ..source("Steps", SourceKind::Steps, 2000, &[])
            },
        ),
    ])
}

/// Display names for the members Voucher ships with.
fn known_label(member: &str) -> Option<&'static str> {
    Some(match member {
        "todoist" => "Todoist",
        "clickup" => "ClickUp",
        "md.obsidian" => "Obsidian",
        "win:Obsidian.exe" => "Obsidian for Windows",
        "com.readermobile" => "Readwise Reader",
        "com.flyersoft.moonreaderp" => "Moon+ Reader Pro",
        "com.flyersoft.moonreader" => "Moon+ Reader",
        "com.ichi2.anki" => "AnkiDroid",
        "win:anki.exe" => "Anki for Windows",
        _ => return None,
    })
}

/// Brings sources saved before source groups up to date: Todoist and
/// ClickUp, once two sources, become one Tasks group, and every source gets
/// a name and labels for its members.
fn upgrade_sources(sources: &mut BTreeMap<String, Source>) {
    let grouped = sources
        .values()
        .any(|s| s.kind == SourceKind::Tasks && !s.packages.is_empty());
    let services: Vec<(String, Source)> = ["todoist", "clickup"]
        .into_iter()
        .filter_map(|id| Some((id.to_string(), sources.remove(id)?)))
        .collect();
    if !grouped && !services.is_empty() {
        let on: Vec<&(String, Source)> = services.iter().filter(|(_, s)| s.on).collect();
        // Only the services that were earning join, unless none were.
        let members = if on.is_empty() {
            services.iter().collect()
        } else {
            on.clone()
        };
        sources.insert(
            "tasks".into(),
            Source {
                name: "Tasks".into(),
                kind: SourceKind::Tasks,
                on: !on.is_empty(),
                every: members.iter().map(|(_, s)| s.every).min().unwrap_or(1),
                packages: members.iter().map(|(id, _)| id.clone()).collect(),
                labels: BTreeMap::new(),
                max_heart_rate: None,
                color: services.iter().find_map(|(_, s)| s.color.clone()),
            },
        );
    }
    for (id, source) in sources.iter_mut() {
        for package in &source.packages {
            if let (false, Some(label)) =
                (source.labels.contains_key(package), known_label(package))
            {
                source.labels.insert(package.clone(), label.into());
            }
        }
        if source.name.is_empty() {
            source.name = match id.as_str() {
                "tasks" => "Tasks".into(),
                "workout" => "Workout".into(),
                "steps" => "Steps".into(),
                "obsidian" => "Obsidian".into(),
                "readwise" => "Readwise Reader".into(),
                "moonreader" => "Moon+ Reader".into(),
                "anki" => "Anki".into(),
                // An app added on its own before groups: name it after the app.
                other => source
                    .packages
                    .first()
                    .and_then(|p| source.labels.get(p).cloned())
                    .unwrap_or_else(|| other.trim_start_matches("app.").to_string()),
            };
        }
    }
}

pub const DEFAULT_DAILY_GOAL: u32 = 16;

fn default_daily_goal() -> u32 {
    DEFAULT_DAILY_GOAL
}

/// One finished task reported by an Activity source. `task` is prefixed with
/// its source (`todoist:`, `clickup:`) so IDs from different sources never clash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub task: String,
    /// The task's name, for the log.
    pub title: String,
    pub at: Timestamp,
}

/// What happened to a batch of earned Vouchers.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct Credited {
    pub kept: u32,
    /// Lost because the Bank was full.
    pub forfeited: u32,
}

/// A successful Redemption: the signed Unlock to hand to Enforcers.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Redeemed {
    pub wire: String,
    pub ends_at: Timestamp,
    /// When this run of stacked Vouchers began.
    #[serde(default)]
    pub started_at: Timestamp,
    /// How many Vouchers this run has torn. Stored as `tickets`, the old name.
    #[serde(default, rename = "tickets")]
    pub vouchers: u32,
}

/// Why a Redemption was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Refusal {
    /// The Bank holds fewer Vouchers than asked for.
    EmptyBank,
    /// Asked to tear zero Vouchers.
    NoVouchers,
    /// It is Curfew, or the Unlock already runs up to Curfew's start.
    Curfew,
}

/// A requested change to one setting.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub enum Change {
    UnlockMinutes(u32),
    BankLimit(u32),
    Curfew {
        start: Time,
        end: Time,
    },
    /// Always waits for the next Day: a Day's goal is fixed once it starts.
    DailyGoal(u32),
    /// Switches an existing source on or off and sets its Earning rate.
    Source {
        id: String,
        on: bool,
        every: u32,
    },
    /// A new source. Always a Loosening.
    AddSource {
        id: String,
        source: Source,
    },
    /// Cosmetic, so it applies at once.
    RenameSource {
        id: String,
        name: String,
    },
    /// Fewer ways to earn, so it applies at once.
    DeleteSource(String),
    // Blocklist changes. Each is a Tightening when everything blocked before
    // is still blocked after it, and a Loosening otherwise.
    NewBlocklist {
        id: String,
        list: Blocklist,
    },
    BlocklistOn {
        id: String,
        on: bool,
    },
    RenameBlocklist {
        id: String,
        name: String,
    },
    /// Adds an app to a blocklist, or switches an existing entry on or off.
    BlockApp {
        list: String,
        app: BlockedApp,
    },
    BlockSite {
        list: String,
        site: BlockedSite,
    },
    RemoveApp {
        list: String,
        package: String,
    },
    RemoveSite {
        list: String,
        site: String,
    },
    /// Puts a premade blocklist back to its shipped entries.
    ResetBlocklist(String),
    DeleteBlocklist(String),
    /// Replaces the apps a Focused time source measures. Adding an app is a
    /// Loosening (more ways to earn); only removing is a Tightening.
    SourceApps {
        id: String,
        packages: Vec<String>,
        /// Names for the members, as in `Source::labels`.
        #[serde(default)]
        labels: BTreeMap<String, String>,
    },
    /// The maximum heart rate Workout zone minutes are measured against.
    /// Lower makes zone minutes easier, so it is a Loosening.
    MaxHeartRate(u32),
    /// Lets one device stop enforcing, so Voucher can be removed from it.
    /// Always a Loosening.
    ReleaseDevice(String),
    /// Withdraws a release. Always a Tightening.
    KeepDevice(String),
    /// The colour a source is drawn in ("#rrggbb"), or None for its default.
    /// Cosmetic, so it applies at once.
    SourceColor {
        id: String,
        color: Option<String>,
    },
    /// The colour a blocklist is drawn in ("#rrggbb"). Cosmetic, so it
    /// applies at once.
    BlocklistColor {
        id: String,
        color: String,
    },
}

/// One line of the log.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Entry {
    /// A task earned a Voucher. `kept` is false when the Bank was full.
    Earned {
        at: Timestamp,
        task: String,
        #[serde(default)]
        title: String,
        kept: bool,
    },
    /// An Enforcer stopped checking in from `at` until `until`.
    Gap {
        at: Timestamp,
        device: String,
        until: Timestamp,
    },
    Redeemed {
        at: Timestamp,
        /// Stored as `tickets`, the old name.
        #[serde(rename = "tickets")]
        vouchers: u32,
        /// Minutes the Vouchers actually added; Curfew can cut the last one short.
        #[serde(default)]
        minutes: u32,
    },
}

impl Entry {
    pub fn at(&self) -> Timestamp {
        match self {
            Entry::Earned { at, .. } | Entry::Redeemed { at, .. } | Entry::Gap { at, .. } => *at,
        }
    }
}

/// A dated note on the timeline: one written by hand ("new term",
/// "dose up"), or one the Ledger wrote when a rule changed, so charts can
/// show what was different before and after.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Marker {
    pub at: Timestamp,
    pub text: String,
    /// Written by the Ledger for a rule change, not by hand.
    #[serde(default)]
    pub rule: bool,
}

/// The answer to "Did today go the way you wanted?", asked at Curfew.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Verdict {
    Yes,
    Mostly,
    No,
}

/// Why an Unlock happened, tapped just after it (bored, tired, …).
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Reason {
    pub at: Timestamp,
    pub reason: String,
}

/// One Day's score and log.
#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct DaySummary {
    pub day: Date,
    /// Vouchers earned this Day, forfeited ones included: the goal measures
    /// work done, not what fitted in the Bank.
    pub earned: u32,
    /// Vouchers torn this Day.
    pub redeemed: u32,
    pub unlocked_minutes: u32,
    pub goal: u32,
    pub goal_met: bool,
    /// The earning that met the goal, if the log still holds it.
    pub goal_met_at: Option<Timestamp>,
    /// Goal Days in a row ending this Day. For today, the Streak still stands
    /// on yesterday until today's goal is met, then includes today.
    pub streak: u32,
    /// Vouchers earned this Day per Activity source (`todoist`, `clickup`).
    pub by_source: BTreeMap<String, u32>,
    /// This Day's entries, newest first.
    pub log: Vec<Entry>,
    /// Each source's progress toward its next Voucher this Day.
    pub sources: Vec<SourceProgress>,
    /// Minutes in each Distraction app per clock hour (24 of them, midnight
    /// first), every device's added together: empty for Days older than the
    /// log keeps.
    pub usage: BTreeMap<String, Vec<u32>>,
    /// The blocklist each of those apps belongs to, where a device said.
    pub usage_lists: BTreeMap<String, String>,
    /// Markers that fall in this Day, oldest first.
    pub markers: Vec<Marker>,
    /// Minutes in each clock hour each device was silent (not enforcing).
    pub silent: BTreeMap<String, Vec<u32>>,
}

/// One source's standing for a Day.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct SourceProgress {
    pub id: String,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    pub kind: SourceKind,
    pub on: bool,
    pub every: u32,
    /// Tasks or minutes counted toward the next Voucher.
    pub progress: u32,
    /// Vouchers this source earned this Day.
    pub earned: u32,
}

/// One Day in the history, for Trends.
#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
pub struct DayTotal {
    pub day: Date,
    pub earned: u32,
    pub redeemed: u32,
    pub goal_met: bool,
    /// Vouchers earned per source, from the log: empty for Days older than
    /// the log keeps (their totals above still stand).
    pub by_source: BTreeMap<String, u32>,
    pub unlocked_minutes: u32,
    /// Minutes in each Distraction app, every device's added together:
    /// empty for Days older than the log keeps.
    pub used: BTreeMap<String, u32>,
    /// The blocklist each of those apps belongs to, where a device said.
    pub used_lists: BTreeMap<String, String>,
    /// The Day's Daily goal.
    pub goal: u32,
    /// Vouchers earned in each clock hour (24, midnight first), from the log:
    /// empty for Days older than it keeps.
    pub hours: Vec<u32>,
    /// The Day's first tear, if the log still holds it.
    pub first_tear: Option<Timestamp>,
    /// Vouchers earned per clock hour for each source, from the log.
    pub source_hours: BTreeMap<String, Vec<u32>>,
    /// Every unbroken stretch in a focus app, in minutes, all devices together.
    pub stretches: Vec<u32>,
    /// Opens of a blocked app, all devices together.
    pub opens: u32,
    /// Of those, the ones that ended without an Unlock.
    pub walked: u32,
    /// Whether any device reported Distraction minutes for this Day: without
    /// a report, zero minutes means "not measured", not "none".
    pub reported: bool,
    /// Minutes in each clock hour each device was silent (not enforcing).
    pub silent: BTreeMap<String, Vec<u32>>,
    /// The Day's answer to "Did today go the way you wanted?".
    pub verdict: Option<Verdict>,
    /// Why each Unlock happened, where one was given: (clock hour, reason).
    pub reasons: Vec<(u32, String)>,
}

/// What one Day earned, and the goal it had.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
struct DayScore {
    earned: u32,
    goal: u32,
    #[serde(default)]
    redeemed: u32,
    #[serde(default)]
    unlocked_minutes: u32,
    /// Tasks or minutes counted toward each source's next Voucher.
    #[serde(default)]
    progress: BTreeMap<String, u32>,
    /// The last running total of minutes the phone reported, per source.
    #[serde(default)]
    reported: BTreeMap<String, u32>,
    /// Distraction minutes per clock hour, by device, then by app. Each
    /// device's latest report replaces its last one.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    usage: BTreeMap<String, BTreeMap<String, Vec<u32>>>,
    /// Which blocklist each of those apps belongs to, as the device that
    /// measured it saw it (by package, or Android's game category).
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    usage_lists: BTreeMap<String, String>,
    /// Unbroken stretches in focus apps, by device: their lengths in minutes.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    stretches: BTreeMap<String, Vec<u32>>,
    /// Blocked opens and how many ended without an Unlock, by device.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    blocked: BTreeMap<String, (u32, u32)>,
    /// Minutes per clock hour each device was silent, from its Gaps.
    #[serde(default, skip_serializing_if = "BTreeMap::is_empty")]
    silent: BTreeMap<String, Vec<u32>>,
}

impl DayScore {
    fn new(goal: u32) -> Self {
        DayScore {
            earned: 0,
            goal,
            redeemed: 0,
            unlocked_minutes: 0,
            progress: BTreeMap::new(),
            reported: BTreeMap::new(),
            usage: BTreeMap::new(),
            usage_lists: BTreeMap::new(),
            stretches: BTreeMap::new(),
            blocked: BTreeMap::new(),
            silent: BTreeMap::new(),
        }
    }
}

/// When a requested change takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub enum Effect {
    /// A Tightening: applied immediately.
    Now,
    /// A Loosening: held until this Morning boundary.
    At(Timestamp),
}

pub struct Ledger {
    /// Never saved with the state: it lives in its own locked-down file.
    key: SigningKey,
    state: State,
}

/// Everything the Ledger remembers, saved to disk after every change.
#[derive(Serialize, Deserialize)]
struct State {
    settings: Settings,
    /// When this Ledger was first started. Work done before then never
    /// earns, so a new Ledger starts with an empty Bank instead of back-paying
    /// the last few days.
    #[serde(default)]
    started_at: Timestamp,
    bank: u32,
    /// The most recent Unlock, kept so Enforcers can fetch it.
    unlock: Option<Redeemed>,
    /// Loosenings waiting for their Morning boundary, oldest first.
    pending: Vec<(Change, Timestamp)>,
    /// Which tasks have already earned on which Day.
    earned: HashSet<(String, Date)>,
    /// Every Day that earned anything, for the goal, the Streak, and Trends.
    #[serde(default)]
    days: BTreeMap<Date, DayScore>,
    /// The last month of entries, oldest first.
    #[serde(default)]
    log: Vec<Entry>,
    /// Until first-run setup finishes, changes apply at once, Loosenings
    /// included. Ledgers saved before setup existed count as set up.
    #[serde(default = "set_up_already")]
    setup_complete: bool,
    /// When each Enforcer last checked in.
    #[serde(default)]
    last_seen: BTreeMap<String, Timestamp>,
    /// Until then, every change applies at once, Loosenings included: the
    /// first two days after setup, while the rules are still being tuned.
    #[serde(default)]
    grace_until: Option<Timestamp>,
    /// Every Marker, oldest first. Kept for good, like the Day scores.
    #[serde(default)]
    markers: Vec<Marker>,
    /// Each Day's answer to the Curfew question.
    #[serde(default)]
    verdicts: BTreeMap<Date, Verdict>,
    /// Why Unlocks happened, oldest first.
    #[serde(default)]
    reasons: Vec<Reason>,
}

fn set_up_already() -> bool {
    true
}

impl Ledger {
    pub fn new(mut settings: Settings, key: SigningKey, started_at: Timestamp) -> Self {
        upgrade_sources(&mut settings.sources);
        Ledger {
            key,
            state: State {
                settings,
                started_at,
                bank: 0,
                unlock: None,
                pending: Vec::new(),
                earned: HashSet::new(),
                days: BTreeMap::new(),
                log: Vec::new(),
                setup_complete: false,
                last_seen: BTreeMap::new(),
                grace_until: None,
                markers: Vec::new(),
                verdicts: BTreeMap::new(),
                reasons: Vec::new(),
            },
        }
    }

    /// The Ledger's state as JSON, for saving to disk.
    pub fn save(&self) -> String {
        serde_json::to_string_pretty(&self.state).expect("the state always serializes")
    }

    /// Rebuilds a Ledger from saved JSON and its signing key.
    pub fn load(saved: &str, key: SigningKey) -> Result<Self, serde_json::Error> {
        let mut state: State = serde_json::from_str(saved)?;
        upgrade_sources(&mut state.settings.sources);
        // Waiting changes to Todoist or ClickUp now belong to the Tasks group.
        for (change, _) in &mut state.pending {
            if let Change::Source { id, .. } | Change::SourceColor { id, .. } = change {
                if id == "todoist" || id == "clickup" {
                    *id = "tasks".into();
                }
            }
        }
        Ok(Ledger { key, state })
    }

    /// The public half of the signing key, base64url, for Enforcers to check Unlocks with.
    pub fn public_key(&self) -> String {
        use base64::Engine;
        base64::engine::general_purpose::URL_SAFE_NO_PAD.encode(self.key.verifying_key().to_bytes())
    }

    /// Vouchers currently held.
    pub fn bank(&self) -> u32 {
        self.state.bank
    }

    /// The settings in force right now.
    pub fn settings(&mut self, now: Timestamp) -> &Settings {
        self.settle(now);
        &self.state.settings
    }

    /// Loosenings still waiting for their Morning boundary.
    pub fn pending(&mut self, now: Timestamp) -> &[(Change, Timestamp)] {
        self.settle(now);
        &self.state.pending
    }

    /// The Unlock that is running right now, if any.
    pub fn current_unlock(&self, now: Timestamp) -> Option<&Redeemed> {
        self.state
            .unlock
            .as_ref()
            .filter(|unlock| now < unlock.ends_at)
    }

    /// Adds earned Vouchers to the Bank, forfeiting any past the Bank limit.
    pub fn credit(&mut self, vouchers: u32, now: Timestamp) -> Credited {
        self.settle(now);
        let room = self
            .state
            .settings
            .bank_limit
            .saturating_sub(self.state.bank);
        let kept = vouchers.min(room);
        self.state.bank += kept;
        Credited {
            kept,
            forfeited: vouchers - kept,
        }
    }

    /// Counts finished tasks toward their sources, but each task counts at
    /// most once per Day. Re-polling, or ticking a task off, on, and off
    /// again, counts nothing extra; a recurring habit done again tomorrow
    /// counts again. A source pays one Voucher per `every` tasks; a switched
    /// off source counts nothing, and its tasks never count later.
    ///
    /// Only today and the two Days before count. Older Completions are
    /// ignored and forgotten, which keeps the memory of what has counted from
    /// growing forever without ever letting an old Completion count twice.
    pub fn record(&mut self, completions: &[Completion], now: Timestamp) -> Credited {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        let oldest = days_before(today, EARNING_WINDOW_DAYS);
        self.state.earned.retain(|(_, day)| *day >= oldest);
        let mut credited = Credited {
            kept: 0,
            forfeited: 0,
        };
        for completion in completions {
            let day = day_of(&self.state.settings, completion.at);
            let counts = day >= oldest && completion.at >= self.state.started_at;
            // A service in no Tasks group earns nothing, and stays free to
            // earn if it joins one within the earning window.
            let Some(source) = group_of(&self.state.settings, &completion.task).map(String::from)
            else {
                continue;
            };
            if !counts || !self.state.earned.insert((completion.task.clone(), day)) {
                continue;
            }
            let paid = self.count(&source, day, 1, completion.at, now, |_| {
                (completion.task.clone(), completion.title.clone())
            });
            credited.kept += paid.kept;
            credited.forfeited += paid.forfeited;
        }
        self.forget_old_entries(today);
        credited
    }

    /// Takes the phone's running total of minutes for a Workout or Focus
    /// source on `day`, and pays one Voucher per `every` new minutes. Sending
    /// the same total again pays nothing. Only today and yesterday (for a
    /// report sent just after the Day turned) are accepted. `title` names
    /// the session for the log, such as a workout's name.
    pub fn report(
        &mut self,
        source: &str,
        day: Date,
        minutes: u32,
        title: Option<&str>,
        now: Timestamp,
    ) -> Credited {
        self.report_from("", source, day, minutes, title, now)
    }

    /// As `report`, from one named device. Each device keeps its own running
    /// total, so a phone and a laptop both measuring Obsidian add up rather
    /// than overwrite each other.
    pub fn report_from(
        &mut self,
        device: &str,
        source: &str,
        day: Date,
        minutes: u32,
        title: Option<&str>,
        now: Timestamp,
    ) -> Credited {
        self.settle(now);
        let nothing = Credited {
            kept: 0,
            forfeited: 0,
        };
        let today = day_of(&self.state.settings, now);
        let fresh_day = day == today || Some(day) == today.yesterday().ok();
        let Some(kind) = self.state.settings.sources.get(source).map(|s| s.kind) else {
            return nothing;
        };
        if !fresh_day || kind == SourceKind::Tasks {
            return nothing;
        }
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        let key = if device.is_empty() {
            source.to_string()
        } else {
            format!("{source}@{device}")
        };
        let before = score.reported.insert(key.clone(), minutes).unwrap_or(0);
        if minutes <= before {
            score.reported.insert(key, before);
            return nothing;
        }
        let paid = self.count(source, day, minutes - before, now, now, |n| {
            let label = match (title, kind) {
                (Some(title), _) => title.to_string(),
                (None, SourceKind::Workout) => format!("{n} zone min"),
                (None, SourceKind::Steps) => format!("{n} steps"),
                (None, _) => format!("{n} min focused"),
            };
            (format!("{source}:{day}#{}", now.as_second()), label)
        });
        self.forget_old_entries(today);
        paid
    }

    /// One device's Distraction minutes for `day`: per app, the minutes in
    /// each clock hour (24, midnight first). It replaces that device's last
    /// report for the Day. Only today and yesterday are accepted, and no hour
    /// can hold more than 60 minutes. False if refused.
    pub fn report_usage(
        &mut self,
        device: &str,
        day: Date,
        apps: BTreeMap<String, Vec<u32>>,
        now: Timestamp,
    ) -> bool {
        self.report_usage_in_lists(device, day, apps, BTreeMap::new(), now)
    }

    /// As `report_usage`, also saying which blocklist (by id) each app is on,
    /// so Trends can count Distraction time by blocklist.
    pub fn report_usage_in_lists(
        &mut self,
        device: &str,
        day: Date,
        apps: BTreeMap<String, Vec<u32>>,
        lists: BTreeMap<String, String>,
        now: Timestamp,
    ) -> bool {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        let fresh_day = day == today || Some(day) == today.yesterday().ok();
        let sane = apps
            .values()
            .all(|hours| hours.len() <= 24 && hours.iter().all(|&m| m <= 60));
        if !fresh_day || !sane {
            return false;
        }
        let apps = apps
            .into_iter()
            .filter(|(_, hours)| hours.iter().any(|&m| m > 0))
            .map(|(app, mut hours)| {
                hours.resize(24, 0);
                (app, hours)
            })
            .collect();
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        score.usage.insert(device.to_string(), apps);
        score.usage_lists.extend(lists);
        self.forget_old_entries(today);
        true
    }

    /// One device's focus stretches (minutes each) and blocked opens for
    /// `day` (today or yesterday), replacing its last report. False if refused.
    pub fn report_focus_and_opens(
        &mut self,
        device: &str,
        day: Date,
        stretches: Option<Vec<u32>>,
        opens: Option<(u32, u32)>,
        now: Timestamp,
    ) -> bool {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        if day != today && Some(day) != today.yesterday().ok() {
            return false;
        }
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        if let Some(list) = stretches {
            score.stretches.insert(
                device.to_string(),
                list.into_iter()
                    .filter(|&m| m > 0 && m <= 24 * 60)
                    .collect(),
            );
        }
        if let Some(pair) = opens {
            score.blocked.insert(device.to_string(), pair);
        }
        true
    }

    /// Adds `units` (tasks or minutes) to a source's progress on `day`,
    /// paying a Voucher each time it reaches the source's `every`. Each
    /// Voucher is logged under the name `entry` gives it.
    fn count(
        &mut self,
        source: &str,
        day: Date,
        units: u32,
        at: Timestamp,
        now: Timestamp,
        entry: impl Fn(u32) -> (String, String),
    ) -> Credited {
        let mut credited = Credited {
            kept: 0,
            forfeited: 0,
        };
        let Some(config) = self.state.settings.sources.get(source).cloned() else {
            return credited;
        };
        if !config.on {
            return credited;
        }
        let every = config.every.max(1);
        let goal = self.state.settings.daily_goal;
        let score = self.state.days.entry(day).or_insert(DayScore::new(goal));
        let progress = score.progress.entry(source.to_string()).or_insert(0);
        *progress += units;
        let vouchers = *progress / every;
        *progress %= every;
        for _ in 0..vouchers {
            // One at a time, so the log can say which ones the full Bank lost.
            let kept = self.credit(1, now).kept == 1;
            if kept {
                credited.kept += 1;
            } else {
                credited.forfeited += 1;
            }
            self.state.days.get_mut(&day).expect("created above").earned += 1;
            let (task, title) = entry(every);
            self.state.log.push(Entry::Earned {
                at,
                task,
                title,
                kept,
            });
        }
        credited
    }

    /// Spends one Voucher; see `redeem_many`.
    pub fn redeem(&mut self, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.redeem_many(1, now)
    }

    /// Spends `count` Vouchers and signs an Unlock: starting now, or stacked
    /// onto the end of the Unlock that is already running. All or nothing:
    /// if the Bank can't cover every Voucher, none is torn.
    ///
    /// An Unlock never runs into Curfew. Vouchers that would only add time
    /// past Curfew's start stay in the Bank; a Voucher that adds no time at
    /// all is refused.
    pub fn redeem_many(&mut self, count: u32, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.settle(now);
        if count == 0 {
            return Err(Refusal::NoVouchers);
        }
        if self.in_curfew(now) {
            return Err(Refusal::Curfew);
        }
        if self.state.bank < count {
            return Err(Refusal::EmptyBank);
        }
        let running = self
            .state
            .unlock
            .clone()
            .filter(|unlock| now < unlock.ends_at);
        let starts_from = running.as_ref().map_or(now, |unlock| unlock.ends_at);
        let curfew = self.next_local(now, self.state.settings.curfew_start);
        let room = self.curfew_room(now).as_secs();
        if room <= 0 {
            return Err(Refusal::Curfew);
        }
        let length = i64::from(self.state.settings.unlock_minutes) * 60;
        // Vouchers needed to reach Curfew, rounding up: the last may be cut short.
        let fit = u32::try_from((room + length - 1) / length).unwrap_or(u32::MAX);
        let vouchers = count.min(fit);
        let ends_at = starts_from
            .checked_add(SignedDuration::from_secs(length * i64::from(vouchers)))
            .expect("an Unlock never ends past the year 9999")
            .min(curfew);
        self.state.bank -= vouchers;
        let wire = sign(
            &Unlock {
                ends_at: ends_at.as_second(),
            },
            &self.key,
        );
        let redeemed = Redeemed {
            wire,
            ends_at,
            started_at: running.as_ref().map_or(now, |unlock| unlock.started_at),
            vouchers: running.as_ref().map_or(0, |unlock| unlock.vouchers) + vouchers,
        };
        self.state.unlock = Some(redeemed.clone());
        let minutes = (starts_from.duration_until(ends_at).as_secs() + 30) / 60;
        let minutes = u32::try_from(minutes).unwrap_or(u32::MAX);
        let goal = self.state.settings.daily_goal;
        let today = self
            .state
            .days
            .entry(day_of(&self.state.settings, now))
            .or_insert(DayScore::new(goal));
        today.redeemed += vouchers;
        today.unlocked_minutes += minutes;
        self.state.log.push(Entry::Redeemed {
            at: now,
            vouchers,
            minutes,
        });
        Ok(redeemed)
    }

    /// The current Day's score, Streak, and log.
    pub fn today(&mut self, now: Timestamp) -> DaySummary {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        self.day(today, now)
    }

    /// Any Day's score and log. The log covers the last month; older Days
    /// keep their totals only.
    pub fn day(&mut self, day: Date, now: Timestamp) -> DaySummary {
        self.settle(now);
        let settings = &self.state.settings;
        let is_today = day == day_of(settings, now);
        let score = self
            .state
            .days
            .get(&day)
            .cloned()
            // Today's goal is the one in force; a Day that earned nothing never stored one.
            .unwrap_or(DayScore::new(settings.daily_goal));
        let goal = if is_today {
            settings.daily_goal
        } else {
            score.goal
        };
        let goal_met = score.earned >= goal;
        let before = self.streak_ending(day.yesterday().expect("not the year -9999"));
        let streak = match (goal_met, is_today) {
            (true, _) => before + 1,
            (false, true) => before,
            (false, false) => 0,
        };
        // Newest first; reversing before the stable sort keeps same-moment
        // entries newest-recorded first too.
        let mut log: Vec<Entry> = self
            .state
            .log
            .iter()
            .rev()
            .filter(|entry| day_of(settings, entry.at()) == day)
            .cloned()
            .collect();
        log.sort_by_key(|entry| Reverse(entry.at()));
        let mut by_source = BTreeMap::new();
        let mut so_far = 0;
        let mut goal_met_at = None;
        for entry in log.iter().rev() {
            if let Entry::Earned { task, at, .. } = entry {
                // Earnings from sources since removed keep their own prefix.
                let source = group_of(settings, task).unwrap_or(source_of(task));
                *by_source.entry(source.to_string()).or_insert(0) += 1;
                so_far += 1;
                if so_far == goal && goal > 0 {
                    goal_met_at = Some(*at);
                }
            }
        }
        let sources = settings
            .sources
            .iter()
            .map(|(id, source)| SourceProgress {
                id: id.clone(),
                name: source.name.clone(),
                color: source.color.clone(),
                kind: source.kind,
                on: source.on,
                every: source.every,
                progress: score.progress.get(id).copied().unwrap_or(0),
                earned: by_source.get(id).copied().unwrap_or(0),
            })
            .collect();
        let usage = usage_of(&score);
        DaySummary {
            day,
            sources,
            usage,
            usage_lists: score.usage_lists.clone(),
            earned: score.earned,
            redeemed: score.redeemed,
            unlocked_minutes: score.unlocked_minutes,
            goal,
            goal_met,
            goal_met_at,
            streak,
            by_source,
            log,
            markers: self
                .state
                .markers
                .iter()
                .filter(|m| day_of(settings, m.at) == day)
                .cloned()
                .collect(),
            silent: score.silent.clone(),
        }
    }

    /// The last `days` Days, oldest first, today included.
    pub fn history(&mut self, days: u32, now: Timestamp) -> Vec<DayTotal> {
        self.settle(now);
        let today = day_of(&self.state.settings, now);
        let goal_today = self.state.settings.daily_goal;
        // Each Day's earnings per source and per hour, and its first tear,
        // in one pass over the log.
        let settings = &self.state.settings;
        let tz = settings.time_zone.clone();
        let mut sources: BTreeMap<Date, BTreeMap<String, u32>> = BTreeMap::new();
        let mut hours: BTreeMap<Date, Vec<u32>> = BTreeMap::new();
        let mut source_hours: BTreeMap<Date, BTreeMap<String, Vec<u32>>> = BTreeMap::new();
        let mut first_tears: BTreeMap<Date, Timestamp> = BTreeMap::new();
        let mut reasons: BTreeMap<Date, Vec<(u32, String)>> = BTreeMap::new();
        for r in &self.state.reasons {
            let hour = u32::try_from(r.at.to_zoned(tz.clone()).hour()).unwrap_or(0);
            reasons
                .entry(day_of(settings, r.at))
                .or_default()
                .push((hour, r.reason.clone()));
        }
        for entry in &self.state.log {
            match entry {
                Entry::Earned { task, at, .. } => {
                    let day = day_of(settings, *at);
                    let source = group_of(settings, task).unwrap_or(source_of(task));
                    *sources
                        .entry(day)
                        .or_default()
                        .entry(source.to_string())
                        .or_insert(0) += 1;
                    let hour = usize::try_from(at.to_zoned(tz.clone()).hour()).unwrap_or(0);
                    hours.entry(day).or_insert_with(|| vec![0; 24])[hour] += 1;
                    source_hours
                        .entry(day)
                        .or_default()
                        .entry(source.to_string())
                        .or_insert_with(|| vec![0; 24])[hour] += 1;
                }
                Entry::Redeemed { at, .. } => {
                    let first = first_tears.entry(day_of(settings, *at)).or_insert(*at);
                    *first = (*first).min(*at);
                }
                _ => {}
            }
        }
        (0..i64::from(days))
            .rev()
            .map(|back| {
                let day = days_before(today, back);
                let score = self.state.days.get(&day);
                let goal = if back == 0 {
                    goal_today
                } else {
                    score.map_or(goal_today, |s| s.goal)
                };
                let earned = score.map_or(0, |s| s.earned);
                let redeemed = score.map_or(0, |s| s.redeemed);
                DayTotal {
                    day,
                    earned,
                    redeemed,
                    goal_met: earned >= goal,
                    by_source: sources.remove(&day).unwrap_or_default(),
                    unlocked_minutes: score.map_or(0, |s| s.unlocked_minutes),
                    goal,
                    hours: hours.remove(&day).unwrap_or_default(),
                    first_tear: first_tears.remove(&day),
                    source_hours: source_hours.remove(&day).unwrap_or_default(),
                    stretches: score
                        .map(|s| s.stretches.values().flatten().copied().collect())
                        .unwrap_or_default(),
                    opens: score.map_or(0, |s| s.blocked.values().map(|b| b.0).sum()),
                    walked: score.map_or(0, |s| s.blocked.values().map(|b| b.1.min(b.0)).sum()),
                    used: score
                        .map(usage_of)
                        .unwrap_or_default()
                        .into_iter()
                        .map(|(app, hours)| (app, hours.iter().sum()))
                        .collect(),
                    used_lists: score.map(|s| s.usage_lists.clone()).unwrap_or_default(),
                    reported: score.is_some_and(|s| !s.usage.is_empty()),
                    silent: score.map(|s| s.silent.clone()).unwrap_or_default(),
                    verdict: self.state.verdicts.get(&day).copied(),
                    reasons: reasons.remove(&day).unwrap_or_default(),
                }
            })
            .collect()
    }

    /// Goal Days in a row ending with `day`.
    fn streak_ending(&self, mut day: Date) -> u32 {
        let mut streak = 0;
        while let Some(score) = self.state.days.get(&day) {
            if score.earned < score.goal {
                break;
            }
            streak += 1;
            day = day.yesterday().expect("not the year -9999");
        }
        streak
    }

    /// The first Day this Ledger knows: the earlier of the Day it started
    /// and its oldest scored Day (a migrated Ledger can hold Days from before
    /// its start; one too old to have recorded its start has only those).
    pub fn first_day(&self, now: Timestamp) -> Date {
        let settings = &self.state.settings;
        let started = (self.state.started_at != Timestamp::UNIX_EPOCH)
            .then(|| day_of(settings, self.state.started_at));
        let oldest = self.state.days.keys().next().copied();
        [started, oldest]
            .into_iter()
            .flatten()
            .min()
            .unwrap_or_else(|| day_of(settings, now))
    }

    /// The oldest Day whose log entries are kept: a month back, or the first
    /// Day if that is later.
    pub fn log_first_day(&self, now: Timestamp) -> Date {
        let today = day_of(&self.state.settings, now);
        self.first_day(now).max(days_before(today, LOG_DAYS))
    }

    /// How long an Unlock torn now could still run before Curfew starts:
    /// from the end of the running Unlock (or now) to the next Curfew.
    fn curfew_room(&self, now: Timestamp) -> SignedDuration {
        let starts_from = self
            .state
            .unlock
            .as_ref()
            .filter(|unlock| now < unlock.ends_at)
            .map_or(now, |unlock| unlock.ends_at);
        let curfew = self.next_local(now, self.state.settings.curfew_start);
        starts_from.duration_until(curfew)
    }

    /// Whole minutes a tear now could still add before Curfew; zero during
    /// Curfew or once the running Unlock already reaches it.
    pub fn room_before_curfew(&self, now: Timestamp) -> u32 {
        if self.in_curfew(now) {
            return 0;
        }
        u32::try_from(self.curfew_room(now).as_secs().max(0) / 60).unwrap_or(u32::MAX)
    }

    /// Keeps a month of log entries; the Day scores keep the longer history.
    fn forget_old_entries(&mut self, today: Date) {
        let oldest = days_before(today, LOG_DAYS);
        let settings = &self.state.settings;
        self.state
            .log
            .retain(|entry| day_of(settings, entry.at()) >= oldest);
        // Distraction minutes go with the log.
        for (_, score) in self.state.days.range_mut(..oldest) {
            score.usage.clear();
            score.usage_lists.clear();
            score.stretches.clear();
            score.silent.clear();
        }
    }

    /// Whether Curfew is in force at `now`.
    pub fn curfew_active(&self, now: Timestamp) -> bool {
        self.in_curfew(now)
    }

    /// Whether `now`, in local time, falls in the Curfew window. The window
    /// usually crosses midnight (22:00 to 06:00), so it is "after the start OR
    /// before the end" rather than "between".
    fn in_curfew(&self, now: Timestamp) -> bool {
        let local = now.to_zoned(self.state.settings.time_zone.clone()).time();
        let (start, end) = (
            self.state.settings.curfew_start,
            self.state.settings.curfew_end,
        );
        if start <= end {
            start <= local && local < end
        } else {
            local >= start || local < end
        }
    }

    /// The next moment, strictly after `now`, when the local clock reads `time`.
    fn next_local(&self, now: Timestamp, time: Time) -> Timestamp {
        let tz = &self.state.settings.time_zone;
        let today = now.to_zoned(tz.clone()).date();
        let on = |date: jiff::civil::Date| {
            date.to_datetime(time)
                .to_zoned(tz.clone())
                .expect("a local time always maps to some moment")
                .timestamp()
        };
        let candidate = on(today);
        if candidate > now {
            candidate
        } else {
            on(today.tomorrow().expect("not the year 9999"))
        }
    }

    /// Requests a settings change. Tightenings apply now; Loosenings wait
    /// for the next Morning boundary, however urgently they are wanted.
    pub fn request(&mut self, change: Change, now: Timestamp) -> Effect {
        self.settle(now);
        if self.grace_until(now).is_some() {
            self.state
                .pending
                .retain(|(queued, _)| !same_setting(queued, &change));
            self.apply(change, now);
            return Effect::Now;
        }
        if let Change::DailyGoal(_) = change {
            // A Day's goal is fixed once it starts, so raising or lowering it
            // waits for the next Day. The newest request replaces older ones.
            let effective_at = self.next_local(now, self.state.settings.curfew_end);
            self.state
                .pending
                .retain(|(queued, _)| !matches!(queued, Change::DailyGoal(_)));
            self.state.pending.push((change, effective_at));
            return Effect::At(effective_at);
        }
        if self.loosens(&change) {
            let effective_at = self.next_local(now, self.state.settings.morning_boundary);
            self.state.pending.push((change, effective_at));
            Effect::At(effective_at)
        } else {
            // Whatever is queued for this setting would undo this decision.
            self.state
                .pending
                .retain(|(queued, _)| !same_setting(queued, &change));
            self.apply(change, now);
            Effect::Now
        }
    }

    /// Whether a change would increase access compared with current settings.
    fn loosens(&self, change: &Change) -> bool {
        match *change {
            Change::UnlockMinutes(minutes) => minutes > self.state.settings.unlock_minutes,
            Change::BankLimit(limit) => limit > self.state.settings.bank_limit,
            Change::Curfew { start, end } => {
                // Shrinking Curfew at either end frees time, so it loosens.
                let (old_start, old_end) = (
                    self.state.settings.curfew_start,
                    self.state.settings.curfew_end,
                );
                from_noon(start) > from_noon(old_start) || from_noon(end) < from_noon(old_end)
            }
            Change::DailyGoal(goal) => goal < self.state.settings.daily_goal,
            Change::Source { ref id, on, every } => match self.state.settings.sources.get(id) {
                // Switching on, or earning faster, frees time.
                Some(old) => on && (!old.on || every < old.every),
                None => false,
            },
            Change::AddSource { .. } => true,
            Change::RenameSource { .. } | Change::DeleteSource(_) => false,
            Change::ReleaseDevice(ref device) => {
                !self.state.settings.released_devices.contains(device)
            }
            Change::KeepDevice(_) => false,
            // Colours change how things look, never what is blocked or earned.
            Change::SourceColor { .. } | Change::BlocklistColor { .. } => false,
            Change::SourceApps {
                ref id,
                ref packages,
                ..
            } => {
                let old = self.state.settings.sources.get(id).map(|s| &s.packages);
                packages
                    .iter()
                    .any(|p| !old.is_some_and(|old| old.contains(p)))
            }
            Change::MaxHeartRate(bpm) => {
                let current = self
                    .state
                    .settings
                    .sources
                    .get("workout")
                    .and_then(|s| s.max_heart_rate);
                bpm < current.unwrap_or(DEFAULT_MAX_HEART_RATE)
            }
            // Blocklist changes: try it on a copy and see if anything stops being blocked.
            ref blocklist_change => {
                let mut after = self.state.settings.clone();
                apply_to(&mut after, blocklist_change.clone());
                let (before, after) = (blocked_by(&self.state.settings), blocked_by(&after));
                !(before.apps.iter().all(|a| after.apps.contains(a))
                    && before.sites.iter().all(|s| after.sites.contains(s)))
            }
        }
    }

    /// Applies a change, leaving a rule Marker for any that changes what is
    /// blocked or earned (cosmetic ones leave none). Changes a minute or so
    /// apart, such as several apps added in one sitting, share one Marker.
    fn apply(&mut self, change: Change, at: Timestamp) {
        let text = describe(&self.state.settings, &change);
        apply_to(&mut self.state.settings, change);
        let Some(text) = text.filter(|_| self.state.setup_complete) else {
            return;
        };
        match self.state.markers.last_mut() {
            Some(last)
                if last.rule
                    && last.at.duration_until(at) < SignedDuration::from_mins(10)
                    && last.text.len() < 400 =>
            {
                if !last.text.split("; ").any(|t| t == text) {
                    last.text = format!("{}; {text}", last.text);
                }
            }
            _ => self.state.markers.push(Marker {
                at,
                text,
                rule: true,
            }),
        }
    }

    /// What is blocked right now, merged across switched-on blocklists.
    pub fn blocked(&mut self, now: Timestamp) -> Blocked {
        self.settle(now);
        blocked_by(&self.state.settings)
    }

    /// First-run setup: applies `changes` at once, Loosenings included, and
    /// with `finish` closes setup for good. Returns false, changing nothing,
    /// once setup is closed.
    pub fn setup(&mut self, changes: Vec<Change>, finish: bool, now: Timestamp) -> bool {
        self.settle(now);
        if self.state.setup_complete {
            return false;
        }
        for change in changes {
            self.apply(change, now);
        }
        self.state.setup_complete = finish;
        if finish {
            self.start_grace(now);
        }
        true
    }

    /// Starts the grace period: changes apply at once until the first
    /// Morning boundary at least two full days (48 hours) from now.
    pub fn start_grace(&mut self, now: Timestamp) {
        let two_days = now + SignedDuration::from_hours(48);
        self.state.grace_until =
            Some(self.next_local(two_days, self.state.settings.morning_boundary));
    }

    /// Ends the grace period early, at the user's request. From now on
    /// Loosenings wait for the Morning boundary.
    pub fn end_grace(&mut self) {
        self.state.grace_until = None;
    }

    /// When the grace period ends, while it is running.
    pub fn grace_until(&self, now: Timestamp) -> Option<Timestamp> {
        self.state.grace_until.filter(|&until| now < until)
    }

    /// An Enforcer saying it is running. A silence longer than
    /// `GAP_MINUTES` before this check-in is logged as a Gap, unless the
    /// device has been released.
    pub fn check_in(&mut self, device: &str, now: Timestamp) {
        self.settle(now);
        let previous = self.state.last_seen.insert(device.to_string(), now);
        let released = self.state.settings.released_devices.contains(device);
        if let Some(previous) = previous {
            let silence = previous.duration_until(now);
            if silence > SignedDuration::from_mins(GAP_MINUTES) && !released {
                self.state.log.push(Entry::Gap {
                    at: previous,
                    device: device.to_string(),
                    until: now,
                });
                self.note_silence(device, previous, now);
            }
        }
    }

    /// When each Enforcer last checked in.
    pub fn last_seen(&self) -> &BTreeMap<String, Timestamp> {
        &self.state.last_seen
    }

    /// Whether first-run setup has finished.
    pub fn setup_complete(&self) -> bool {
        self.state.setup_complete
    }

    /// Withdraws a pending change before it takes effect. Withdrawing a
    /// Loosening only tightens, so it is immediate. Returns false if there is
    /// no pending change at `index`.
    pub fn cancel_pending(&mut self, index: usize, now: Timestamp) -> bool {
        self.settle(now);
        if index >= self.state.pending.len() {
            return false;
        }
        self.state.pending.remove(index);
        true
    }

    /// Applies every pending Loosening whose Morning boundary has passed.
    fn settle(&mut self, now: Timestamp) {
        let (due, waiting) = std::mem::take(&mut self.state.pending)
            .into_iter()
            .partition(|&(_, effective_at)| effective_at <= now);
        self.state.pending = waiting;
        for (change, at) in due {
            self.apply(change, at);
        }
    }
}

/// Markers, the Curfew question, Unlock reasons, and export.
impl Ledger {
    /// Spreads a device's silence over the clock hours of the Days it
    /// covers, so Trends can tell "not enforced" from "nothing used".
    fn note_silence(&mut self, device: &str, from: Timestamp, until: Timestamp) {
        let settings = &self.state.settings;
        let tz = settings.time_zone.clone();
        let goal = settings.daily_goal;
        let oldest = days_before(day_of(settings, until), LOG_DAYS);
        // Hour by hour: the first and last hours are partial.
        let mut at = from;
        while at < until {
            let local = at.to_zoned(tz.clone());
            let hour_end = local
                .start_of_day()
                .ok()
                .and_then(|d| d.checked_add(jiff::Span::new().hours(i64::from(local.hour()) + 1)).ok())
                .map(|z| z.timestamp())
                .unwrap_or(until)
                .min(until);
            let day = day_of(&self.state.settings, at);
            let minutes = u32::try_from(at.duration_until(hour_end).as_mins()).unwrap_or(0);
            if day >= oldest && minutes > 0 {
                let hours = self
                    .state
                    .days
                    .entry(day)
                    .or_insert(DayScore::new(goal))
                    .silent
                    .entry(device.to_string())
                    .or_insert_with(|| vec![0; 24]);
                let h = usize::try_from(local.hour()).unwrap_or(0);
                hours[h] = (hours[h] + minutes).min(60);
            }
            if hour_end <= at {
                break;
            }
            at = hour_end;
        }
    }

    /// Every Marker, oldest first.
    pub fn markers(&self) -> &[Marker] {
        &self.state.markers
    }

    /// Adds a hand-written Marker at `at` (now if None). Refuses empty or
    /// overlong text and moments in the future.
    pub fn add_marker(&mut self, text: &str, at: Option<Timestamp>, now: Timestamp) -> Option<Marker> {
        let text = text.trim();
        let at = at.unwrap_or(now);
        if text.is_empty() || text.chars().count() > 200 || at > now {
            return None;
        }
        let marker = Marker {
            at,
            text: text.to_string(),
            rule: false,
        };
        let place = self.state.markers.partition_point(|m| m.at <= at);
        self.state.markers.insert(place, marker.clone());
        Some(marker)
    }

    /// Removes the hand-written Marker at `at`. Rule Markers stay: they
    /// record what the Ledger did.
    pub fn remove_marker(&mut self, at: Timestamp) -> bool {
        let before = self.state.markers.len();
        self.state.markers.retain(|m| m.rule || m.at != at);
        self.state.markers.len() != before
    }

    /// Answers the Curfew question for `day` (None clears it). Only today
    /// and the six Days before can be answered.
    pub fn set_verdict(&mut self, day: Date, verdict: Option<Verdict>, now: Timestamp) -> bool {
        let today = day_of(&self.state.settings, now);
        if day > today || day < days_before(today, 6) {
            return false;
        }
        match verdict {
            Some(v) => self.state.verdicts.insert(day, v),
            None => self.state.verdicts.remove(&day),
        };
        true
    }

    /// Records why an Unlock happened. A second reason within a minute of the
    /// first replaces it (a changed mind, not a second Unlock).
    pub fn add_reason(&mut self, reason: &str, now: Timestamp) -> bool {
        let reason = reason.trim();
        if reason.is_empty() || reason.chars().count() > 40 {
            return false;
        }
        if let Some(last) = self.state.reasons.last_mut() {
            if last.at.duration_until(now) < SignedDuration::from_mins(1) {
                last.reason = reason.to_string();
                return true;
            }
        }
        self.state.reasons.push(Reason {
            at: now,
            reason: reason.to_string(),
        });
        true
    }

    /// Every Day from the first to today as CSV, one row each, for questions
    /// no card answers yet. Per-source columns only cover Days the log keeps.
    pub fn days_csv(&mut self, now: Timestamp) -> String {
        let first = self.first_day(now);
        let today = day_of(&self.state.settings, now);
        let span = u32::try_from(first.until(today).map_or(0, |s| s.get_days())).unwrap_or(0) + 1;
        let days = self.history(span, now);
        let tz = self.state.settings.time_zone.clone();
        let sources: Vec<String> = self.state.settings.sources.keys().cloned().collect();
        let mut out = String::from(
            "day,goal,earned,goal_met,vouchers_torn,unlocked_minutes,distraction_minutes,reported,opens,walked_away,longest_stretch,silent_minutes,verdict,reasons,markers",
        );
        for id in &sources {
            out.push_str(&format!(",earned_{id}"));
        }
        out.push('\n');
        let settings = &self.state.settings;
        for d in &days {
            let used: u32 = d.used.values().sum();
            let silent: u32 = d.silent.values().map(|h| h.iter().sum::<u32>()).max().unwrap_or(0);
            let verdict = match d.verdict {
                Some(Verdict::Yes) => "yes",
                Some(Verdict::Mostly) => "mostly",
                Some(Verdict::No) => "no",
                None => "",
            };
            let reasons: Vec<&str> = d.reasons.iter().map(|(_, r)| r.as_str()).collect();
            let markers: Vec<String> = self
                .state
                .markers
                .iter()
                .filter(|m| day_of(settings, m.at) == d.day)
                .map(|m| format!("{} {}", m.at.to_zoned(tz.clone()).strftime("%H:%M"), m.text))
                .collect();
            out.push_str(&format!(
                "{},{},{},{},{},{},{},{},{},{},{},{},{},{},{}",
                d.day,
                d.goal,
                d.earned,
                d.goal_met,
                d.redeemed,
                d.unlocked_minutes,
                if d.reported { used.to_string() } else { String::new() },
                d.reported,
                d.opens,
                d.walked,
                d.stretches.iter().max().map_or(String::new(), u32::to_string),
                silent,
                verdict,
                csv_field(&reasons.join("; ")),
                csv_field(&markers.join(" | ")),
            ));
            for id in &sources {
                out.push_str(&format!(",{}", d.by_source.get(id).copied().unwrap_or(0)));
            }
            out.push('\n');
        }
        out
    }

    /// Everything Trends knows, as one JSON document: every Day, Markers,
    /// and the settings in force.
    pub fn export_json(&mut self, now: Timestamp) -> serde_json::Value {
        let first = self.first_day(now);
        let today = day_of(&self.state.settings, now);
        let span = u32::try_from(first.until(today).map_or(0, |s| s.get_days())).unwrap_or(0) + 1;
        serde_json::json!({
            "exported_at": now,
            "days": self.history(span, now),
            "markers": self.state.markers,
            "settings": self.state.settings,
        })
    }
}

/// A CSV field, quoted when it holds a comma, quote, or line break.
fn csv_field(text: &str) -> String {
    if text.contains([',', '"', '\n']) {
        format!("\"{}\"", text.replace('"', "\"\""))
    } else {
        text.to_string()
    }
}

/// What a rule change did, in words, for its Marker; None for cosmetic ones.
fn describe(settings: &Settings, change: &Change) -> Option<String> {
    let source = |id: &str| {
        settings
            .sources
            .get(id)
            .map(|s| s.name.clone())
            .filter(|n| !n.is_empty())
            .unwrap_or_else(|| id.to_string())
    };
    let list = |id: &str| {
        settings
            .blocklists
            .get(id)
            .map_or_else(|| id.to_string(), |l| l.name.clone())
    };
    Some(match change {
        Change::UnlockMinutes(m) => format!("Unlocks last {m} min"),
        Change::BankLimit(n) => format!("Bank holds {n}"),
        Change::Curfew { start, end } => format!(
            "Curfew {} to {}",
            start.strftime("%H:%M"),
            end.strftime("%H:%M")
        ),
        Change::DailyGoal(n) => format!("Daily goal {n}"),
        Change::Source { id, on: false, .. } => format!("{} off", source(id)),
        Change::Source { id, every, .. } => {
            let unit = match settings.sources.get(id).map(|s| s.kind) {
                Some(SourceKind::Tasks) => "tasks",
                Some(SourceKind::Steps) => "steps",
                _ => "min",
            };
            format!("{} pays every {every} {unit}", source(id))
        }
        Change::AddSource { source: s, id } => format!(
            "New source {}",
            if s.name.is_empty() { id } else { &s.name }
        ),
        Change::DeleteSource(id) => format!("Removed source {}", source(id)),
        Change::SourceApps { id, .. } => format!("{} apps changed", source(id)),
        Change::MaxHeartRate(bpm) => format!("Max heart rate {bpm}"),
        Change::NewBlocklist { list: l, .. } => format!("New blocklist {}", l.name),
        Change::BlocklistOn { id, on } => {
            format!("{} {}", list(id), if *on { "on" } else { "off" })
        }
        Change::BlockApp { list: l, app } => format!(
            "{} {} in {}",
            app.label,
            if app.on { "blocked" } else { "unblocked" },
            list(l)
        ),
        Change::BlockSite { list: l, site } => format!(
            "{} {} in {}",
            site.site,
            if site.on { "blocked" } else { "unblocked" },
            list(l)
        ),
        Change::RemoveApp { list: l, package } => {
            let label = settings
                .blocklists
                .get(l)
                .and_then(|b| b.apps.iter().find(|a| &a.package == package))
                .map_or(package.as_str(), |a| a.label.as_str());
            format!("{label} removed from {}", list(l))
        }
        Change::RemoveSite { list: l, site } => format!("{site} removed from {}", list(l)),
        Change::ResetBlocklist(id) => format!("{} reset", list(id)),
        Change::DeleteBlocklist(id) => format!("Deleted blocklist {}", list(id)),
        Change::ReleaseDevice(d) => format!("{d} released"),
        Change::KeepDevice(d) => format!("{d} kept"),
        Change::RenameSource { .. }
        | Change::RenameBlocklist { .. }
        | Change::SourceColor { .. }
        | Change::BlocklistColor { .. } => return None,
    })
}

/// How long an Enforcer can stay silent before the silence is a Gap. It
/// checks in every minute, so this allows for a restart or a short outage.
const GAP_MINUTES: i64 = 10;

/// What the phone assumes when the Workout source has no maximum heart rate.
pub const DEFAULT_MAX_HEART_RATE: u32 = 195;

/// `packages` without any that another source already has: one app's time
/// must never earn twice.
fn unclaimed(settings: &Settings, id: &str, packages: Vec<String>) -> Vec<String> {
    packages
        .into_iter()
        .filter(|p| {
            !settings
                .sources
                .iter()
                .any(|(other, s)| other != id && s.packages.contains(p))
        })
        .collect()
}

/// The source an earning counts toward: the one its prefix names
/// (`obsidian:…`), or the Tasks group its service is in (`todoist:…`).
fn group_of<'a>(settings: &'a Settings, task: &'a str) -> Option<&'a str> {
    let prefix = source_of(task);
    if settings.sources.contains_key(prefix) {
        return Some(prefix);
    }
    settings
        .sources
        .iter()
        .find(|(_, s)| s.kind == SourceKind::Tasks && s.packages.iter().any(|p| p == prefix))
        .map(|(id, _)| id.as_str())
}

/// The source an earning came from: the prefix of `todoist:123`.
fn source_of(task: &str) -> &str {
    task.split_once(':').map_or(task, |(source, _)| source)
}

/// Whether two changes set the same thing, so one replaces the other.
fn same_setting(a: &Change, b: &Change) -> bool {
    match (setting_key(a), setting_key(b)) {
        (Some(x), Some(y)) => x == y,
        (None, None) => std::mem::discriminant(a) == std::mem::discriminant(b),
        _ => false,
    }
}

/// "#rrggbb", the only colour form the apps take.
fn is_hex_color(color: &str) -> bool {
    color.len() == 7 && color.starts_with('#') && color[1..].chars().all(|c| c.is_ascii_hexdigit())
}

/// Names the one thing a keyed change sets, such as one app in one blocklist.
fn setting_key(change: &Change) -> Option<String> {
    Some(match change {
        Change::Source { id, .. } | Change::AddSource { id, .. } | Change::DeleteSource(id) => {
            format!("source {id}")
        }
        Change::RenameSource { id, .. } => format!("source-name {id}"),
        Change::SourceApps { id, .. } => format!("source-apps {id}"),
        Change::NewBlocklist { id, .. }
        | Change::ResetBlocklist(id)
        | Change::DeleteBlocklist(id) => format!("list {id}"),
        Change::BlocklistOn { id, .. } => format!("list-on {id}"),
        Change::ReleaseDevice(device) | Change::KeepDevice(device) => format!("device {device}"),
        Change::RenameBlocklist { id, .. } => format!("list-name {id}"),
        Change::SourceColor { id, .. } => format!("source-color {id}"),
        Change::BlocklistColor { id, .. } => format!("list-color {id}"),
        Change::BlockApp { list, app } => format!("app {list} {}", app.package),
        Change::RemoveApp { list, package } => format!("app {list} {package}"),
        Change::BlockSite { list, site } => format!("site {list} {}", site.site),
        Change::RemoveSite { list, site } => format!("site {list} {site}"),
        _ => return None,
    })
}

fn apply_to(settings: &mut Settings, change: Change) {
    match change {
        // A zero-minute Voucher would spend Vouchers for nothing.
        Change::UnlockMinutes(minutes) => settings.unlock_minutes = minutes.max(1),
        Change::BankLimit(limit) => settings.bank_limit = limit,
        Change::Curfew { start, end } => {
            settings.curfew_start = start;
            settings.curfew_end = end;
        }
        Change::DailyGoal(goal) => settings.daily_goal = goal,
        Change::Source { id, on, every } => {
            if let Some(source) = settings.sources.get_mut(&id) {
                source.on = on;
                source.every = every.max(1);
            }
        }
        Change::AddSource { id, mut source } => {
            if !settings.sources.contains_key(&id) {
                source.packages = unclaimed(settings, &id, source.packages);
                settings.sources.insert(id, source);
            }
        }
        Change::RenameSource { id, name } => {
            if let (Some(source), false) = (settings.sources.get_mut(&id), name.trim().is_empty()) {
                source.name = name.trim().to_string();
            }
        }
        Change::DeleteSource(id) => {
            settings.sources.remove(&id);
        }
        // A new blocklist never replaces one with the same id.
        Change::NewBlocklist { id, list } => {
            settings.blocklists.entry(id).or_insert(list);
        }
        Change::BlocklistOn { id, on } => {
            if let Some(list) = settings.blocklists.get_mut(&id) {
                list.on = on;
            }
        }
        Change::RenameBlocklist { id, name } => {
            if let Some(list) = settings.blocklists.get_mut(&id) {
                list.name = name;
            }
        }
        // Anything but "#rrggbb" is ignored, so a bad value can't reach the apps.
        Change::SourceColor { id, color } => {
            if let Some(source) = settings.sources.get_mut(&id) {
                if color.as_deref().is_none_or(is_hex_color) {
                    source.color = color;
                }
            }
        }
        Change::BlocklistColor { id, color } => {
            if let Some(list) = settings.blocklists.get_mut(&id) {
                if is_hex_color(&color) {
                    list.color = color;
                }
            }
        }
        Change::BlockApp { list, app } => {
            if let Some(list) = settings.blocklists.get_mut(&list) {
                match list.apps.iter_mut().find(|a| a.package == app.package) {
                    Some(existing) => existing.on = app.on,
                    None => list.apps.push(app),
                }
            }
        }
        Change::BlockSite { list, site } => {
            if let Some(list) = settings.blocklists.get_mut(&list) {
                match list.sites.iter_mut().find(|s| s.site == site.site) {
                    Some(existing) => existing.on = site.on,
                    None => list.sites.push(site),
                }
            }
        }
        Change::RemoveApp { list, package } => {
            if let Some(list) = settings.blocklists.get_mut(&list) {
                list.apps.retain(|a| a.package != package);
            }
        }
        Change::RemoveSite { list, site } => {
            if let Some(list) = settings.blocklists.get_mut(&list) {
                list.sites.retain(|s| s.site != site);
            }
        }
        Change::ResetBlocklist(id) => {
            if let (Some(list), Some(shipped)) =
                (settings.blocklists.get_mut(&id), premade_blocklist(&id))
            {
                list.apps = shipped.apps;
                list.sites = shipped.sites;
            }
        }
        Change::DeleteBlocklist(id) => {
            settings.blocklists.remove(&id);
        }
        Change::ReleaseDevice(device) => {
            settings.released_devices.insert(device);
        }
        Change::KeepDevice(device) => {
            settings.released_devices.remove(&device);
        }
        Change::SourceApps {
            id,
            packages,
            mut labels,
        } => {
            let packages = unclaimed(settings, &id, packages);
            if let Some(source) = settings.sources.get_mut(&id) {
                // Keep names already known, for members the change didn't name.
                for package in &packages {
                    if let Some(label) = source.labels.get(package) {
                        labels.entry(package.clone()).or_insert(label.clone());
                    }
                }
                labels.retain(|package, _| packages.contains(package));
                source.packages = packages;
                source.labels = labels;
            }
        }
        Change::MaxHeartRate(bpm) => {
            if let Some(workout) = settings.sources.get_mut("workout") {
                workout.max_heart_rate = Some(bpm);
            }
        }
    }
}

fn blocked_by(settings: &Settings) -> Blocked {
    let mut apps = std::collections::BTreeSet::new();
    let mut sites = std::collections::BTreeSet::new();
    for list in settings.blocklists.values().filter(|l| l.on) {
        apps.extend(list.apps.iter().filter(|a| a.on).map(|a| a.package.clone()));
        sites.extend(list.sites.iter().filter(|s| s.on).map(|s| s.site.clone()));
    }
    Blocked {
        apps: apps.into_iter().collect(),
        sites: sites.into_iter().collect(),
    }
}

/// How many Days back, besides today, a Completion can still earn.
const EARNING_WINDOW_DAYS: i64 = 2;

/// How many Days back, besides today, the log keeps entries: half a year,
/// so the hour chart and the Log reach as far back as anyone looks for a
/// trend. Day scores (the history grid, Trends) are kept for good.
const LOG_DAYS: i64 = 183;

/// A Day's Distraction minutes per app and clock hour, every device's added
/// together; two screens in the same hour still make at most 60 minutes.
fn usage_of(score: &DayScore) -> BTreeMap<String, Vec<u32>> {
    let mut out: BTreeMap<String, Vec<u32>> = BTreeMap::new();
    for apps in score.usage.values() {
        for (app, hours) in apps {
            let sum = out.entry(app.clone()).or_insert_with(|| vec![0; 24]);
            for (total, &m) in sum.iter_mut().zip(hours) {
                *total = (*total + m).min(60);
            }
        }
    }
    out
}

/// The Day a moment belongs to. A Day runs from Curfew's end to the next
/// Curfew's end, so work at 01:00 still counts toward the evening before.
/// Assumes Curfew ends in the morning.
fn day_of(settings: &Settings, at: Timestamp) -> Date {
    let local = at.to_zoned(settings.time_zone.clone()).datetime();
    if local.time() < settings.curfew_end {
        local.date().yesterday().expect("not the year -9999")
    } else {
        local.date()
    }
}

fn days_before(day: Date, days: i64) -> Date {
    day.checked_sub(jiff::Span::new().days(days))
        .expect("not the year -9999")
}

/// Minutes since noon. Curfew is a night window that crosses midnight, so
/// measuring from noon puts its start before its end and makes "earlier" and
/// "later" compare naturally (22:00 is 600, 06:00 is 1080). Assumes a Curfew
/// never spans noon.
fn from_noon(time: Time) -> i32 {
    let minutes = i32::from(time.hour()) * 60 + i32::from(time.minute());
    (minutes - 12 * 60).rem_euclid(24 * 60)
}
