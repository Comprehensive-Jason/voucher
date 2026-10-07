//! Maintained lists of sites, such as the public Invidious and Piped
//! instances that serve YouTube without youtube.com. A blocklist names a list
//! as `list:invidious`; the server fetches the lists daily and Enforcers
//! receive the domains.

/// Domains from Invidious's directory (`api.invidious.io/instances.json`):
/// an array of `[domain, details]` pairs.
pub fn invidious(json: &str) -> Result<Vec<String>, serde_json::Error> {
    let pairs: Vec<(String, serde_json::Value)> = serde_json::from_str(json)?;
    Ok(pairs
        .into_iter()
        .map(|(domain, _)| domain)
        .filter(|d| d.contains('.') && !d.ends_with(".onion") && !d.ends_with(".i2p"))
        .collect())
}

/// API hosts from Piped's public instance table (its documentation's
/// Markdown). Blocking a Piped site's API host also stops its pages loading.
/// The official front ends are always included.
pub fn piped(markdown: &str) -> Vec<String> {
    let mut domains: Vec<String> = markdown
        .lines()
        .filter_map(|line| line.split('|').nth(1))
        .filter_map(|cell| cell.trim().strip_prefix("https://"))
        .map(|host| host.trim_end_matches('/').to_string())
        .collect();
    domains.extend(["piped.video", "piped.kavin.rocks"].map(String::from));
    domains.sort();
    domains.dedup();
    domains
}
