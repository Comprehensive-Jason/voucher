//! Focus stretches on Windows, by the phone's rule (Enforcer.kt's
//! focusStretches): unbroken time in one focus source, where switching
//! between its programs or sites, or leaving for under 2 minutes, doesn't
//! end a stretch, and only whole minutes from 1 up count. Plain code, so it
//! is tested anywhere.

/// A gap shorter than this (milliseconds) doesn't end a stretch.
const JOIN_UNDER_MS: i64 = 120_000;

/// One focus stretch: its source's id, when it started (Unix milliseconds),
/// and its whole minutes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Found {
    pub source: String,
    pub start: i64,
    pub minutes: u32,
}

/// Joins time in focus sources, as (source id, start, end) in Unix
/// milliseconds in any order, into stretches, oldest first.
pub fn join(mut spans: Vec<(String, i64, i64)>) -> Vec<Found> {
    spans.sort_by_key(|s| s.1);
    let mut out = Vec::new();
    let mut current: Option<(String, i64, i64)> = None;
    for (source, a, b) in spans {
        match &mut current {
            Some((s, _, stop)) if *s == source && a - *stop < JOIN_UNDER_MS => *stop = (*stop).max(b),
            _ => {
                if let Some(done) = current.take() {
                    out.push(done);
                }
                current = Some((source, a, b));
            }
        }
    }
    out.extend(current);
    out.into_iter()
        .map(|(source, start, stop)| Found { source, start, minutes: u32::try_from((stop - start) / 60_000).unwrap_or(0) })
        .filter(|f| f.minutes >= 1)
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    const MIN: i64 = 60_000;

    fn span(source: &str, from: i64, to: i64) -> (String, i64, i64) {
        (source.into(), from * MIN, to * MIN)
    }

    #[test]
    fn short_gaps_and_switches_within_a_source_keep_a_stretch() {
        let found = join(vec![
            span("obsidian", 0, 20),
            // Back after a minute: the same stretch.
            span("obsidian", 21, 30),
            // A site of another source, then back: two new stretches.
            span("reading", 30, 45),
            span("obsidian", 45, 50),
            // Gone 2 minutes or more: a new one.
            span("obsidian", 52, 60),
        ]);
        let got: Vec<(&str, i64, u32)> = found.iter().map(|f| (f.source.as_str(), f.start / MIN, f.minutes)).collect();
        assert_eq!(got, vec![("obsidian", 0, 30), ("reading", 30, 15), ("obsidian", 45, 5), ("obsidian", 52, 8)]);
    }

    #[test]
    fn overlapping_time_counts_once_and_under_a_minute_is_dropped() {
        // A program and one of the same source's sites in front together.
        let found = join(vec![span("reading", 10, 40), span("reading", 0, 25), (String::from("anki"), 100 * MIN, 100 * MIN + 50_000)]);
        assert_eq!(found, vec![Found { source: "reading".into(), start: 0, minutes: 40 }]);
    }
}
