//! Passkeys and the ceremonies that make and use them (D110).
//!
//! A passkey belongs to a person, not to a workspace, so these rows are
//! filtered by `user_id` and `deleted_at IS NULL` rather than by a
//! workspace. The credential itself is stored as webauthn-rs serialises it;
//! this layer neither reads nor builds it.

use chrono::{DateTime, Utc};
use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PasskeyRow {
    pub id: String,
    pub user_id: String,
    pub credential: serde_json::Value,
    pub name: String,
    pub created_at: DateTime<Utc>,
    pub last_used_at: Option<DateTime<Utc>>,
}

// ---------------------------------------------------------------- passkeys

pub async fn list_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Vec<PasskeyRow>, sqlx::Error> {
    sqlx::query_as!(
        PasskeyRow,
        r#"SELECT id, user_id, credential, name, created_at, last_used_at
           FROM passkeys
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY created_at"#,
        user_id
    )
    .fetch_all(executor)
    .await
}

/// The live passkey a sign-in presented, by its credential ID.
pub async fn find_by_credential(
    executor: impl PgExecutor<'_>,
    credential_id: &str,
) -> Result<Option<PasskeyRow>, sqlx::Error> {
    sqlx::query_as!(
        PasskeyRow,
        r#"SELECT id, user_id, credential, name, created_at, last_used_at
           FROM passkeys
           WHERE credential_id = $1 AND deleted_at IS NULL"#,
        credential_id
    )
    .fetch_optional(executor)
    .await
}

/// Whether a credential ID was ever registered, removed ones included.
pub async fn credential_exists(
    executor: impl PgExecutor<'_>,
    credential_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM passkeys WHERE credential_id = $1) AS "exists!""#,
        credential_id
    )
    .fetch_one(executor)
    .await
}

pub async fn insert(
    executor: impl PgExecutor<'_>,
    id: &str,
    user_id: &str,
    credential_id: &str,
    credential: &serde_json::Value,
    name: &str,
) -> Result<PasskeyRow, sqlx::Error> {
    sqlx::query_as!(
        PasskeyRow,
        r#"INSERT INTO passkeys (id, user_id, credential_id, credential, name)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, user_id, credential, name, created_at, last_used_at"#,
        id,
        user_id,
        credential_id,
        credential,
        name
    )
    .fetch_one(executor)
    .await
}

/// Record a sign-in, with the credential as it now stands (its counter and
/// backup state move on each use).
pub async fn mark_used(
    executor: impl PgExecutor<'_>,
    id: &str,
    credential: &serde_json::Value,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE passkeys SET credential = $2, last_used_at = now()
           WHERE id = $1 AND deleted_at IS NULL"#,
        id,
        credential
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Soft delete one of the user's own passkeys. `None` when there is no
/// such live row for this user.
pub async fn soft_delete(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE passkeys SET deleted_at = now()
           WHERE id = $1 AND user_id = $2 AND deleted_at IS NULL
           RETURNING name"#,
        id,
        user_id
    )
    .fetch_optional(executor)
    .await
}

// -------------------------------------------------------------- ceremonies

pub async fn insert_ceremony(
    executor: impl PgExecutor<'_>,
    id: &str,
    user_id: Option<&str>,
    kind: &str,
    state: &serde_json::Value,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO passkey_ceremonies (id, user_id, kind, state, expires_at)
           VALUES ($1, $2, $3, $4, $5)"#,
        id,
        user_id,
        kind,
        state,
        expires_at
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Claim a ceremony once: unexpired, unused, of this kind and, for a
/// registration, started by this user. Marked used in the same statement,
/// so a replayed answer finds nothing.
pub async fn claim_ceremony(
    executor: impl PgExecutor<'_>,
    id: &str,
    kind: &str,
    user_id: Option<&str>,
) -> Result<Option<serde_json::Value>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE passkey_ceremonies SET used_at = now()
           WHERE id = $1
             AND kind = $2
             AND user_id IS NOT DISTINCT FROM $3
             AND used_at IS NULL
             AND expires_at > now()
           RETURNING state"#,
        id,
        kind,
        user_id
    )
    .fetch_optional(executor)
    .await
}
