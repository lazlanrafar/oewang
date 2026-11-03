//! Sealing and opening a message with AES-256-GCM.
//!
//! A fresh random 96-bit nonce per message, a 128-bit tag, and the associated
//! data from `aad`. Opening is all-or-nothing: a flipped bit anywhere in the
//! ciphertext, the tag or the associated data fails, and the caller gets an
//! error rather than plausible-looking plaintext.

use aes_gcm::{
    aead::{Aead, KeyInit, Payload},
    Aes256Gcm, Key, Nonce,
};
use rand::RngCore;
use serde::{Deserialize, Serialize};

use super::{handshake, Owe1Error};

pub const NONCE_LEN: usize = 12;

/// The body of a sealed message: `{"n": nonce, "c": ciphertext}`, both
/// base64url without padding.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
pub struct SealedBody {
    pub n: String,
    pub c: String,
}

pub fn seal(key: &[u8; 32], aad: &[u8], plaintext: &[u8]) -> Result<SealedBody, Owe1Error> {
    let mut nonce_bytes = [0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    seal_with_nonce(key, aad, plaintext, &nonce_bytes)
}

/// Sealing with a caller-supplied nonce. Only for generating the shared test
/// vectors, where the output has to be reproducible; production sealing uses
/// `seal`, which draws from the CSPRNG.
pub fn seal_with_nonce(
    key: &[u8; 32],
    aad: &[u8],
    plaintext: &[u8],
    nonce_bytes: &[u8; NONCE_LEN],
) -> Result<SealedBody, Owe1Error> {
    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(nonce_bytes);

    let ciphertext = cipher
        .encrypt(
            nonce,
            Payload {
                msg: plaintext,
                aad,
            },
        )
        .map_err(|_| Owe1Error::SealFailed)?;

    Ok(SealedBody {
        n: handshake::encode(nonce_bytes),
        c: handshake::encode(&ciphertext),
    })
}

pub fn open(key: &[u8; 32], aad: &[u8], body: &SealedBody) -> Result<Vec<u8>, Owe1Error> {
    let nonce_bytes = handshake::decode_fixed::<NONCE_LEN>(&body.n, "n")?;
    let ciphertext =
        base64::Engine::decode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, &body.c)
            .map_err(|_| Owe1Error::MalformedField("c"))?;

    let cipher = Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(key));
    let nonce = Nonce::from_slice(&nonce_bytes);

    cipher
        .decrypt(
            nonce,
            Payload {
                msg: &ciphertext,
                aad,
            },
        )
        .map_err(|_| Owe1Error::DecryptFailed)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::owe1::aad;

    const KEY: [u8; 32] = [42u8; 32];

    #[test]
    fn should_round_trip() {
        let aad = aad::request("cs_a", "POST", "/v1/transactions", "req_1", 1762070523);
        let plaintext = br#"{"amount":"50000.0000"}"#;

        let sealed = seal(&KEY, &aad, plaintext).unwrap();
        let opened = open(&KEY, &aad, &sealed).unwrap();

        assert_eq!(opened, plaintext);
    }

    #[test]
    fn should_use_a_fresh_nonce_per_message() {
        let aad = aad::response("cs_a", "req_1", 200);
        let a = seal(&KEY, &aad, b"same plaintext").unwrap();
        let b = seal(&KEY, &aad, b"same plaintext").unwrap();

        assert_ne!(a.n, b.n, "nonce must not repeat");
        assert_ne!(
            a.c, b.c,
            "identical plaintext must not produce identical ciphertext"
        );
    }

    #[test]
    fn should_fail_when_the_ciphertext_is_tampered_with() {
        let aad = aad::response("cs_a", "req_1", 200);
        let mut sealed = seal(&KEY, &aad, b"balance: 1000").unwrap();

        // Flip one character of the ciphertext.
        let mut chars: Vec<char> = sealed.c.chars().collect();
        chars[0] = if chars[0] == 'A' { 'B' } else { 'A' };
        sealed.c = chars.into_iter().collect();

        assert!(matches!(
            open(&KEY, &aad, &sealed),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_fail_when_moved_to_another_endpoint() {
        let sealed = seal(
            &KEY,
            &aad::request("cs_a", "POST", "/v1/transactions", "req_1", 1),
            b"payload",
        )
        .unwrap();

        // Same session, same request id, different path.
        let moved = aad::request("cs_a", "POST", "/v1/wallets", "req_1", 1);
        assert!(matches!(
            open(&KEY, &moved, &sealed),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_fail_when_the_status_is_swapped() {
        let sealed = seal(&KEY, &aad::response("cs_a", "req_1", 403), b"denied").unwrap();
        let as_ok = aad::response("cs_a", "req_1", 200);
        assert!(matches!(
            open(&KEY, &as_ok, &sealed),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_fail_when_replayed_onto_another_request() {
        let sealed = seal(&KEY, &aad::response("cs_a", "req_1", 200), b"body").unwrap();
        let other = aad::response("cs_a", "req_2", 200);
        assert!(matches!(
            open(&KEY, &other, &sealed),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_fail_with_the_wrong_key() {
        let aad = aad::response("cs_a", "req_1", 200);
        let sealed = seal(&KEY, &aad, b"body").unwrap();
        assert!(matches!(
            open(&[7u8; 32], &aad, &sealed),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_fail_when_stream_events_are_reordered() {
        let s0 = seal(&KEY, &aad::stream_event("cs_a", "req_1", 0), b"first").unwrap();
        let as_second = aad::stream_event("cs_a", "req_1", 1);
        assert!(matches!(
            open(&KEY, &as_second, &s0),
            Err(Owe1Error::DecryptFailed)
        ));
    }

    #[test]
    fn should_reject_a_malformed_nonce_field() {
        let body = SealedBody {
            n: "short".into(),
            c: "AAAA".into(),
        };
        assert!(matches!(
            open(&KEY, b"aad", &body),
            Err(Owe1Error::MalformedField("n"))
        ));
    }

    #[test]
    fn should_be_deterministic_with_a_fixed_nonce() {
        // What makes shared test vectors possible across three languages.
        let aad = aad::response("cs_a", "req_1", 200);
        let a = seal_with_nonce(&KEY, &aad, b"body", &[1u8; NONCE_LEN]).unwrap();
        let b = seal_with_nonce(&KEY, &aad, b"body", &[1u8; NONCE_LEN]).unwrap();
        assert_eq!(a, b);
    }
}
