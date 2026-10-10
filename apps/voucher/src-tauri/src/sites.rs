//! Time on websites, read on Windows without a browser extension. Every few
//! seconds, while a browser is the window in front and the user is present,
//! the host in its address bar gets those seconds. Only hosts are kept, never
//! whole addresses, and only for the current Day; they are saved to a small
//! file so a restart keeps them.
//!
//! Sources count it through their `site:<domain>` members, and blocked sites
//! show up among the Distraction minutes. Reading the address bar is Windows
//! only; the rest is plain code, tested anywhere.

// Only the Windows sampler fills the tally; elsewhere it stays empty.
#![cfg_attr(not(windows), allow(dead_code))]

use std::{collections::BTreeMap, fs, path::Path, path::PathBuf, sync::Mutex};

use jiff::{
    Timestamp,
    civil::{Date, Time},
    tz::TimeZone,
};
use serde::{Deserialize, Serialize};
use serde_json::Value;

/// Browsers whose address bar is read, by lowercased file name.
pub const BROWSERS: &[&str] = &["brave.exe", "chrome.exe", "msedge.exe", "firefox.exe"];

/// Seconds on each host this Day, by browser and clock hour.
#[derive(Debug, Default, PartialEq, Serialize, Deserialize)]
pub struct Tally {
    day: Option<Date>,
    /// Host, then browser file name, then seconds in each clock hour (midnight first).
    hosts: BTreeMap<String, BTreeMap<String, [f64; 24]>>,
}

impl Tally {
    const fn new() -> Self {
        Tally { day: None, hosts: BTreeMap::new() }
    }

    /// Adds seconds on `host`. A new Day drops the old one's tallies.
    pub fn add(&mut self, day: Date, hour: usize, host: &str, browser: &str, seconds: f64) {
        match self.day {
            // The clock went back across a Day boundary: not worth keeping.
            Some(kept) if day < kept => return,
            Some(kept) if day == kept => {}
            _ => {
                self.day = Some(day);
                self.hosts.clear();
            }
        }
        let hours = self.hosts.entry(host.into()).or_default().entry(browser.into()).or_insert([0.0; 24]);
        hours[hour.min(23)] += seconds;
    }

    /// Seconds on `day` per domain in `domains`, leaving out time in the
    /// `except` browsers (counted already as programs). Each host goes only
    /// to the longest domain it falls under, as on Android, so a minute on
    /// `read.readwise.io` never earns for `readwise.io` too, and
    /// `m.youtube.com` counts as `youtube.com` unless that is listed itself.
    pub fn seconds_by_domain(&self, day: Date, domains: &[String], except: &[String]) -> Vec<(String, f64)> {
        let mut out: BTreeMap<&str, f64> = BTreeMap::new();
        if self.day != Some(day) {
            return vec![];
        }
        for (host, browsers) in &self.hosts {
            let Some(domain) = domains.iter().filter(|d| matches(host, d)).max_by_key(|d| d.len()) else {
                continue;
            };
            let seconds: f64 = browsers
                .iter()
                .filter(|(browser, _)| !except.contains(browser))
                .map(|(_, hours)| hours.iter().sum::<f64>())
                .sum();
            *out.entry(domain).or_default() += seconds;
        }
        out.into_iter().map(|(d, s)| (d.to_string(), s)).collect()
    }

    /// Seconds on `day` for one source's `mine` domains: hosts whose longest
    /// match among every source's domains (`all`) is one of its own.
    pub fn seconds_on(&self, day: Date, mine: &[String], all: &[String], except: &[String]) -> f64 {
        self.seconds_by_domain(day, all, except)
            .into_iter()
            .filter(|(domain, _)| mine.contains(domain))
            .map(|(_, seconds)| seconds)
            .sum()
    }
}

/// This Day's tally, filled by the sampler and read by the reports.
static TALLY: Mutex<Tally> = Mutex::new(Tally::new());

/// The Ledger's time zone and the time each Day begins (Curfew's end), as
/// last seen in its status. Until then, this PC's zone and 06:00.
static DAY_START: Mutex<Option<(TimeZone, Time)>> = Mutex::new(None);

/// Notes the Day boundary from a Ledger `/status` reply.
pub fn remember_day_start(status: &Value) {
    let settings = &status["settings"];
    let zone = settings["time_zone"].as_str().and_then(|z| TimeZone::get(z).ok());
    let end = settings["curfew_end"].as_str().and_then(|t| t.parse::<Time>().ok());
    if let (Some(zone), Some(end)) = (zone, end) {
        *DAY_START.lock().unwrap() = Some((zone, end));
    }
}

fn day_start() -> (TimeZone, Time) {
    DAY_START.lock().unwrap().clone().unwrap_or_else(|| (TimeZone::system(), Time::constant(6, 0, 0, 0)))
}

/// The Day a moment belongs to, and its clock hour. The same rule as the
/// Ledger's: before the Day's start, it is still the evening before.
pub fn day_and_hour(at: Timestamp, zone: &TimeZone, start: Time) -> (Date, usize) {
    let local = at.to_zoned(zone.clone()).datetime();
    let day = if local.time() < start { local.date().yesterday().expect("not the year -9999") } else { local.date() };
    (day, local.hour() as usize)
}

/// Seconds on `day` that one source's `mine` domains earn, given every
/// focus source's domains (`all`), outside the `except` browsers.
pub fn seconds_on(day: Date, mine: &[String], all: &[String], except: &[String]) -> f64 {
    TALLY.lock().unwrap().seconds_on(day, mine, all, except)
}

/// Seconds on `day` per domain in `domains`, outside the `except` browsers.
pub fn seconds_by_domain(day: Date, domains: &[String], except: &[String]) -> Vec<(String, f64)> {
    TALLY.lock().unwrap().seconds_by_domain(day, domains, except)
}

/// A domain as members and blocklists store it: lowercase, no `www.`.
pub fn domain(text: &str) -> Option<String> {
    let text = text.trim().trim_end_matches('.').to_lowercase();
    let text = text.strip_prefix("www.").unwrap_or(&text);
    (!text.is_empty()).then(|| text.to_string())
}

/// The domain of a source's `site:` member.
pub fn site_member(member: &str) -> Option<String> {
    domain(member.strip_prefix("site:")?)
}

/// Whether `host` is `domain` or one of its subdomains.
pub fn matches(host: &str, domain: &str) -> bool {
    host == domain || host.strip_suffix(domain).is_some_and(|rest| rest.ends_with('.'))
}

/// The host in an address bar's text, without `www.`: Chromium shows
/// "youtube.com/watch?v=…" with no scheme, Edge and Firefox may show it.
/// None for search text, browser pages (`chrome://`, `about:`), and files.
pub fn host_of(text: &str) -> Option<String> {
    let text = text.trim();
    if text.is_empty() || text.contains(char::is_whitespace) {
        return None;
    }
    let rest = match text.split_once("://") {
        Some((scheme, rest)) if scheme.eq_ignore_ascii_case("http") || scheme.eq_ignore_ascii_case("https") => rest,
        Some(_) => return None,
        None => text,
    };
    let authority = rest.split(['/', '?', '#']).next()?;
    let authority = authority.rsplit_once('@').map_or(authority, |(_, h)| h);
    let host = match authority.rsplit_once(':') {
        Some((host, port)) if !port.is_empty() && port.chars().all(|c| c.is_ascii_digit()) => host,
        _ => authority,
    };
    let host = domain(host)?;
    if host == "localhost" {
        return Some(host);
    }
    let labels: Vec<&str> = host.split('.').collect();
    let well_formed = labels.len() >= 2
        && labels.iter().all(|l| {
            !l.is_empty() && !l.starts_with('-') && !l.ends_with('-') && l.chars().all(|c| c.is_alphanumeric() || c == '-')
        });
    // "3.14" typed and left in the bar is not a site; an IPv4 address is.
    let ip = labels.len() == 4 && labels.iter().all(|l| l.parse::<u8>().is_ok());
    let named = labels.last().is_some_and(|l| l.chars().any(char::is_alphabetic));
    (well_formed && (ip || named)).then_some(host)
}

fn load(file: &Path) -> Option<Tally> {
    serde_json::from_str(&fs::read_to_string(file).ok()?).ok()
}

/// Writes the tally beside the file first, so a crash never leaves half a file.
fn save(file: &Path, tally: &Tally) {
    if let Some(dir) = file.parent() {
        let _ = fs::create_dir_all(dir);
    }
    let partial = file.with_extension("json.partial");
    if fs::write(&partial, serde_json::to_string(tally).expect("serializes")).is_ok() {
        let _ = fs::rename(&partial, file);
    }
}

/// Starts sampling the browser in front, keeping the tally in `file`.
#[cfg(windows)]
pub fn start(file: Option<PathBuf>) {
    if let Some(saved) = file.as_deref().and_then(load) {
        *TALLY.lock().unwrap() = saved;
    }
    std::thread::spawn(move || sampler::run(file.as_deref()));
}

#[cfg(not(windows))]
pub fn start(_file: Option<PathBuf>) {}

/// The Windows part: the window in front, its program, the user's last
/// input, and the address bar read through UI Automation.
#[cfg(windows)]
mod sampler {
    use std::{
        collections::HashMap,
        mem::ManuallyDrop,
        path::Path,
        thread,
        time::{Duration, Instant},
    };

    use windows::{
        Win32::{
            Foundation::{CloseHandle, HWND},
            System::{
                Com::{CLSCTX_INPROC_SERVER, COINIT_MULTITHREADED, CoCreateInstance, CoInitializeEx},
                SystemInformation::GetTickCount,
                Threading::{OpenProcess, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION, QueryFullProcessImageNameW},
                Variant::{VARENUM, VARIANT, VARIANT_0, VARIANT_0_0, VARIANT_0_0_0, VT_BSTR, VT_I4, VariantClear},
            },
            UI::{
                Accessibility::{
                    CUIAutomation, IUIAutomation, IUIAutomation2, IUIAutomationCondition, IUIAutomationElement,
                    IUIAutomationValuePattern, TreeScope_Descendants, UIA_AutomationIdPropertyId, UIA_ClassNamePropertyId,
                    UIA_ControlTypePropertyId, UIA_EditControlTypeId, UIA_ValuePatternId,
                },
                Input::KeyboardAndMouse::{GetLastInputInfo, LASTINPUTINFO},
                WindowsAndMessaging::{GetForegroundWindow, GetWindowThreadProcessId, IsWindow},
            },
        },
        core::{BSTR, Interface, PWSTR},
    };

    use super::{BROWSERS, TALLY, day_and_hour, day_start, host_of, save};

    const SAMPLE_EVERY: Duration = Duration::from_secs(5);
    /// No keyboard or mouse input for this long means away: ActivityWatch's default.
    const AWAY_AFTER: Duration = Duration::from_secs(180);
    const SAVE_EVERY: Duration = Duration::from_secs(60);

    pub fn run(file: Option<&Path>) {
        // UI Automation is COM; this thread is its own apartment.
        let _ = unsafe { CoInitializeEx(None, COINIT_MULTITHREADED) };
        let Ok(mut bars) = AddressBars::new() else { return };
        let mut last = Instant::now();
        let mut saved = Instant::now();
        let mut unsaved = false;
        loop {
            thread::sleep(SAMPLE_EVERY);
            // After sleep or hibernation, credit one interval at most.
            let seconds = last.elapsed().min(SAMPLE_EVERY * 2).as_secs_f64();
            last = Instant::now();
            if let Some((browser, host)) = sample(&mut bars) {
                let (zone, start) = day_start();
                let (day, hour) = day_and_hour(jiff::Timestamp::now(), &zone, start);
                TALLY.lock().unwrap().add(day, hour, &host, &browser, seconds);
                unsaved = true;
            }
            if unsaved && saved.elapsed() >= SAVE_EVERY {
                if let Some(file) = file {
                    save(file, &TALLY.lock().unwrap());
                }
                saved = Instant::now();
                unsaved = false;
            }
        }
    }

    /// The browser in front and the host it shows, if the user is present
    /// and not typing in its address bar.
    fn sample(bars: &mut AddressBars) -> Option<(String, String)> {
        if idle() >= AWAY_AFTER {
            return None;
        }
        let window = unsafe { GetForegroundWindow() };
        if window.0.is_null() {
            return None;
        }
        let program = program_of(window)?;
        if !BROWSERS.contains(&program.as_str()) {
            return None;
        }
        Some((program, bars.host_in(window)?))
    }

    /// Time since the last keyboard or mouse input.
    fn idle() -> Duration {
        let mut info = LASTINPUTINFO { cbSize: size_of::<LASTINPUTINFO>() as u32, dwTime: 0 };
        if !unsafe { GetLastInputInfo(&mut info) }.as_bool() {
            return Duration::ZERO;
        }
        // Both are milliseconds since boot, wrapping every 49.7 days.
        Duration::from_millis(unsafe { GetTickCount() }.wrapping_sub(info.dwTime) as u64)
    }

    /// The lowercased file name of the program that owns a window.
    fn program_of(window: HWND) -> Option<String> {
        let mut pid = 0u32;
        unsafe { GetWindowThreadProcessId(window, Some(&mut pid)) };
        if pid == 0 {
            return None;
        }
        let process = unsafe { OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) }.ok()?;
        let mut buffer = [0u16; 1024];
        let mut len = buffer.len() as u32;
        let named = unsafe { QueryFullProcessImageNameW(process, PROCESS_NAME_WIN32, PWSTR(buffer.as_mut_ptr()), &mut len) };
        let _ = unsafe { CloseHandle(process) };
        named.ok()?;
        let path = String::from_utf16_lossy(&buffer[..len as usize]);
        Some(path.rsplit('\\').next()?.to_lowercase())
    }

    /// Finds and reads browsers' address bars, remembering each window's.
    struct AddressBars {
        automation: IUIAutomation,
        /// Chromium's omnibox (class `OmniboxViewViews`) or Firefox's
        /// `urlbar-input`: names that aren't translated.
        known: IUIAutomationCondition,
        /// Any Edit control, in case a browser renames its address bar.
        edit: IUIAutomationCondition,
        /// The address bar found in each window, by window handle.
        found: HashMap<isize, IUIAutomationElement>,
    }

    impl AddressBars {
        fn new() -> windows::core::Result<Self> {
            unsafe {
                let automation: IUIAutomation = CoCreateInstance(&CUIAutomation, None, CLSCTX_INPROC_SERVER)?;
                // A hung browser shouldn't stall sampling for UIA's default 20 s.
                if let Ok(timeouts) = automation.cast::<IUIAutomation2>() {
                    let _ = timeouts.SetTransactionTimeout(2000);
                    let _ = timeouts.SetConnectionTimeout(2000);
                }
                let mut control = number(UIA_EditControlTypeId.0);
                let edit = automation.CreatePropertyCondition(UIA_ControlTypePropertyId, &control);
                let _ = VariantClear(&mut control);
                let edit = edit?;
                let mut class = text("OmniboxViewViews");
                let omnibox = automation.CreatePropertyCondition(UIA_ClassNamePropertyId, &class);
                let _ = VariantClear(&mut class);
                let mut id = text("urlbar-input");
                let urlbar = automation.CreatePropertyCondition(UIA_AutomationIdPropertyId, &id);
                let _ = VariantClear(&mut id);
                let known = automation.CreateAndCondition(&edit, &automation.CreateOrCondition(&omnibox?, &urlbar?)?)?;
                Ok(AddressBars { automation, known, edit, found: HashMap::new() })
            }
        }

        /// The host a browser window shows. None while its address bar has
        /// keyboard focus (the user is typing) or shows no site.
        fn host_in(&mut self, window: HWND) -> Option<String> {
            let key = window.0 as isize;
            if let Some(bar) = self.found.get(&key) {
                match read(bar) {
                    Ok(host) => return host,
                    // The window's controls were rebuilt: look again.
                    Err(_) => {
                        self.found.remove(&key);
                    }
                }
            }
            let (bar, sure) = self.find(window)?;
            let host = read(&bar).ok().flatten();
            // A guessed Edit control is kept only once it shows an address.
            if sure || host.is_some() {
                if self.found.len() >= 32 {
                    self.found.retain(|&k, _| unsafe { IsWindow(Some(HWND(k as _))) }.as_bool());
                }
                self.found.insert(key, bar);
            }
            host
        }

        /// The window's address bar, and whether it was found by name.
        /// Chromium's toolbar precedes the page in the tree, so the first
        /// Edit control is the omnibox before any field on the page.
        fn find(&self, window: HWND) -> Option<(IUIAutomationElement, bool)> {
            unsafe {
                let root = self.automation.ElementFromHandle(window).ok()?;
                if let Ok(bar) = root.FindFirst(TreeScope_Descendants, &self.known) {
                    return Some((bar, true));
                }
                root.FindFirst(TreeScope_Descendants, &self.edit).ok().map(|bar| (bar, false))
            }
        }
    }

    /// The host an address bar shows; None while it has keyboard focus.
    fn read(bar: &IUIAutomationElement) -> windows::core::Result<Option<String>> {
        unsafe {
            if bar.CurrentHasKeyboardFocus()?.as_bool() {
                return Ok(None);
            }
            let value: IUIAutomationValuePattern = bar.GetCurrentPatternAs(UIA_ValuePatternId)?;
            Ok(host_of(&value.CurrentValue()?.to_string()))
        }
    }

    /// VARIANTs for property conditions; the caller clears them.
    fn variant(vt: VARENUM, value: VARIANT_0_0_0) -> VARIANT {
        let inner = VARIANT_0_0 { vt, wReserved1: 0, wReserved2: 0, wReserved3: 0, Anonymous: value };
        VARIANT { Anonymous: VARIANT_0 { Anonymous: ManuallyDrop::new(inner) } }
    }

    fn number(n: i32) -> VARIANT {
        variant(VT_I4, VARIANT_0_0_0 { lVal: n })
    }

    fn text(s: &str) -> VARIANT {
        variant(VT_BSTR, VARIANT_0_0_0 { bstrVal: ManuallyDrop::new(BSTR::from(s)) })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn day(s: &str) -> Date {
        s.parse().unwrap()
    }

    #[test]
    fn hosts_come_from_what_address_bars_show() {
        assert_eq!(host_of("youtube.com/watch?v=abc").as_deref(), Some("youtube.com"));
        assert_eq!(host_of("https://www.Example.COM/a#b").as_deref(), Some("example.com"));
        assert_eq!(host_of("http://user@news.ycombinator.com:8080/item").as_deref(), Some("news.ycombinator.com"));
        assert_eq!(host_of("  m.youtube.com  ").as_deref(), Some("m.youtube.com"));
        assert_eq!(host_of("192.168.1.1:8080/admin").as_deref(), Some("192.168.1.1"));
        assert_eq!(host_of("localhost:3000").as_deref(), Some("localhost"));
        assert_eq!(host_of("bücher.de/x").as_deref(), Some("bücher.de"));
    }

    #[test]
    fn search_text_and_browser_pages_are_not_hosts() {
        for text in ["", "how to cook rice", "chrome://settings", "edge://newtab", "about:blank", "file:///C:/notes.txt", "3.14", "rice", "www.", "-a.com"] {
            assert_eq!(host_of(text), None, "{text}");
        }
    }

    #[test]
    fn site_members_match_their_domain_and_subdomains() {
        let youtube = site_member("site:YouTube.com").unwrap();
        assert_eq!(youtube, "youtube.com");
        assert_eq!(site_member("site:www.reddit.com").as_deref(), Some("reddit.com"));
        assert_eq!(site_member("win:brave.exe"), None);
        assert!(matches("youtube.com", &youtube));
        assert!(matches("m.youtube.com", &youtube));
        assert!(!matches("notyoutube.com", &youtube));
        assert!(!matches("youtube.com.evil.net", &youtube));
    }

    #[test]
    fn early_hours_belong_to_the_day_before() {
        let zone = TimeZone::get("America/Los_Angeles").unwrap();
        let six = Time::constant(6, 0, 0, 0);
        let at = |s: &str| s.parse::<jiff::civil::DateTime>().unwrap().to_zoned(zone.clone()).unwrap().timestamp();
        assert_eq!(day_and_hour(at("2026-10-10T05:59"), &zone, six), (day("2026-10-09"), 5));
        assert_eq!(day_and_hour(at("2026-10-10T06:00"), &zone, six), (day("2026-10-10"), 6));
        assert_eq!(day_and_hour(at("2026-10-10T23:30"), &zone, six), (day("2026-10-10"), 23));
        assert_eq!(day_and_hour(at("2026-10-11T00:10"), &zone, six), (day("2026-10-10"), 0));
    }

    #[test]
    fn tallies_add_up_by_domain_and_skip_counted_browsers() {
        let mut tally = Tally::new();
        let today = day("2026-10-10");
        tally.add(today, 9, "docs.google.com", "brave.exe", 300.0);
        tally.add(today, 9, "docs.google.com", "brave.exe", 5.0);
        tally.add(today, 10, "google.com", "chrome.exe", 60.0);
        tally.add(today, 10, "youtube.com", "brave.exe", 120.0);
        tally.add(today, 11, "m.youtube.com", "firefox.exe", 60.0);
        let google = vec!["google.com".to_string()];
        assert_eq!(tally.seconds_on(today, &google, &google, &[]), 365.0);
        // Chrome is a member of the source already, so its site time isn't added twice.
        assert_eq!(tally.seconds_on(today, &google, &google, &["chrome.exe".into()]), 305.0);
        assert_eq!(tally.seconds_on(day("2026-10-09"), &google, &google, &[]), 0.0);
        let blocked = vec!["youtube.com".to_string(), "m.youtube.com".to_string()];
        assert_eq!(
            tally.seconds_by_domain(today, &blocked, &[]),
            vec![("m.youtube.com".to_string(), 60.0), ("youtube.com".to_string(), 120.0)]
        );
        assert_eq!(tally.hosts["docs.google.com"]["brave.exe"][9], 305.0);
    }

    #[test]
    fn a_host_earns_only_for_the_source_with_the_longest_match() {
        let mut tally = Tally::new();
        let today = day("2026-10-10");
        tally.add(today, 9, "read.readwise.io", "brave.exe", 600.0);
        tally.add(today, 9, "readwise.io", "brave.exe", 120.0);
        tally.add(today, 9, "x.read.readwise.io", "chrome.exe", 60.0);
        let reading = vec!["read.readwise.io".to_string()];
        let review = vec!["readwise.io".to_string()];
        let all = vec!["readwise.io".to_string(), "read.readwise.io".to_string()];
        assert_eq!(tally.seconds_on(today, &reading, &all, &[]), 660.0);
        assert_eq!(tally.seconds_on(today, &review, &all, &[]), 120.0);
        // Alone, the shorter domain covers its subdomains.
        assert_eq!(tally.seconds_on(today, &review, &review, &[]), 780.0);
    }

    #[test]
    fn a_new_day_drops_the_old_one() {
        let mut tally = Tally::new();
        tally.add(day("2026-10-09"), 22, "reddit.com", "brave.exe", 60.0);
        tally.add(day("2026-10-10"), 7, "github.com", "brave.exe", 5.0);
        tally.add(day("2026-10-09"), 23, "reddit.com", "brave.exe", 60.0);
        assert_eq!(tally.day, Some(day("2026-10-10")));
        assert_eq!(tally.hosts.keys().collect::<Vec<_>>(), vec!["github.com"]);
    }

    #[test]
    fn the_tally_survives_a_restart() {
        let dir = std::env::temp_dir().join(format!("voucher-sites-{}", std::process::id()));
        let file = dir.join("sites.json");
        let mut tally = Tally::new();
        tally.add(day("2026-10-10"), 14, "github.com", "msedge.exe", 42.5);
        save(&file, &tally);
        assert_eq!(load(&file), Some(tally));
        let _ = fs::remove_dir_all(dir);
    }
}
