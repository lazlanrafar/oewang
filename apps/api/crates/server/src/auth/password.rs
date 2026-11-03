//! Password hashing.
//!
//! Argon2id with the crate's recommended interactive parameters. Hashing is
//! CPU-bound by design, so every call runs on a blocking thread rather than
//! stalling the async runtime.

use argon2::{
    password_hash::{rand_core::OsRng, PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use oewang_domain::{AppError, Result};

/// A hash of a password nobody has. Verified against when the email is
/// unknown, so an unknown address and a wrong password take comparable time
/// and cannot be told apart (AUTH-5).
const DUMMY_HASH: &str = "$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHR2YWx1ZQ$\
                          jVYbNGNtHHe2nmHUMKAOZw9zY9vZpQqGpHdJqE8Dxzo";

pub async fn hash(password: String) -> Result<String> {
    tokio::task::spawn_blocking(move || {
        let salt = SaltString::generate(&mut OsRng);
        Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map(|hash| hash.to_string())
            .map_err(|error| AppError::Internal(anyhow::anyhow!("hashing failed: {error}")))
    })
    .await
    .map_err(|error| AppError::Internal(anyhow::anyhow!("hash task failed: {error}")))?
}

/// Verify a password against a stored hash.
///
/// Returns false rather than an error on a malformed stored hash: a corrupt
/// row must not let anyone in, and it must not leak that the row is corrupt.
pub async fn verify(password: String, stored_hash: String) -> bool {
    tokio::task::spawn_blocking(move || {
        let Ok(parsed) = PasswordHash::new(&stored_hash) else {
            return false;
        };
        Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok()
    })
    .await
    .unwrap_or(false)
}

/// Spend the same work as a real verification when the email is unknown.
pub async fn verify_dummy(password: String) {
    let _ = verify(password, DUMMY_HASH.to_string()).await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn should_verify_the_password_it_hashed() {
        let hashed = hash("correct horse battery".into()).await.unwrap();
        assert!(verify("correct horse battery".into(), hashed).await);
    }

    #[tokio::test]
    async fn should_reject_a_wrong_password() {
        let hashed = hash("correct horse battery".into()).await.unwrap();
        assert!(!verify("wrong horse battery".into(), hashed).await);
    }

    #[tokio::test]
    async fn should_salt_every_hash() {
        let a = hash("same password".into()).await.unwrap();
        let b = hash("same password".into()).await.unwrap();
        assert_ne!(a, b, "two hashes of one password must differ");
        assert!(verify("same password".into(), a).await);
        assert!(verify("same password".into(), b).await);
    }

    #[tokio::test]
    async fn should_produce_an_argon2id_hash() {
        let hashed = hash("whatever".into()).await.unwrap();
        assert!(hashed.starts_with("$argon2id$"), "{hashed}");
    }

    #[tokio::test]
    async fn should_refuse_rather_than_error_on_a_corrupt_hash() {
        assert!(!verify("anything".into(), "not-a-hash".into()).await);
        assert!(!verify("anything".into(), String::new()).await);
    }

    #[tokio::test]
    async fn should_verify_the_dummy_hash_without_panicking() {
        // The unknown-email path must cost the same work, not blow up.
        verify_dummy("anything".into()).await;
    }
}

#[cfg(test)]
mod seed_tests {
    use super::*;

    /// The development seed's password must actually work.
    ///
    /// It did not. The hash in `seeds/dev.sql` was a plausible-looking
    /// Argon2id string that verified against nothing, so every attempt to
    /// sign in as the demo user answered `INVALID_CREDENTIALS` and looked
    /// like a typo. Nothing noticed, because nothing checked: the seed is
    /// data and data is not compiled. This test compiles it.
    #[tokio::test]
    async fn should_let_the_seeded_user_sign_in() {
        let seed = include_str!("../../../../seeds/dev.sql");

        let password = seed
            .lines()
            .find_map(|line| line.split("is \"").nth(1)?.split('"').next())
            .expect("the seed states the demo password in a comment");

        let stored = seed
            .lines()
            .find_map(|line| line.trim().strip_prefix("'$argon2id$"))
            .map(|rest| format!("$argon2id${}", rest.trim_end_matches(['\'', ','])))
            .expect("the seed carries an argon2id hash");

        assert!(
            verify(password.to_string(), stored).await,
            "the seeded password does not verify against the seeded hash"
        );
    }
}
