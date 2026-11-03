//! OWE1: oewang envelope v1.
//!
//! Application-layer encryption for every request and response body on the
//! two service hops, on top of TLS (D22). Specified in
//! docs/api/encryption.md; this module is the executable copy of that
//! specification, and the shared test vectors exist so the Rust, Node and
//! Python implementations cannot drift from it.
//!
//! What this buys over TLS alone: a terminating intermediary sees ciphertext,
//! an accidentally captured body leaks nothing readable, tampering and status
//! swapping are detected, and a replayed request is rejected. What it does
//! not buy is listed in the doc, and the gaps are real.

pub mod aad;
pub mod handshake;
pub mod seal;

pub use handshake::{SessionKeys, VERSION};
pub use seal::SealedBody;

#[derive(Debug, thiserror::Error, PartialEq, Eq)]
pub enum Owe1Error {
    #[error("unsupported protocol version")]
    UnsupportedVersion,
    #[error("{0} is malformed")]
    MalformedField(&'static str),
    #[error("public key is low order")]
    LowOrderPoint,
    #[error("key derivation failed")]
    KeyDerivation,
    #[error("sealing failed")]
    SealFailed,
    #[error("decryption failed")]
    DecryptFailed,
    #[error("handshake signature did not verify")]
    SignatureInvalid,
}

impl From<Owe1Error> for crate::AppError {
    fn from(error: Owe1Error) -> Self {
        use Owe1Error::*;
        match error {
            UnsupportedVersion => crate::AppError::CryptoVersionUnsupported,
            // A malformed field and a low-order point are both "this request
            // is not a valid OWE1 message", which is what the catalog calls
            // CRYPTO_DECRYPT_FAILED.
            MalformedField(_) | LowOrderPoint | KeyDerivation | SealFailed | DecryptFailed
            | SignatureInvalid => crate::AppError::CryptoDecryptFailed,
        }
    }
}

/// Reject a version this build does not implement, before anything else.
pub fn check_version(version: u8) -> Result<(), Owe1Error> {
    if version == VERSION {
        Ok(())
    } else {
        Err(Owe1Error::UnsupportedVersion)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_accept_only_version_one() {
        assert!(check_version(1).is_ok());
        assert_eq!(check_version(0), Err(Owe1Error::UnsupportedVersion));
        assert_eq!(check_version(2), Err(Owe1Error::UnsupportedVersion));
        assert_eq!(check_version(255), Err(Owe1Error::UnsupportedVersion));
    }

    #[test]
    fn should_map_errors_onto_the_catalog() {
        assert_eq!(
            crate::AppError::from(Owe1Error::UnsupportedVersion).code(),
            "CRYPTO_VERSION_UNSUPPORTED"
        );
        assert_eq!(
            crate::AppError::from(Owe1Error::DecryptFailed).code(),
            "CRYPTO_DECRYPT_FAILED"
        );
        assert_eq!(
            crate::AppError::from(Owe1Error::LowOrderPoint).code(),
            "CRYPTO_DECRYPT_FAILED"
        );
    }
}
