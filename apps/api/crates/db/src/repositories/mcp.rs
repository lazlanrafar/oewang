//! MCP access: personal tokens and OAuth grants (D106).
//!
//! Tokens belong to a person, not to a workspace, so these reads are scoped
//! by `user_id` instead. Which workspaces a token may touch is
//! `workspace_ids`, checked against live memberships on every call by the
//! service, never here.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgExecutor;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct McpTokenRow {
    pub id: String,
    pub user_id: String,
    pub kind: String,
    pub name: String,
    pub client_id: Option<String>,
    pub token_prefix: String,
    /// None is every workspace the person belongs to.
    pub workspace_ids: Option<Vec<String>>,
    pub expires_at: Option<DateTime<Utc>>,
    pub last_used_at: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
}

pub struct NewToken<'a> {
    pub id: &'a str,
    pub user_id: &'a str,
    pub kind: &'a str,
    pub name: &'a str,
    pub client_id: Option<&'a str>,
    pub token_hash: &'a str,
    pub token_prefix: &'a str,
    pub refresh_hash: Option<&'a str>,
    pub family_id: Option<&'a str>,
    pub workspace_ids: Option<&'a [String]>,
    pub expires_at: Option<DateTime<Utc>>,
    pub refresh_expires_at: Option<DateTime<Utc>>,
}

pub async fn insert_token(
    executor: impl PgExecutor<'_>,
    token: NewToken<'_>,
) -> Result<McpTokenRow, sqlx::Error> {
    sqlx::query_as!(
        McpTokenRow,
        r#"INSERT INTO mcp_tokens
             (id, user_id, kind, name, client_id, token_hash, token_prefix, refresh_hash,
              family_id, workspace_ids, expires_at, refresh_expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
           RETURNING id, user_id, kind, name, client_id, token_prefix, workspace_ids,
                     expires_at, last_used_at, created_at"#,
        token.id,
        token.user_id,
        token.kind,
        token.name,
        token.client_id,
        token.token_hash,
        token.token_prefix,
        token.refresh_hash,
        token.family_id,
        token.workspace_ids,
        token.expires_at,
        token.refresh_expires_at
    )
    .fetch_one(executor)
    .await
}

/// A live token by its hash: not revoked and not expired.
pub async fn find_live(
    executor: impl PgExecutor<'_>,
    token_hash: &str,
) -> Result<Option<McpTokenRow>, sqlx::Error> {
    sqlx::query_as!(
        McpTokenRow,
        r#"SELECT id, user_id, kind, name, client_id, token_prefix, workspace_ids,
                  expires_at, last_used_at, created_at
           FROM mcp_tokens
           WHERE token_hash = $1 AND revoked_at IS NULL
             AND (expires_at IS NULL OR expires_at > now())"#,
        token_hash
    )
    .fetch_optional(executor)
    .await
}

/// Mark a token used. At most once a minute, so a busy client does not
/// write a row per call.
pub async fn touch(executor: impl PgExecutor<'_>, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE mcp_tokens SET last_used_at = now()
           WHERE id = $1 AND (last_used_at IS NULL OR last_used_at < now() - interval '1 minute')"#,
        id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// A person's live tokens of one kind, newest first. For OAuth, one row
/// per grant: the newest rotation of each family.
pub async fn list_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    kind: &str,
) -> Result<Vec<McpTokenRow>, sqlx::Error> {
    sqlx::query_as!(
        McpTokenRow,
        r#"SELECT DISTINCT ON (coalesce(family_id, id))
                  id, user_id, kind, name, client_id, token_prefix, workspace_ids,
                  expires_at, last_used_at, created_at
           FROM mcp_tokens
           WHERE user_id = $1 AND kind = $2 AND revoked_at IS NULL
             AND (kind = 'oauth' OR expires_at IS NULL OR expires_at > now())
           ORDER BY coalesce(family_id, id), created_at DESC"#,
        user_id,
        kind
    )
    .fetch_all(executor)
    .await
}

/// Revoke one of the person's tokens, and for an OAuth grant every
/// rotation of it. Returns how many rows ended.
pub async fn revoke(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE mcp_tokens SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL
             AND (id = $2 OR family_id = (SELECT family_id FROM mcp_tokens
                                          WHERE id = $2 AND user_id = $1))"#,
        user_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// End every token a person holds: a password change and "sign out
/// everywhere" reach MCP clients too.
pub async fn revoke_all_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE mcp_tokens SET revoked_at = now()
           WHERE user_id = $1 AND revoked_at IS NULL"#,
        user_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

// ------------------------------------------------------------------- OAuth

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OAuthClientRow {
    pub id: String,
    pub name: String,
    pub redirect_uris: Vec<String>,
    pub created_at: DateTime<Utc>,
}

pub async fn insert_client(
    executor: impl PgExecutor<'_>,
    id: &str,
    name: &str,
    redirect_uris: &[String],
) -> Result<OAuthClientRow, sqlx::Error> {
    sqlx::query_as!(
        OAuthClientRow,
        r#"INSERT INTO oauth_clients (id, name, redirect_uris) VALUES ($1, $2, $3)
           RETURNING id, name, redirect_uris, created_at"#,
        id,
        name,
        redirect_uris
    )
    .fetch_one(executor)
    .await
}

pub async fn find_client(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<OAuthClientRow>, sqlx::Error> {
    sqlx::query_as!(
        OAuthClientRow,
        r#"SELECT id, name, redirect_uris, created_at FROM oauth_clients WHERE id = $1"#,
        id
    )
    .fetch_optional(executor)
    .await
}

pub struct NewCode<'a> {
    pub code_hash: &'a str,
    pub client_id: &'a str,
    pub user_id: &'a str,
    pub workspace_ids: Option<&'a [String]>,
    pub redirect_uri: &'a str,
    pub code_challenge: &'a str,
    pub expires_at: DateTime<Utc>,
}

pub async fn insert_code(
    executor: impl PgExecutor<'_>,
    code: NewCode<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO oauth_codes
             (code_hash, client_id, user_id, workspace_ids, redirect_uri, code_challenge, expires_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)"#,
        code.code_hash,
        code.client_id,
        code.user_id,
        code.workspace_ids,
        code.redirect_uri,
        code.code_challenge,
        code.expires_at
    )
    .execute(executor)
    .await
    .map(|_| ())
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CodeRow {
    pub client_id: String,
    pub user_id: String,
    pub workspace_ids: Option<Vec<String>>,
    pub redirect_uri: String,
    pub code_challenge: String,
}

/// Spend a code: one statement, so two redemptions cannot both succeed.
pub async fn claim_code(
    executor: impl PgExecutor<'_>,
    code_hash: &str,
) -> Result<Option<CodeRow>, sqlx::Error> {
    sqlx::query_as!(
        CodeRow,
        r#"UPDATE oauth_codes SET used_at = now()
           WHERE code_hash = $1 AND used_at IS NULL AND expires_at > now()
           RETURNING client_id, user_id, workspace_ids, redirect_uri, code_challenge"#,
        code_hash
    )
    .fetch_optional(executor)
    .await
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RefreshRow {
    pub id: String,
    pub user_id: String,
    pub name: String,
    pub client_id: Option<String>,
    pub family_id: Option<String>,
    pub workspace_ids: Option<Vec<String>>,
    pub refresh_expires_at: Option<DateTime<Utc>>,
    pub revoked_at: Option<DateTime<Utc>>,
}

/// The grant a refresh token belongs to, locked, whether or not it is
/// still live: a revoked one being presented is a replay.
pub async fn lock_by_refresh(
    executor: impl PgExecutor<'_>,
    refresh_hash: &str,
) -> Result<Option<RefreshRow>, sqlx::Error> {
    sqlx::query_as!(
        RefreshRow,
        r#"SELECT id, user_id, name, client_id, family_id, workspace_ids, refresh_expires_at,
                  revoked_at
           FROM mcp_tokens WHERE refresh_hash = $1 AND kind = 'oauth'
           FOR UPDATE"#,
        refresh_hash
    )
    .fetch_optional(executor)
    .await
}

pub async fn revoke_id(executor: impl PgExecutor<'_>, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE mcp_tokens SET revoked_at = now() WHERE id = $1 AND revoked_at IS NULL"#,
        id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn revoke_family(
    executor: impl PgExecutor<'_>,
    family_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE mcp_tokens SET revoked_at = now()
           WHERE family_id = $1 AND revoked_at IS NULL"#,
        family_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
