use ed25519_dalek::SigningKey;
use jiff::{Timestamp, civil::time, tz::TimeZone};
use voucher_ledger::{
    BlockedApp, BlockedSite, Blocklist, Change, Effect, Ledger, Settings, default_blocklists,
    default_sources,
};

fn settings() -> Settings {
    Settings {
        time_zone: TimeZone::get("America/Los_Angeles").unwrap(),
        bank_limit: 24,
        unlock_minutes: 10,
        curfew_start: time(22, 0, 0, 0),
        curfew_end: time(6, 0, 0, 0),
        morning_boundary: time(6, 0, 0, 0),
        daily_goal: 16,
        sources: default_sources(),
        blocklists: default_blocklists(),
        released_devices: Default::default(),
    }
}

fn at(moment: &str) -> Timestamp {
    moment.parse().unwrap()
}

const NOON: &str = "2026-10-07T12:00-07:00";
const NEXT_MORNING: &str = "2026-10-08T06:00-07:00";

fn fresh() -> Ledger {
    Ledger::new(
        settings(),
        SigningKey::from_bytes(&[7; 32]),
        at("2026-10-01T00:00-07:00"),
    )
}

fn app(package: &str, on: bool) -> BlockedApp {
    BlockedApp {
        package: package.into(),
        label: package.into(),
        note: None,
        on,
        added: true,
    }
}

fn blocks(ledger: &mut Ledger, moment: &str, what: &str) -> bool {
    let blocked = ledger.blocked(at(moment));
    blocked.apps.iter().chain(&blocked.sites).any(|b| b == what)
}

#[test]
fn the_premade_lists_block_their_apps_and_sites_from_the_start() {
    let mut ledger = fresh();

    assert!(blocks(&mut ledger, NOON, "com.instagram.android"));
    assert!(blocks(&mut ledger, NOON, "youtube.com"));
    assert!(blocks(&mut ledger, NOON, "list:invidious"));
}

#[test]
fn adding_an_app_blocks_it_now_and_switching_it_off_waits_for_morning() {
    let mut ledger = fresh();
    let add = Change::BlockApp {
        list: "reddit".into(),
        app: app("com.example.reader", true),
    };

    assert_eq!(ledger.request(add, at(NOON)), Effect::Now);
    assert!(blocks(&mut ledger, NOON, "com.example.reader"));

    let off = Change::BlockApp {
        list: "reddit".into(),
        app: app("com.example.reader", false),
    };
    assert!(matches!(ledger.request(off, at(NOON)), Effect::At(_)));
    assert!(blocks(
        &mut ledger,
        "2026-10-07T23:00-07:00",
        "com.example.reader"
    ));
    assert!(!blocks(&mut ledger, NEXT_MORNING, "com.example.reader"));
}

#[test]
fn switching_a_blocklist_off_waits_and_switching_it_on_is_immediate() {
    let mut ledger = fresh();

    let off = ledger.request(
        Change::BlocklistOn {
            id: "instagram".into(),
            on: false,
        },
        at(NOON),
    );
    assert!(matches!(off, Effect::At(_)));
    assert!(blocks(&mut ledger, NOON, "instagram.com"));
    assert!(!blocks(&mut ledger, NEXT_MORNING, "instagram.com"));

    let on = ledger.request(
        Change::BlocklistOn {
            id: "instagram".into(),
            on: true,
        },
        at(NEXT_MORNING),
    );
    assert_eq!(on, Effect::Now);
    assert!(blocks(&mut ledger, NEXT_MORNING, "instagram.com"));
}

#[test]
fn a_new_blocklist_and_a_rename_apply_now() {
    let mut ledger = fresh();
    let games = Blocklist {
        name: "Games".into(),
        color: "#7d8cff".into(),
        premade: false,
        on: true,
        apps: vec![app("com.example.game", true)],
        sites: vec![BlockedSite {
            site: "example-games.com".into(),
            note: None,
            on: true,
            added: true,
        }],
    };

    assert_eq!(
        ledger.request(
            Change::NewBlocklist {
                id: "games".into(),
                list: games
            },
            at(NOON)
        ),
        Effect::Now
    );
    assert_eq!(
        ledger.request(
            Change::RenameBlocklist {
                id: "games".into(),
                name: "Play".into()
            },
            at(NOON)
        ),
        Effect::Now
    );

    assert!(blocks(&mut ledger, NOON, "example-games.com"));
    assert_eq!(ledger.settings(at(NOON)).blocklists["games"].name, "Play");
}

#[test]
fn deleting_a_blocklist_waits_for_morning() {
    let mut ledger = fresh();

    let effect = ledger.request(Change::DeleteBlocklist("reddit".into()), at(NOON));

    assert!(matches!(effect, Effect::At(_)));
    assert!(blocks(&mut ledger, NOON, "reddit.com"));
    assert!(!blocks(&mut ledger, NEXT_MORNING, "reddit.com"));
}

#[test]
fn resetting_a_premade_list_that_only_restores_entries_applies_now() {
    let mut ledger = fresh();
    let off = Change::BlockSite {
        list: "youtube".into(),
        site: BlockedSite {
            site: "youtu.be".into(),
            note: None,
            on: false,
            added: false,
        },
    };
    ledger.request(off, at("2026-10-06T12:00-07:00"));
    assert!(!blocks(&mut ledger, NOON, "youtu.be"));

    assert_eq!(
        ledger.request(Change::ResetBlocklist("youtube".into()), at(NOON)),
        Effect::Now
    );
    assert!(blocks(&mut ledger, NOON, "youtu.be"));
}
