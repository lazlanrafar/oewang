//! The long-term Ed25519 signing key.
//!
//! Clients pin the public key and verify every handshake against it. A client
//! that cannot verify stops; it never falls back to plaintext. See
//! docs/api/encryption.md#server-signing-keys.

use std::{fs, io::Write, path::Path};

use rand::RngCore;

use ed25519_dalek::{
    pkcs8::{DecodePrivateKey, EncodePrivateKey},
    Signer, SigningKey,
};
use oewang_domain::owe1::handshake;

pub struct Owe1Signer {
    key: SigningKey,
    key_id: String,
}

impl std::fmt::Debug for Owe1Signer {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The private half never prints (OPS-3).
        f.debug_struct("Owe1Signer").field("key_id", &self.key_id).finish()
    }
}

#[derive(Debug, thiserror::Error)]
pub enum SignerError {
    #[error("reading {path}: {source}")]
    Read { path: String, source: std::io::Error },
    #[error("writing {path}: {source}")]
    Write { path: String, source: std::io::Error },
    #[error("{path} is not a valid PKCS#8 Ed25519 private key")]
    Malformed { path: String },
    #[error("refusing to create a signing key outside development; mount {path} from the secret store")]
    RefusedToCreate { path: String },
}

impl Owe1Signer {
    /// Load the key, creating it on first start in development only.
    ///
    /// Generating a key automatically in production would silently invalidate
    /// every pinned client on a fresh deployment, so that path refuses.
    pub fn load_or_create(path: &Path, allow_create: bool) -> Result<Self, SignerError> {
        let display = path.display().to_string();

        if path.exists() {
            let pem = fs::read_to_string(path).map_err(|source| SignerError::Read {
                path: display.clone(),
                source,
            })?;
            let key = SigningKey::from_pkcs8_pem(&pem)
                .map_err(|_| SignerError::Malformed { path: display })?;
            return Ok(Self::from_key(key));
        }

        if !allow_create {
            return Err(SignerError::RefusedToCreate { path: display });
        }

        // Built from CSPRNG bytes rather than SigningKey::generate, which
        // would pull in ed25519-dalek's rand_core feature and tie this crate
        // to that crate's rand_core version.
        let mut seed = [0u8; 32];
        rand::rngs::OsRng.fill_bytes(&mut seed);
        let key = SigningKey::from_bytes(&seed);
        let pem = key
            .to_pkcs8_pem(ed25519_dalek::pkcs8::spki::der::pem::LineEnding::LF)
            .map_err(|_| SignerError::Malformed { path: display.clone() })?;

        if let Some(parent) = path.parent() {
            fs::create_dir_all(parent).map_err(|source| SignerError::Write {
                path: display.clone(),
                source,
            })?;
        }

        write_private(path, pem.as_bytes()).map_err(|source| SignerError::Write {
            path: display,
            source,
        })?;

        Ok(Self::from_key(key))
    }

    fn from_key(key: SigningKey) -> Self {
        let public = key.verifying_key().to_bytes();
        Self { key_id: handshake::key_id(&public), key }
    }

    pub fn key_id(&self) -> &str {
        &self.key_id
    }

    pub fn public_key(&self) -> [u8; 32] {
        self.key.verifying_key().to_bytes()
    }

    pub fn sign(&self, transcript: &[u8]) -> [u8; 64] {
        self.key.sign(transcript).to_bytes()
    }
}

/// Create with mode 0600 from the start, rather than writing then chmod,
/// so the key is never briefly world-readable.
fn write_private(path: &Path, bytes: &[u8]) -> std::io::Result<()> {
    let mut options = fs::OpenOptions::new();
    options.write(true).create_new(true);

    #[cfg(unix)]
    {
        use std::os::unix::fs::OpenOptionsExt;
        options.mode(0o600);
    }

    let mut file = options.open(path)?;
    file.write_all(bytes)?;
    file.sync_all()
}

#[cfg(test)]
mod tests {
    use ed25519_dalek::{Verifier, VerifyingKey};

    use super::*;

    fn temp_path(name: &str) -> std::path::PathBuf {
        let mut path = std::env::temp_dir();
        path.push(format!("owe1-{}-{}.pem", name, cuid2::create_id()));
        path
    }

    #[test]
    fn should_create_then_reload_the_same_key() {
        let path = temp_path("create");

        let first = Owe1Signer::load_or_create(&path, true).unwrap();
        let second = Owe1Signer::load_or_create(&path, true).unwrap();

        assert_eq!(first.public_key(), second.public_key());
        assert_eq!(first.key_id(), second.key_id());

        fs::remove_file(&path).ok();
    }

    #[cfg(unix)]
    #[test]
    fn should_create_the_key_file_unreadable_by_others() {
        use std::os::unix::fs::PermissionsExt;

        let path = temp_path("mode");
        Owe1Signer::load_or_create(&path, true).unwrap();

        let mode = fs::metadata(&path).unwrap().permissions().mode() & 0o777;
        assert_eq!(mode, 0o600, "signing key must not be readable by others");

        fs::remove_file(&path).ok();
    }

    #[test]
    fn should_refuse_to_create_outside_development() {
        let path = temp_path("refuse");
        let error = Owe1Signer::load_or_create(&path, false).unwrap_err();
        assert!(matches!(error, SignerError::RefusedToCreate { .. }));
        assert!(!path.exists());
    }

    #[test]
    fn should_reject_a_malformed_key_file() {
        let path = temp_path("malformed");
        fs::write(&path, b"this is not a key").unwrap();

        let error = Owe1Signer::load_or_create(&path, true).unwrap_err();
        assert!(matches!(error, SignerError::Malformed { .. }));

        fs::remove_file(&path).ok();
    }

    #[test]
    fn should_produce_a_signature_a_pinned_client_can_verify() {
        let path = temp_path("sign");
        let signer = Owe1Signer::load_or_create(&path, true).unwrap();

        let transcript = b"oewang/owe1/handshake|example";
        let signature = signer.sign(transcript);

        let verifying = VerifyingKey::from_bytes(&signer.public_key()).unwrap();
        assert!(verifying
            .verify(transcript, &ed25519_dalek::Signature::from_bytes(&signature))
            .is_ok());

        // A different transcript must not verify against the same signature.
        assert!(verifying
            .verify(b"something else", &ed25519_dalek::Signature::from_bytes(&signature))
            .is_err());

        fs::remove_file(&path).ok();
    }

    #[test]
    fn should_not_print_the_private_key() {
        let path = temp_path("debug");
        let signer = Owe1Signer::load_or_create(&path, true).unwrap();
        let printed = format!("{signer:?}");
        assert!(printed.contains("key_id"));
        assert!(!printed.contains("SigningKey"));
        fs::remove_file(&path).ok();
    }
}
