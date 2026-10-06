//! The Ledger's rules: crediting Vouchers to the Bank, Redeeming them for
//! signed Unlocks, Curfew, and holding Loosenings until the Morning boundary.
//! Pure logic: every method takes the current time, so tests can control it.

pub mod clickup;
pub mod todoist;

use std::collections::HashSet;

use ed25519_dalek::SigningKey;
use jiff::{
    SignedDuration, Timestamp,
    civil::{Date, Time},
    tz::TimeZone,
};
use voucher_protocol::{Unlock, sign};

/// The tunable numbers and times the rules run on.
#[derive(Debug, Clone, PartialEq)]
pub struct Settings {
    pub time_zone: TimeZone,
    pub bank_limit: u32,
    pub unlock_minutes: u32,
    pub curfew_start: Time,
    pub curfew_end: Time,
    pub morning_boundary: Time,
}

/// One finished task reported by an Activity source. `task` is prefixed with
/// its source (`todoist:`, `clickup:`) so IDs from different sources never clash.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Completion {
    pub task: String,
    pub at: Timestamp,
}

/// What happened to a batch of earned Vouchers.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Credited {
    pub kept: u32,
    /// Lost because the Bank was full.
    pub forfeited: u32,
}

/// A successful Redemption: the signed Unlock to hand to Enforcers.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Redeemed {
    pub wire: String,
    pub ends_at: Timestamp,
}

/// Why a Redemption was refused.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Refusal {
    EmptyBank,
    /// An Unlock is still running; Unlocks never stack.
    UnlockActive,
    /// It is Curfew; nothing can be Redeemed until it ends.
    Curfew,
}

/// A requested change to one setting.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Change {
    UnlockMinutes(u32),
    BankLimit(u32),
    Curfew { start: Time, end: Time },
}

/// When a requested change takes effect.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Effect {
    /// A Tightening: applied immediately.
    Now,
    /// A Loosening: held until this Morning boundary.
    At(Timestamp),
}

pub struct Ledger {
    settings: Settings,
    key: SigningKey,
    bank: u32,
    unlock_ends_at: Option<Timestamp>,
    /// Loosenings waiting for their Morning boundary, oldest first.
    pending: Vec<(Change, Timestamp)>,
    /// Which tasks have already earned on which local day.
    earned: HashSet<(String, Date)>,
}

impl Ledger {
    pub fn new(settings: Settings, key: SigningKey) -> Self {
        Ledger {
            settings,
            key,
            bank: 0,
            unlock_ends_at: None,
            pending: Vec::new(),
            earned: HashSet::new(),
        }
    }

    /// Vouchers currently held.
    pub fn bank(&self) -> u32 {
        self.bank
    }

    /// Adds earned Vouchers to the Bank, forfeiting any past the Bank limit.
    pub fn credit(&mut self, vouchers: u32, now: Timestamp) -> Credited {
        self.settle(now);
        let room = self.settings.bank_limit.saturating_sub(self.bank);
        let kept = vouchers.min(room);
        self.bank += kept;
        Credited {
            kept,
            forfeited: vouchers - kept,
        }
    }

    /// Credits one Voucher per Completion, but each task earns at most once
    /// per local day. Re-polling, or ticking a task off, on, and off again,
    /// earns nothing extra; a recurring habit done again tomorrow earns again.
    pub fn record(&mut self, completions: &[Completion], now: Timestamp) -> Credited {
        let mut fresh = 0;
        for completion in completions {
            let day = completion
                .at
                .to_zoned(self.settings.time_zone.clone())
                .date();
            if self.earned.insert((completion.task.clone(), day)) {
                fresh += 1;
            }
        }
        self.credit(fresh, now)
    }

    /// Spends one Voucher and signs an Unlock starting now.
    pub fn redeem(&mut self, now: Timestamp) -> Result<Redeemed, Refusal> {
        self.settle(now);
        if self.in_curfew(now) {
            return Err(Refusal::Curfew);
        }
        if self.unlock_ends_at.is_some_and(|ends_at| now < ends_at) {
            return Err(Refusal::UnlockActive);
        }
        if self.bank == 0 {
            return Err(Refusal::EmptyBank);
        }
        let length = SignedDuration::from_mins(i64::from(self.settings.unlock_minutes));
        let full_length = now
            .checked_add(length)
            .expect("an Unlock never ends past the year 9999");
        // Never let an Unlock run into Curfew.
        let ends_at = full_length.min(self.next_local(now, self.settings.curfew_start));
        self.bank -= 1;
        self.unlock_ends_at = Some(ends_at);
        let wire = sign(
            &Unlock {
                ends_at: ends_at.as_second(),
            },
            &self.key,
        );
        Ok(Redeemed { wire, ends_at })
    }

    /// Whether `now`, in local time, falls in the Curfew window. The window
    /// usually crosses midnight (22:00 to 06:00), so it is "after the start OR
    /// before the end" rather than "between".
    fn in_curfew(&self, now: Timestamp) -> bool {
        let local = now.to_zoned(self.settings.time_zone.clone()).time();
        let (start, end) = (self.settings.curfew_start, self.settings.curfew_end);
        if start <= end {
            start <= local && local < end
        } else {
            local >= start || local < end
        }
    }

    /// The next moment, strictly after `now`, when the local clock reads `time`.
    fn next_local(&self, now: Timestamp, time: Time) -> Timestamp {
        let tz = &self.settings.time_zone;
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
        if self.loosens(change) {
            let effective_at = self.next_local(now, self.settings.morning_boundary);
            self.pending.push((change, effective_at));
            Effect::At(effective_at)
        } else {
            // Whatever is queued for this setting would undo this decision.
            self.pending.retain(|(queued, _)| {
                std::mem::discriminant(queued) != std::mem::discriminant(&change)
            });
            self.apply(change);
            Effect::Now
        }
    }

    /// Whether a change would increase access compared with current settings.
    fn loosens(&self, change: Change) -> bool {
        match change {
            Change::UnlockMinutes(minutes) => minutes > self.settings.unlock_minutes,
            Change::BankLimit(limit) => limit > self.settings.bank_limit,
            Change::Curfew { start, end } => {
                // Shrinking Curfew at either end frees time, so it loosens.
                let (old_start, old_end) = (self.settings.curfew_start, self.settings.curfew_end);
                from_noon(start) > from_noon(old_start) || from_noon(end) < from_noon(old_end)
            }
        }
    }

    fn apply(&mut self, change: Change) {
        match change {
            Change::UnlockMinutes(minutes) => self.settings.unlock_minutes = minutes,
            Change::BankLimit(limit) => self.settings.bank_limit = limit,
            Change::Curfew { start, end } => {
                self.settings.curfew_start = start;
                self.settings.curfew_end = end;
            }
        }
    }

    /// Applies every pending Loosening whose Morning boundary has passed.
    fn settle(&mut self, now: Timestamp) {
        let (due, waiting) = std::mem::take(&mut self.pending)
            .into_iter()
            .partition(|&(_, effective_at)| effective_at <= now);
        self.pending = waiting;
        for (change, _) in due {
            self.apply(change);
        }
    }
}

/// Minutes since noon. Curfew is a night window that crosses midnight, so
/// measuring from noon puts its start before its end and makes "earlier" and
/// "later" compare naturally (22:00 is 600, 06:00 is 1080). Assumes a Curfew
/// never spans noon.
fn from_noon(time: Time) -> i32 {
    let minutes = i32::from(time.hour()) * 60 + i32::from(time.minute());
    (minutes - 12 * 60).rem_euclid(24 * 60)
}
