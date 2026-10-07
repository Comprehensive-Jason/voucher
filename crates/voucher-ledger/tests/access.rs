use voucher_ledger::access::{authorized, new_code};

#[test]
fn without_a_code_everything_is_allowed() {
    assert!(authorized(None, None));
}

#[test]
fn with_a_code_only_the_matching_bearer_header_is_allowed() {
    let code = Some("VCHR-ABCD-EFGH-JKMN-PQRS");

    assert!(authorized(code, Some("Bearer VCHR-ABCD-EFGH-JKMN-PQRS")));
    assert!(!authorized(code, Some("Bearer VCHR-ABCD-EFGH-JKMN-PQRT")));
    assert!(!authorized(code, Some("VCHR-ABCD-EFGH-JKMN-PQRS")));
    assert!(!authorized(code, None));
}

#[test]
fn new_codes_are_readable_and_different() {
    let (a, b) = (new_code(), new_code());

    assert_ne!(a, b);
    assert_eq!(a.len(), 24);
    assert!(a.starts_with("VCHR-"));
    assert!(
        a.chars()
            .all(|c| c == '-' || c.is_ascii_uppercase() || c.is_ascii_digit())
    );
}
