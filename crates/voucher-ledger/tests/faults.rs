use std::collections::BTreeMap;

use voucher_ledger::faults::{Fault, Faults, TOKEN_PROBLEM};

#[test]
fn with_no_fault_on_nothing_is_forced() {
    let faults = Faults::new();

    for (method, path) in [("GET", "/status"), ("POST", "/change"), ("POST", "/redeem")] {
        assert_eq!(faults.reply(method, path), None);
    }
}

#[test]
fn each_fault_forces_only_its_own_routes() {
    let cases: [(Fault, &str, &str, u16); 7] = [
        (Fault::Unauthorized, "GET", "/history", 401),
        (Fault::Garbled, "GET", "/day", 200),
        (Fault::RefuseChanges, "POST", "/change", 400),
        (Fault::RefuseTear, "POST", "/redeem", 409),
        (Fault::FailMarker, "POST", "/marker", 500),
        (Fault::FailExport, "GET", "/export.json", 500),
        (Fault::FailExport, "GET", "/export/days.csv", 500),
    ];
    for (fault, method, path, status) in cases {
        let mut faults = Faults::new();
        faults.set(fault, true);

        let (got, _) = faults.reply(method, path).expect("forced");
        assert_eq!(got, status, "{fault:?} on {method} {path}");
        let others_forced = faults.reply("GET", "/markers").is_some();
        assert_eq!(
            others_forced,
            fault == Fault::Unauthorized,
            "{fault:?} on /markers"
        );
    }
}

#[test]
fn a_garbled_reply_is_not_json() {
    let mut faults = Faults::new();
    faults.set(Fault::Garbled, true);

    let (_, body) = faults.reply("GET", "/status").unwrap();
    assert!(serde_json::from_str::<serde_json::Value>(&body).is_err());
}

#[test]
fn test_routes_and_the_key_always_go_through() {
    let mut faults = Faults::new();
    for fault in Fault::ALL {
        faults.set(fault, true);
    }

    assert_eq!(faults.reply("POST", "/test/fault"), None);
    assert_eq!(faults.reply("GET", "/test/fault"), None);
    assert_eq!(faults.reply("GET", "/key"), None);
    assert_eq!(faults.reply("GET", "/status").unwrap().0, 401);
}

#[test]
fn faults_turn_off_and_list_by_name() {
    let mut faults = Faults::new();
    faults.set(Fault::Token, true);
    faults.set(Fault::RefuseTear, true);
    faults.set(Fault::Token, false);

    assert_eq!(faults.names(), vec!["refuse-tear"]);
    for fault in Fault::ALL {
        assert_eq!(Fault::parse(fault.name()), Some(fault));
    }
    assert_eq!(Fault::parse("nonsense"), None);
}

#[test]
fn the_token_fault_marks_every_task_service() {
    let mut faults = Faults::new();
    let earlier = BTreeMap::from([(
        "todoist".to_string(),
        "the service answered 500".to_string(),
    )]);
    let services = || ["todoist".to_string(), "clickup".to_string()];

    assert_eq!(faults.source_errors(earlier.clone(), services()), earlier);

    faults.set(Fault::Token, true);
    let errors = faults.source_errors(earlier, services());
    assert_eq!(errors.len(), 2);
    assert!(errors.values().all(|e| e == TOKEN_PROBLEM));
}
