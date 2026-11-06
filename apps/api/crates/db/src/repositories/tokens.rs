//! Refresh tokens, password reset tokens and workspace invitations.
//!
//! All three are the same shape: a secret the client holds, a hash the
//! database holds, and a lifecycle with a single terminal state.

use chrono::{DateTime, Utc};
use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RefreshTokenRow {
    pub id: String,
    pub user_id: String,
    /// `None` for a session opened before the user had a workspace (D109).
    pub workspace_id: Option<String>,
    pub family_id: String,
    pub expires_at: DateTime<Utc>,
    pub used_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SessionRow {
    pub id: String,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub created_at: DateTime<Utc>,
    pub expires_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct InvitationRow {
    pub id: String,
    pub workspace_id: String,
    pub email: String,
    pub role: String,
    pub expires_at: DateTime<Utc>,
    pub accepted_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

// --------------------------------------------------------- refresh tokens

#[allow(clippy::too_many_arguments)]
pub async fn insert_refresh_token(
    executor: impl PgExecutor<'_>,
    id: &str,
    user_id: &str,
    workspace_id: Option<&str>,
    token_hash: &str,
    family_id: &str,
    expires_at: DateTime<Utc>,
    user_agent: Option<&str>,
    ip: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO refresh_tokens
             (id, user_id, workspace_id, token_hash, family_id, expires_at, user_agent, ip)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)"#,
        id,
        user_id,
        workspace_id,
        token_hash,
        family_id,
        expires_at,
        user_agent,
        ip
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Look a token up by hash, locking the row.
///
/// The lock is what makes reuse detection correct under concurrency: two
/// simultaneous refreshes with the same token serialize here, so exactly one
/// of them sees `used_at` as null.
pub async fn lock_refresh_token(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<Option<RefreshTokenRow>, sqlx::Error> {
    sqlx::query_as!(
        RefreshTokenRow,
        r#"SELECT id, user_id, workspace_id, family_id, expires_at, used_at, revoked_at
           FROM refresh_tokens
           WHERE token_hash = $1
           FOR UPDATE"#,
        token_hash
    )
    .fetch_optional(executor)
    .await
}

pub async fn mark_refresh_token_used(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET used_at = now() WHERE id = $1"#,
        id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Revoke every token descended from one login.
///
/// The response to a replayed token: the attacker's copy and the user's copy
/// are indistinguishable, so both stop working and the user signs in again.
pub async fn revoke_family(
    executor: impl PgExecutor<'_>,
    family_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET revoked_at = now()
           WHERE family_id = $1 AND revoked_at IS NULL"#,
        family_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn revoke_by_hash(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET revoked_at = now()
           WHERE token_hash = $1 AND revoked_at IS NULL"#,
        token_hash
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Used by logout-everywhere, and by any password change or reset.
pub async fn revoke_all_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE refresh_tokens SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL"#,
        user_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn list_sessions(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Vec<SessionRow>, sqlx::Error> {
    sqlx::query_as!(
        SessionRow,
        r#"SELECT id, user_agent, ip, created_at, expires_at
           FROM refresh_tokens
           WHERE user_id = $1
             AND revoked_at IS NULL
             AND used_at IS NULL
             AND expires_at > now()
           ORDER BY created_at DESC"#,
        user_id
    )
    .fetch_all(executor)
    .await
}

// ---------------------------------------------------- password reset tokens

pub async fn insert_reset_token(
    executor: impl PgExecutor<'_>,
    id: &str,
    user_id: &str,
    token_hash: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO password_reset_tokens (id, user_id, token_hash, expires_at)
           VALUES ($1, $2, $3, $4)"#,
        id,
        user_id,
        token_hash,
        expires_at
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Claim a reset token: valid, unexpired and unused, marked used in the same
/// statement so it cannot be redeemed twice even concurrently.
pub async fn claim_reset_token(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"UPDATE password_reset_tokens
           SET used_at = now()
           WHERE token_hash = $1 AND used_at IS NULL AND expires_at > now()
           RETURNING user_id"#,
        token_hash
    )
    .fetch_optional(executor)
    .await
}

// -------------------------------------------------------------- invitations

#[allow(clippy::too_many_arguments)]
pub async fn insert_invitation(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    email: &str,
    role: &str,
    token_hash: &str,
    invited_by: &str,
    expires_at: DateTime<Utc>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO workspace_invitations
             (id, workspace_id, email, role, token, invited_by, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        id,
        workspace_id,
        email,
        role,
        token_hash,
        invited_by,
        expires_at
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn list_pending_invitations(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<InvitationRow>, sqlx::Error> {
    sqlx::query_as!(
        InvitationRow,
        r#"SELECT id, workspace_id, email, role, expires_at, accepted_at, created_at
           FROM workspace_invitations
           WHERE workspace_id = $1 AND deleted_at IS NULL AND accepted_at IS NULL
           ORDER BY created_at DESC"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn claim_invitation(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<Option<InvitationRow>, sqlx::Error> {
    sqlx::query_as!(
        InvitationRow,
        r#"UPDATE workspace_invitations
           SET accepted_at = now()
           WHERE token = $1
             AND accepted_at IS NULL
             AND deleted_at IS NULL
             AND expires_at > now()
           RETURNING id, workspace_id, email, role, expires_at, accepted_at, created_at"#,
        token_hash
    )
    .fetch_optional(executor)
    .await
}

pub async fn soft_delete_invitation(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspace_invitations SET deleted_at = now()
           WHERE id = $1 AND workspace_id = $2 AND deleted_at IS NULL"#,
        id,
        workspace_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Retire any pending invitation for this email, so inviting again replaces
/// the old link rather than leaving two live ones.
pub async fn soft_delete_pending_for_email(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    email: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspace_invitations SET deleted_at = now()
           WHERE workspace_id = $1 AND lower(email) = lower($2)
             AND accepted_at IS NULL AND deleted_at IS NULL"#,
        workspace_id,
        email
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
