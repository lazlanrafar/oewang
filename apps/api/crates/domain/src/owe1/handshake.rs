//! The handshake: key agreement, key derivation and the signed transcript.
//!
//! Specified in docs/api/encryption.md#handshake. Every step here is part of
//! the wire contract; the shared test vectors exist so the Rust, Node and
//! Python implementations cannot drift from it.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use hkdf::Hkdf;
use sha2::{Digest, Sha256};
use x25519_dalek::{PublicKey, StaticSecret};

use super::Owe1Error;

pub const VERSION: u8 = 1;
pub const SESSION_PREFIX: &str = "cs_";

const TRANSCRIPT_LABEL: &[u8] = b"oewang/owe1/handshake";
const INFO_C2S: &str = "oewang/owe1/c2s/";
const INFO_S2C: &str = "oewang/owe1/s2c/";

/// The two directional keys derived from one agreement.
///
/// Separate keys per direction mean the two sides never share a nonce space,
/// so a random 96-bit nonce is safe on both.
#[derive(Clone, PartialEq, Eq)]
pub struct SessionKeys {
    pub client_to_server: [u8; 32],
    pub server_to_client: [u8; 32],
}

impl std::fmt::Debug for SessionKeys {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // Keys never print. See OPS-3.
        f.write_str("SessionKeys([redacted])")
    }
}

/// Derive both keys from an X25519 agreement.
///
/// Rejects a shared secret that is not contributory, which is what a
/// low-order public key produces. Accepting one would mean both sides derive
/// a key an attacker already knows.
pub fn derive_keys(
    server_private: &StaticSecret,
    client_public: &PublicKey,
    client_nonce: &[u8; 16],
    server_nonce: &[u8; 16],
    session_id: &str,
) -> Result<SessionKeys, Owe1Error> {
    let shared = server_private.diffie_hellman(client_public);
    if !shared.was_contributory() {
        return Err(Owe1Error::LowOrderPoint);
    }

    let mut salt = [0u8; 32];
    salt[..16].copy_from_slice(client_nonce);
    salt[16..].copy_from_slice(server_nonce);

    let hk = Hkdf::<Sha256>::new(Some(&salt), shared.as_bytes());

    let mut client_to_server = [0u8; 32];
    let mut server_to_client = [0u8; 32];

    hk.expand(format!("{INFO_C2S}{session_id}").as_bytes(), &mut client_to_server)
        .map_err(|_| Owe1Error::KeyDerivation)?;
    hk.expand(format!("{INFO_S2C}{session_id}").as_bytes(), &mut server_to_client)
        .map_err(|_| Owe1Error::KeyDerivation)?;

    Ok(SessionKeys { client_to_server, server_to_client })
}

/// The bytes the server signs.
///
/// Every binary part has a fixed size and the session id a fixed shape, so
/// the concatenation is unambiguous: no length prefixes are needed and no two
/// different handshakes can produce the same transcript.
pub fn transcript(
    client_public: &[u8; 32],
    server_public: &[u8; 32],
    client_nonce: &[u8; 16],
    server_nonce: &[u8; 16],
    session_id: &str,
    expires_at: i64,
    server_time: i64,
) -> Vec<u8> {
    let mut out = Vec::with_capacity(TRANSCRIPT_LABEL.len() + 96 + session_id.len() + 48);
    out.extend_from_slice(TRANSCRIPT_LABEL);
    out.extend_from_slice(client_public);
    out.extend_from_slice(server_public);
    out.extend_from_slice(client_nonce);
    out.extend_from_slice(server_nonce);
    out.extend_from_slice(session_id.as_bytes());
    out.extend_from_slice(b"|");
    out.extend_from_slice(expires_at.to_string().as_bytes());
    out.extend_from_slice(b"|");
    out.extend_from_slice(server_time.to_string().as_bytes());
    out
}

/// `k-` plus the first 12 characters of base64url(SHA-256(public key)).
///
/// Derived rather than assigned, so a key and its id cannot be mismatched in
/// configuration.
pub fn key_id(public_key: &[u8; 32]) -> String {
    let digest = Sha256::digest(public_key);
    let encoded = URL_SAFE_NO_PAD.encode(digest);
    format!("k-{}", &encoded[..12])
}

pub fn new_session_id() -> String {
    format!("{SESSION_PREFIX}{}", cuid2::create_id())
}

/// Decode a base64url value that must be exactly `N` bytes.
pub fn decode_fixed<const N: usize>(
    value: &str,
    field: &'static str,
) -> Result<[u8; N], Owe1Error> {
    let bytes = URL_SAFE_NO_PAD
        .decode(value)
        .map_err(|_| Owe1Error::MalformedField(field))?;
    bytes
        .try_into()
        .map_err(|_| Owe1Error::MalformedField(field))
}

pub fn encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn secret(byte: u8) -> StaticSecret {
        StaticSecret::from([byte; 32])
    }

    #[test]
    fn should_derive_the_same_keys_on_both_sides() {
        let server = secret(7);
        let client = secret(9);
        let cn = [1u8; 16];
        let sn = [2u8; 16];

        let from_server = derive_keys(
            &server,
            &PublicKey::from(&client),
            &cn,
            &sn,
            "cs_test",
        )
        .unwrap();
        let from_client = derive_keys(
            &client,
            &PublicKey::from(&server),
            &cn,
            &sn,
            "cs_test",
        )
        .unwrap();

        assert_eq!(from_server, from_client);
    }

    #[test]
    fn should_derive_different_keys_per_direction() {
        let keys = derive_keys(
            &secret(7),
            &PublicKey::from(&secret(9)),
            &[1u8; 16],
            &[2u8; 16],
            "cs_test",
        )
        .unwrap();
        assert_ne!(keys.client_to_server, keys.server_to_client);
    }

    #[test]
    fn should_bind_keys_to_the_session_id() {
        let args = (secret(7), PublicKey::from(&secret(9)), [1u8; 16], [2u8; 16]);
        let a = derive_keys(&args.0, &args.1, &args.2, &args.3, "cs_a").unwrap();
        let b = derive_keys(&args.0, &args.1, &args.2, &args.3, "cs_b").unwrap();
        assert_ne!(a.client_to_server, b.client_to_server);
    }

    #[test]
    fn should_bind_keys_to_both_nonces() {
        let server = secret(7);
        let client_public = PublicKey::from(&secret(9));
        let base = derive_keys(&server, &client_public, &[1u8; 16], &[2u8; 16], "cs_a").unwrap();
        let other_client_nonce =
            derive_keys(&server, &client_public, &[3u8; 16], &[2u8; 16], "cs_a").unwrap();
        let other_server_nonce =
            derive_keys(&server, &client_public, &[1u8; 16], &[4u8; 16], "cs_a").unwrap();

        assert_ne!(base.client_to_server, other_client_nonce.client_to_server);
        assert_ne!(base.client_to_server, other_server_nonce.client_to_server);
    }

    #[test]
    fn should_reject_a_low_order_public_key() {
        // The all-zero point is the canonical low-order case: every agreement
        // against it yields the same all-zero shared secret.
        let low_order = PublicKey::from([0u8; 32]);
        let error = derive_keys(&secret(7), &low_order, &[1u8; 16], &[2u8; 16], "cs_a")
            .unwrap_err();
        assert!(matches!(error, Owe1Error::LowOrderPoint));
    }

    #[test]
    fn should_never_print_keys() {
        let keys = derive_keys(
            &secret(7),
            &PublicKey::from(&secret(9)),
            &[1u8; 16],
            &[2u8; 16],
            "cs_a",
        )
        .unwrap();
        assert_eq!(format!("{keys:?}"), "SessionKeys([redacted])");
    }

    #[test]
    fn should_build_an_unambiguous_transcript() {
        let t = transcript(&[1u8; 32], &[2u8; 32], &[3u8; 16], &[4u8; 16], "cs_x", 100, 50);
        assert!(t.starts_with(TRANSCRIPT_LABEL));
        // label + 32 + 32 + 16 + 16 + len("cs_x") + "|100" + "|50"
        assert_eq!(t.len(), TRANSCRIPT_LABEL.len() + 96 + 4 + 4 + 3);

        // Changing any field changes the transcript, so a signature cannot be
        // reused across handshakes.
        assert_ne!(
            t,
            transcript(&[1u8; 32], &[2u8; 32], &[3u8; 16], &[4u8; 16], "cs_y", 100, 50)
        );
        assert_ne!(
            t,
            transcript(&[1u8; 32], &[2u8; 32], &[3u8; 16], &[4u8; 16], "cs_x", 101, 50)
        );
    }

    #[test]
    fn should_derive_a_stable_key_id() {
        let id = key_id(&[0u8; 32]);
        assert!(id.starts_with("k-"));
        assert_eq!(id.len(), 14);
        assert_eq!(id, key_id(&[0u8; 32]));
        assert_ne!(id, key_id(&[1u8; 32]));
    }

    #[test]
    fn should_reject_a_malformed_nonce() {
        // Right encoding, wrong length.
        let fifteen = encode(&[0u8; 15]);
        let error = decode_fixed::<16>(&fifteen, "client_nonce").unwrap_err();
        assert!(matches!(error, Owe1Error::MalformedField("client_nonce")));

        // Not base64url at all.
        let error = decode_fixed::<16>("not base64!!", "client_nonce").unwrap_err();
        assert!(matches!(error, Owe1Error::MalformedField("client_nonce")));
    }

    #[test]
    fn should_reject_a_public_key_of_the_wrong_length() {
        let error = decode_fixed::<32>(&encode(&[0u8; 31]), "client_public_key").unwrap_err();
        assert!(matches!(error, Owe1Error::MalformedField("client_public_key")));
    }

    #[test]
    fn should_mint_prefixed_session_ids() {
        let id = new_session_id();
        assert!(id.starts_with(SESSION_PREFIX));
        assert_ne!(id, new_session_id());
    }
}
