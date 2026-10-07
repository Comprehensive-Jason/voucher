//! The Ledger's access code. Anyone who can reach a Ledger could otherwise
//! Redeem its Vouchers or change its rules, so a Ledger with a code answers
//! only requests that carry it as `Authorization: Bearer <code>`. The
//! public key stays readable without one.

/// Whether a request's Authorization header satisfies the Ledger's code.
/// A Ledger without a code (one set up before codes existed) allows all.
pub fn authorized(code: Option<&str>, header: Option<&str>) -> bool {
    let Some(code) = code else { return true };
    let Some(given) = header.and_then(|h| h.strip_prefix("Bearer ")) else {
        return false;
    };
    // Compare every byte, so timing says nothing about how much matched.
    given.len() == code.len()
        && given
            .bytes()
            .zip(code.bytes())
            .fold(0u8, |diff, (a, b)| diff | (a ^ b))
            == 0
}

/// A fresh code like `VCHR-7K2M-QX9P-4TBN-W8RD`: 16 random characters from
/// an alphabet without look-alikes (no I, L, O, U), about 80 bits.
pub fn new_code() -> String {
    const ALPHABET: &[u8] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
    let mut bytes = [0u8; 16];
    getrandom::fill(&mut bytes).expect("the OS random number generator works");
    let chars: Vec<char> = bytes
        .iter()
        .map(|b| ALPHABET[(*b & 31) as usize] as char)
        .collect();
    let groups: Vec<String> = chars.chunks(4).map(|c| c.iter().collect()).collect();
    format!("VCHR-{}", groups.join("-"))
}
