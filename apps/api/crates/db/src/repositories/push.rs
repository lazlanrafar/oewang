//! Devices to push to, and the budget thresholds already announced (D116).
//!
//! A device belongs to a person, not to a workspace, so `device_tokens` is
//! filtered by `user_id` and `deleted_at IS NULL` rather than by a
//! workspace, as `passkeys` is. The one read that starts from a workspace
//! goes through a live membership.

use chrono::{DateTime, NaiveDate, Utc};
use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow, serde::Serialize)]
pub struct DeviceRow {
    pub id: String,
    pub platform: String,
    pub created_at: DateTime<Utc>,
    pub last_seen_at: DateTime<Utc>,
}

/// A device and the token to reach it with. Never serialised: the token is
/// a credential for pushing to someone's phone.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DeviceTarget {
    pub id: String,
    pub token: String,
}

// ---------------------------------------------------------------- devices

/// Register a token for a person. A token that is already live, for anyone,
/// moves to this person and counts as seen now.
pub async fn upsert_device(
    executor: impl PgExecutor<'_>,
    id: &str,
    user_id: &str,
    platform: &str,
    token: &str,
) -> Result<DeviceRow, sqlx::Error> {
    sqlx::query_as!(
        DeviceRow,
        r#"INSERT INTO device_tokens (id, user_id, platform, token)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (token) WHERE deleted_at IS NULL DO UPDATE
           SET user_id = EXCLUDED.user_id,
               platform = EXCLUDED.platform,
               updated_at = now(),
               last_seen_at = now()
           RETURNING id, platform, created_at, last_seen_at"#,
        id,
        user_id,
        platform,
        token
    )
    .fetch_one(executor)
    .await
}

/// Soft-delete one of this person's own tokens. Another person's, or one
/// already gone, is `None`.
pub async fn soft_delete_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    token: &str,
) -> Result<Option<DeviceRow>, sqlx::Error> {
    sqlx::query_as!(
        DeviceRow,
        r#"UPDATE device_tokens SET deleted_at = now(), updated_at = now()
           WHERE user_id = $1 AND token = $2 AND deleted_at IS NULL
           RETURNING id, platform, created_at, last_seen_at"#,
        user_id,
        token
    )
    .fetch_optional(executor)
    .await
}

/// Retire a token FCM reported dead. By id, because the sender only holds
/// the devices it was handed.
pub async fn soft_delete_device(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE device_tokens SET deleted_at = now(), updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL"#,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn targets_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Vec<DeviceTarget>, sqlx::Error> {
    sqlx::query_as!(
        DeviceTarget,
        r#"SELECT id, token FROM device_tokens
           WHERE user_id = $1 AND deleted_at IS NULL
           ORDER BY created_at, id"#,
        user_id
    )
    .fetch_all(executor)
    .await
}

/// Every live device of every live member of a workspace.
pub async fn targets_for_workspace(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<DeviceTarget>, sqlx::Error> {
    sqlx::query_as!(
        DeviceTarget,
        r#"SELECT d.id, d.token
           FROM device_tokens d
           JOIN user_workspaces m
             ON m.user_id = d.user_id AND m.workspace_id = $1 AND m.deleted_at IS NULL
           WHERE d.deleted_at IS NULL
           ORDER BY d.created_at, d.id"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

// ---------------------------------------------------------- budget alerts

/// Record that a budget crossed a threshold in a month. `true` only for the
/// call that wrote the row, so of two racing writers exactly one announces
/// it.
pub async fn insert_budget_alert(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    budget_id: &str,
    month: NaiveDate,
    threshold: i16,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"INSERT INTO budget_alerts (id, workspace_id, budget_id, month, threshold)
           VALUES ($1, $2, $3, $4, $5)
           ON CONFLICT (budget_id, month, threshold) DO NOTHING
           RETURNING id"#,
        id,
        workspace_id,
        budget_id,
        month,
        threshold
    )
    .fetch_optional(executor)
    .await
    .map(|row| row.is_some())
}
