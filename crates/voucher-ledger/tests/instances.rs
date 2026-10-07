use voucher_ledger::instances;

#[test]
fn invidious_domains_come_from_the_directory_without_onion_addresses() {
    let json =
        r#"[["inv.nadeko.net",{"type":"https"}],["abc.onion",{"type":"onion"}],["yewtu.be",{}]]"#;

    assert_eq!(
        instances::invidious(json).unwrap(),
        vec!["inv.nadeko.net", "yewtu.be"]
    );
}

#[test]
fn piped_hosts_come_from_the_api_column_plus_the_official_front_ends() {
    let markdown = "Instance Name | Instance API URL | Location\n--- | --- | ---\n\
kavin.rocks (Official) | https://pipedapi.kavin.rocks | US\n\
piped.yt | https://api.piped.yt/ | DE\n";

    assert_eq!(
        instances::piped(markdown),
        vec![
            "api.piped.yt",
            "piped.kavin.rocks",
            "piped.video",
            "pipedapi.kavin.rocks"
        ]
    );
}
