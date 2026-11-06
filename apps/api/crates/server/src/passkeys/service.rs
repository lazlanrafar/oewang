//! Passkeys: adding one, removing one, and signing in with one (D110).
//!
//! Each ceremony is two requests. The first hands the browser a challenge
//! and keeps the server half in `passkey_ceremonies`; the second claims that
//! row once and checks the browser's answer against it. webauthn-rs does the
//! cryptography; this module decides whose passkey it is.
//!
//! See docs/security/auth.md#passkeys.

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use chrono::{Duration, Utc};
use oewang_db::{
    repositories::{accounts, passkeys},
    PgPool,
};
use oewang_domain::{AppError, Result};
use serde_json::Value;
use sha2::{Digest, Sha256};
use webauthn_rs::prelude::{
    DiscoverableAuthentication, Passkey, PasskeyRegistration, PublicKeyCredential,
    RegisterPublicKeyCredential, Url, Uuid, Webauthn, WebauthnBuilder,
};

use crate::{
    audit::{log, Actor},
    auth::service::{sign_in, IssuedSession, SessionContext},
};

/// How long a ceremony may take, start to finish. The browser's own prompt
/// times out at five minutes; this matches it.
const CEREMONY_MINUTES: i64 = 5;

/// How many live passkeys one person may hold. A ceiling on what a script
/// can add, well above what a person carries.
const MAX_PASSKEYS: usize = 20;

/// At most this many characters in a passkey's name.
const MAX_NAME_CHARS: usize = 80;

const KIND_REGISTER: &str = "register";
const KIND_AUTHENTICATE: &str = "authenticate";

/// The relying party: the app's own origin, which is the only page that
/// runs a ceremony. The API is never on the browser's path (D5), so its own
/// address plays no part.
pub fn relying_party(app_url: &str) -> anyhow::Result<Webauthn> {
    let origin = Url::parse(app_url)?;
    let rp_id = origin
        .host_str()
        .ok_or_else(|| anyhow::anyhow!("APP_URL has no host"))?
        .to_string();

    Ok(WebauthnBuilder::new(&rp_id, &origin)?
        .rp_name("oewang")
        .build()?)
}

/// The user handle stored on the authenticator.
///
/// Derived from the user ID rather than stored, and hashed so the
/// authenticator holds nothing that names the account. Stable, so a second
/// passkey made on the same device replaces the first rather than sitting
/// beside it.
pub fn user_handle(user_id: &str) -> Uuid {
    let digest = Sha256::digest(user_id.as_bytes());
    let mut bytes = [0u8; 16];
    bytes.copy_from_slice(&digest[..16]);
    Uuid::from_bytes(bytes)
}

// ------------------------------------------------------------ the list

pub async fn list(pool: &PgPool, user_id: &str) -> Result<Vec<passkeys::PasskeyRow>> {
    passkeys::list_for_user(pool, user_id)
        .await
        .map_err(internal)
}

/// Remove one of the caller's own passkeys. Another person's, or one
/// already removed, is not found.
pub async fn remove(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let name = passkeys::soft_delete(&mut *tx, actor.user_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    log(
        &mut tx,
        actor,
        "passkey.removed",
        "passkey",
        id,
        Some(serde_json::json!({ "name": name })),
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

// -------------------------------------------------------- registration

/// A ceremony the browser is to run, and the ID that finishes it.
pub struct Started {
    pub ceremony_id: String,
    /// `PublicKeyCredentialCreationOptions` or `...RequestOptions`, in the
    /// JSON form `navigator.credentials` takes once decoded.
    pub options: Value,
}

/// Begin adding a passkey for the signed-in user.
pub async fn start_registration(
    pool: &PgPool,
    webauthn: &Webauthn,
    user_id: &str,
) -> Result<Started> {
    let user = accounts::find_user_by_id(pool, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;

    let existing = live_passkeys(pool, user_id).await?;
    if existing.len() >= MAX_PASSKEYS {
        return Err(AppError::validation([(
            "passkey",
            "Remove a passkey before adding another.",
        )]));
    }
    // The authenticator refuses to make a second passkey where it already
    // holds one for this account, rather than making a duplicate.
    let exclude = existing.iter().map(|key| key.cred_id().clone()).collect();

    let display_name = user.name.as_deref().unwrap_or(&user.email);
    let (challenge, state) = webauthn
        .start_passkey_registration(
            user_handle(user_id),
            &user.email,
            display_name,
            Some(exclude),
        )
        .map_err(webauthn_internal)?;

    let mut options = serde_json::to_value(challenge.public_key).map_err(json_internal)?;
    require_discoverable(&mut options);

    let ceremony_id = cuid2::create_id();
    passkeys::insert_ceremony(
        pool,
        &ceremony_id,
        Some(user_id),
        KIND_REGISTER,
        &serde_json::to_value(&state).map_err(json_internal)?,
        Utc::now() + Duration::minutes(CEREMONY_MINUTES),
    )
    .await
    .map_err(internal)?;

    Ok(Started {
        ceremony_id,
        options,
    })
}

/// Check the authenticator's answer and keep the passkey it made.
pub async fn finish_registration(
    pool: &PgPool,
    webauthn: &Webauthn,
    actor: Actor<'_>,
    ceremony_id: &str,
    name: Option<&str>,
    credential: &RegisterPublicKeyCredential,
) -> Result<passkeys::PasskeyRow> {
    let name = name
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .unwrap_or("Passkey");
    if name.chars().count() > MAX_NAME_CHARS {
        return Err(AppError::validation([(
            "name",
            "A name can be at most 80 characters.",
        )]));
    }

    // Claimed before anything is checked, and outside the transaction
    // below, so a failed answer still uses the challenge up.
    let state = passkeys::claim_ceremony(pool, ceremony_id, KIND_REGISTER, Some(actor.user_id))
        .await
        .map_err(internal)?
        .ok_or_else(ceremony_expired)?;
    let state: PasskeyRegistration = serde_json::from_value(state).map_err(json_internal)?;

    let passkey = webauthn
        .finish_passkey_registration(credential, &state)
        .map_err(|_| {
            AppError::validation([("passkey", "The passkey could not be verified. Try again.")])
        })?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let credential_id = URL_SAFE_NO_PAD.encode(passkey.cred_id());
    // A credential belongs to one account for good (webauthn-rs requires
    // this check): one registered twice would let its holder pick which
    // account to sign in to.
    if passkeys::credential_exists(&mut *tx, &credential_id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::validation([(
            "passkey",
            "This passkey is already registered.",
        )]));
    }

    let row = passkeys::insert(
        &mut *tx,
        &cuid2::create_id(),
        actor.user_id,
        &credential_id,
        &serde_json::to_value(&passkey).map_err(json_internal)?,
        name,
    )
    .await
    .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "passkey.added",
        "passkey",
        &row.id,
        None,
        Some(serde_json::json!({ "name": row.name })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(row)
}

// -------------------------------------------------------------- sign in

/// Begin a sign-in that asks the browser for any passkey it holds for this
/// site. Nobody is known yet: the passkey says who it belongs to.
pub async fn start_sign_in(pool: &PgPool, webauthn: &Webauthn) -> Result<Started> {
    let (challenge, state) = webauthn
        .start_discoverable_authentication()
        .map_err(webauthn_internal)?;

    let ceremony_id = cuid2::create_id();
    passkeys::insert_ceremony(
        pool,
        &ceremony_id,
        None,
        KIND_AUTHENTICATE,
        &serde_json::to_value(&state).map_err(json_internal)?,
        Utc::now() + Duration::minutes(CEREMONY_MINUTES),
    )
    .await
    .map_err(internal)?;

    Ok(Started {
        ceremony_id,
        // Only the request options: the library also marks the challenge
        // for autofill ("conditional") mediation, and this one is asked for
        // by a button, as an ordinary prompt.
        options: serde_json::to_value(challenge.public_key).map_err(json_internal)?,
    })
}

/// Check a signed challenge and open a session for the passkey's owner.
///
/// Every failure answers `INVALID_CREDENTIALS`, as a wrong password does:
/// which check refused says nothing a caller needs, and some of it would
/// say whether a credential is registered.
pub async fn finish_sign_in(
    pool: &PgPool,
    webauthn: &Webauthn,
    ceremony_id: &str,
    credential: &PublicKeyCredential,
    session: SessionContext<'_>,
) -> Result<IssuedSession> {
    let state = passkeys::claim_ceremony(pool, ceremony_id, KIND_AUTHENTICATE, None)
        .await
        .map_err(internal)?
        .ok_or(AppError::InvalidCredentials)?;
    let state: DiscoverableAuthentication = serde_json::from_value(state).map_err(json_internal)?;

    let (handle, credential_id) = webauthn
        .identify_discoverable_authentication(credential)
        .map_err(|_| AppError::InvalidCredentials)?;

    let row = passkeys::find_by_credential(pool, &URL_SAFE_NO_PAD.encode(credential_id))
        .await
        .map_err(internal)?
        .ok_or(AppError::InvalidCredentials)?;

    // The handle the authenticator returned must be the one this row's
    // owner was registered with, or the credential is not theirs.
    if handle != user_handle(&row.user_id) {
        return Err(AppError::InvalidCredentials);
    }

    let mut passkey: Passkey =
        serde_json::from_value(row.credential.clone()).map_err(json_internal)?;

    // Verifies the signature, user verification and the signature counter.
    let result = webauthn
        .finish_discoverable_authentication_v2(credential, state, &passkey)
        .map_err(|_| AppError::InvalidCredentials)?;

    passkey.update_credential(&result);
    passkeys::mark_used(
        pool,
        &row.id,
        &serde_json::to_value(&passkey).map_err(json_internal)?,
    )
    .await
    .map_err(internal)?;

    sign_in(pool, &row.user_id, session).await
}

// ----------------------------------------------------------- internals

async fn live_passkeys(pool: &PgPool, user_id: &str) -> Result<Vec<Passkey>> {
    passkeys::list_for_user(pool, user_id)
        .await
        .map_err(internal)?
        .into_iter()
        .map(|row| serde_json::from_value(row.credential).map_err(json_internal))
        .collect()
}

/// Ask for a discoverable credential, one the authenticator can offer
/// without being told the account first.
///
/// webauthn-rs leaves this "discouraged" for passkeys, so that security
/// keys with little storage are not filled up. Sign-in here starts with no
/// email address, so a credential the authenticator cannot discover could
/// never be used.
fn require_discoverable(options: &mut Value) {
    if let Some(selection) = options
        .get_mut("authenticatorSelection")
        .and_then(Value::as_object_mut)
    {
        selection.insert("residentKey".into(), Value::from("required"));
        selection.insert("requireResidentKey".into(), Value::from(true));
    }
}

fn ceremony_expired() -> AppError {
    AppError::validation([("passkey", "That took too long. Try again.")])
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

fn json_internal(error: serde_json::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

fn webauthn_internal(error: webauthn_rs::prelude::WebauthnError) -> AppError {
    AppError::Internal(anyhow::anyhow!("webauthn: {error}"))
}
