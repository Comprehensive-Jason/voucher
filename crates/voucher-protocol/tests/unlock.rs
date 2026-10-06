use ed25519_dalek::SigningKey;
use voucher_protocol::{Rejection, Unlock, sign, verify};

// Fixed keys keep the tests deterministic; real keys come from a random generator.
fn ledger_key() -> SigningKey {
    SigningKey::from_bytes(&[7; 32])
}

// 2026-10-06 18:00:00 UTC, as Unix seconds.
const NOW: i64 = 1_791_309_600;

#[test]
fn a_freshly_signed_unlock_is_accepted() {
    let unlock = Unlock { ends_at: NOW + 600 };
    let wire = sign(&unlock, &ledger_key());

    assert_eq!(
        verify(&wire, &ledger_key().verifying_key(), NOW),
        Ok(unlock)
    );
}

#[test]
fn an_unlock_edited_after_signing_is_refused() {
    let genuine = sign(&Unlock { ends_at: NOW + 600 }, &ledger_key());
    let longer = sign(
        &Unlock {
            ends_at: NOW + 6_000,
        },
        &ledger_key(),
    );
    // Graft the longer Unlock's payload onto the genuine Unlock's signature.
    let forged = format!(
        "{}.{}",
        longer.split_once('.').unwrap().0,
        genuine.split_once('.').unwrap().1
    );

    assert_eq!(
        verify(&forged, &ledger_key().verifying_key(), NOW),
        Err(Rejection::BadSignature)
    );
}

#[test]
fn an_unlock_signed_by_another_key_is_refused() {
    let impostor = SigningKey::from_bytes(&[9; 32]);
    let wire = sign(&Unlock { ends_at: NOW + 600 }, &impostor);

    assert_eq!(
        verify(&wire, &ledger_key().verifying_key(), NOW),
        Err(Rejection::BadSignature)
    );
}

#[test]
fn an_unlock_is_refused_from_the_moment_it_ends() {
    let wire = sign(&Unlock { ends_at: NOW + 600 }, &ledger_key());
    let key = ledger_key().verifying_key();

    assert!(verify(&wire, &key, NOW + 599).is_ok());
    assert_eq!(verify(&wire, &key, NOW + 600), Err(Rejection::Expired));
}

#[test]
fn garbage_is_refused_as_malformed() {
    let key = ledger_key().verifying_key();

    for junk in ["", "no-dot-here", "!!!.???", "e30.c2ln"] {
        assert_eq!(
            verify(junk, &key, NOW),
            Err(Rejection::Malformed),
            "{junk:?}"
        );
    }
}
