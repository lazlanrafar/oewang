//! Access tokens and refresh tokens.
//!
//! Two different things, deliberately. The access token is a short-lived JWT
//! the API can check without a database read. The refresh token is a long-
//! lived opaque secret that proves nothing on its own: the server looks it
//! up, which is what makes revocation and reuse detection possible at all.
//!
//! See docs/security/auth.md#the-token.

use chrono::Utc;
use jsonwebtoken::{decode, encode, Algorithm, DecodingKey, EncodingKey, Header, Validation};
use oewang_domain::{AppError, Result, Role, Secret};
use rand::RngCore;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};

/// Length of the raw refresh token, before encoding.
const REFRESH_TOKEN_BYTES: usize = 32;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    /// User id.
    pub sub: String,
    /// The workspace this token is scoped to.
    pub wid: String,
    /// The user's role in that workspace, copied at issue time.
    pub role: Role,
    pub iat: i64,
    pub exp: i64,
    /// Token id, logged on issue so a session can be traced.
    pub jti: String,
}

pub struct AccessToken {
    pub token: String,
    pub expires_at: i64,
}

pub fn issue_access_token(
    secret: &Secret,
    user_id: &str,
    workspace_id: &str,
    role: Role,
    ttl: std::time::Duration,
) -> Result<AccessToken> {
    let now = Utc::now().timestamp();
    let expires_at = now + ttl.as_secs() as i64;

    let claims = Claims {
        sub: user_id.to_string(),
        wid: workspace_id.to_string(),
        role,
        iat: now,
        exp: expires_at,
        jti: cuid2::create_id(),
    };

    let token = encode(
        &Header::new(Algorithm::HS256),
        &claims,
        &EncodingKey::from_secret(secret.expose().as_bytes()),
    )
    .map_err(|error| AppError::Internal(anyhow::anyhow!("token encode failed: {error}")))?;

    Ok(AccessToken { token, expires_at })
}

/// Verify signature and expiry. Every failure is the same answer: a client
/// must not learn whether a token was forged, expired or malformed.
pub fn verify_access_token(secret: &Secret, token: &str) -> Result<Claims> {
    let mut validation = Validation::new(Algorithm::HS256);
    validation.validate_exp = true;
    // No leeway. A 15 minute token does not need a grace period, and leeway
    // only widens the window a stolen one stays usable.
    validation.leeway = 0;

    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.expose().as_bytes()),
        &validation,
    )
    .map(|data| data.claims)
    .map_err(|_| AppError::Unauthenticated)
}

/// A refresh token: the raw value goes to the client once, the hash goes to
/// the database. A database leak yields no usable token (AUTH-8).
pub struct RefreshToken {
    pub raw: String,
    pub hash: String,
}

pub fn issue_refresh_token() -> RefreshToken {
    let mut bytes = [0u8; REFRESH_TOKEN_BYTES];
    rand::thread_rng().fill_bytes(&mut bytes);

    let raw = base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, bytes);
    let hash = hash_token(&raw);

    RefreshToken { raw, hash }
}

/// SHA-256, not a password hash.
///
/// This is a 256-bit random value, not something a human chose: it has no
/// guessable structure, so there is nothing for a slow hash to defend
/// against, and a lookup happens on every refresh.
pub fn hash_token(raw: &str) -> String {
    let digest = Sha256::digest(raw.as_bytes());
    base64::Engine::encode(&base64::engine::general_purpose::URL_SAFE_NO_PAD, digest)
}

/// One login's worth of tokens share a family, so reuse can revoke all of
/// them rather than only the one that was replayed.
pub fn new_family_id() -> String {
    cuid2::create_id()
}

#[cfg(test)]
mod tests {
    use std::time::Duration;

    use super::*;

    fn secret() -> Secret {
        Secret::new("a-test-signing-secret-at-least-32-characters-long")
    }

    #[test]
    fn should_round_trip_claims() {
        let issued = issue_access_token(
            &secret(),
            "user_1",
            "wsp_1",
            Role::Admin,
            Duration::from_secs(900),
        )
        .unwrap();
        let claims = verify_access_token(&secret(), &issued.token).unwrap();

        assert_eq!(claims.sub, "user_1");
        assert_eq!(claims.wid, "wsp_1");
        assert_eq!(claims.role, Role::Admin);
        assert_eq!(claims.exp, issued.expires_at);
    }

    #[test]
    fn should_reject_a_token_signed_with_another_secret() {
        let issued = issue_access_token(
            &secret(),
            "user_1",
            "wsp_1",
            Role::Admin,
            Duration::from_secs(900),
        )
        .unwrap();
        let other = Secret::new("a-different-secret-also-at-least-32-characters");

        let error = verify_access_token(&other, &issued.token).unwrap_err();
        assert_eq!(error.code(), "UNAUTHENTICATED");
    }

    #[test]
    fn should_reject_an_expired_token() {
        // Zero TTL expires at the moment of issue, with no leeway to save it.
        let issued = issue_access_token(
            &secret(),
            "user_1",
            "wsp_1",
            Role::Member,
            Duration::from_secs(0),
        )
        .unwrap();
        std::thread::sleep(Duration::from_millis(1100));

        assert_eq!(
            verify_access_token(&secret(), &issued.token)
                .unwrap_err()
                .code(),
            "UNAUTHENTICATED"
        );
    }

    #[test]
    fn should_reject_a_tampered_token() {
        let issued = issue_access_token(
            &secret(),
            "user_1",
            "wsp_1",
            Role::Member,
            Duration::from_secs(900),
        )
        .unwrap();

        // Flip a character in the payload segment.
        let mut parts: Vec<String> = issued.token.split('.').map(str::to_string).collect();
        let payload: Vec<char> = parts[1].chars().collect();
        parts[1] = payload
            .iter()
            .enumerate()
            .map(|(i, c)| {
                if i == 2 {
                    if *c == 'A' {
                        'B'
                    } else {
                        'A'
                    }
                } else {
                    *c
                }
            })
            .collect();

        assert!(verify_access_token(&secret(), &parts.join(".")).is_err());
    }

    #[test]
    fn should_reject_garbage() {
        for token in ["", "not.a.token", "a.b", "..."] {
            assert!(verify_access_token(&secret(), token).is_err(), "{token}");
        }
    }

    #[test]
    fn should_give_each_token_its_own_id() {
        let a =
            issue_access_token(&secret(), "u", "w", Role::Owner, Duration::from_secs(900)).unwrap();
        let b =
            issue_access_token(&secret(), "u", "w", Role::Owner, Duration::from_secs(900)).unwrap();

        let a_jti = verify_access_token(&secret(), &a.token).unwrap().jti;
        let b_jti = verify_access_token(&secret(), &b.token).unwrap().jti;
        assert_ne!(a_jti, b_jti);
    }

    #[test]
    fn should_mint_unpredictable_refresh_tokens() {
        let a = issue_refresh_token();
        let b = issue_refresh_token();

        assert_ne!(a.raw, b.raw);
        assert_ne!(a.hash, b.hash);
        // 32 bytes in base64url without padding.
        assert_eq!(a.raw.len(), 43);
    }

    #[test]
    fn should_hash_a_refresh_token_deterministically() {
        let token = issue_refresh_token();
        assert_eq!(hash_token(&token.raw), token.hash);
        assert_ne!(hash_token("other"), token.hash);
        // The stored value must not be the token itself.
        assert_ne!(token.hash, token.raw);
    }

    #[test]
    fn should_mint_distinct_families() {
        assert_ne!(new_family_id(), new_family_id());
    }
}
