//! Chat sessions and their messages.
//!
//! See docs/data-model.md#chat and docs/features/chat.md#sessions.

use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::Value;
use sqlx::PgExecutor;

/// `Serialize` is for the audit snapshot, as in `wallets`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct SessionRow {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A session with the counters the list shows beside it.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SessionSummaryRow {
    pub id: String,
    pub title: String,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub message_count: i64,
    /// The first words of the last message, for the list's second line.
    pub last_message: Option<String>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MessageRow {
    pub id: String,
    pub session_id: String,
    pub role: String,
    pub content: String,
    pub attachments: Option<Value>,
    pub created_at: DateTime<Utc>,
}

/// Newest activity first (CHAT-1).
pub async fn list_sessions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<SessionSummaryRow>, sqlx::Error> {
    sqlx::query_as!(
        SessionSummaryRow,
        r#"SELECT s.id,
                  s.title,
                  s.created_at,
                  s.updated_at,
                  COALESCE(m.message_count, 0) AS "message_count!",
                  m.last_message
           FROM ai_sessions s
           LEFT JOIN LATERAL (
               SELECT count(*) AS message_count,
                      (ARRAY_AGG(content ORDER BY created_at DESC))[1] AS last_message
               FROM ai_messages
               WHERE session_id = s.id AND deleted_at IS NULL
           ) m ON true
           WHERE s.workspace_id = $1 AND s.deleted_at IS NULL
           ORDER BY s.updated_at DESC
           LIMIT $2 OFFSET $3"#,
        workspace_id,
        limit,
        offset
    )
    .fetch_all(executor)
    .await
}

pub async fn count_sessions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!"
           FROM ai_sessions
           WHERE workspace_id = $1 AND deleted_at IS NULL"#,
        workspace_id
    )
    .fetch_one(executor)
    .await
}

pub async fn find_session(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<SessionRow>, sqlx::Error> {
    sqlx::query_as!(
        SessionRow,
        r#"SELECT id, title, created_at, updated_at
           FROM ai_sessions
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// The session the user last spoke in, which is what `/chat` opens.
pub async fn newest_session(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Option<SessionRow>, sqlx::Error> {
    sqlx::query_as!(
        SessionRow,
        r#"SELECT id, title, created_at, updated_at
           FROM ai_sessions
           WHERE workspace_id = $1 AND deleted_at IS NULL
           ORDER BY updated_at DESC
           LIMIT 1"#,
        workspace_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn insert_session(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    title: &str,
) -> Result<SessionRow, sqlx::Error> {
    sqlx::query_as!(
        SessionRow,
        r#"INSERT INTO ai_sessions (id, workspace_id, title)
           VALUES ($1, $2, $3)
           RETURNING id, title, created_at, updated_at"#,
        id,
        workspace_id,
        title
    )
    .fetch_one(executor)
    .await
}

pub async fn rename_session(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    title: &str,
) -> Result<Option<SessionRow>, sqlx::Error> {
    sqlx::query_as!(
        SessionRow,
        r#"UPDATE ai_sessions
           SET title = $3, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, title, created_at, updated_at"#,
        workspace_id,
        id,
        title
    )
    .fetch_optional(executor)
    .await
}

/// Soft delete only (OPS-2). The messages go with it, by the same rule.
pub async fn soft_delete_session(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<bool, sqlx::Error> {
    let result = sqlx::query!(
        r#"UPDATE ai_sessions
           SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected() > 0)
}

pub async fn soft_delete_session_messages(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    session_id: &str,
) -> Result<u64, sqlx::Error> {
    let result = sqlx::query!(
        r#"UPDATE ai_messages
           SET deleted_at = now()
           WHERE workspace_id = $1 AND session_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        session_id
    )
    .execute(executor)
    .await?;

    Ok(result.rows_affected())
}

/// Oldest first: a conversation reads from the top.
pub async fn list_messages(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    session_id: &str,
) -> Result<Vec<MessageRow>, sqlx::Error> {
    sqlx::query_as!(
        MessageRow,
        r#"SELECT id, session_id, role, content, attachments, created_at
           FROM ai_messages
           WHERE workspace_id = $1 AND session_id = $2 AND deleted_at IS NULL
           ORDER BY created_at, id"#,
        workspace_id,
        session_id
    )
    .fetch_all(executor)
    .await
}

pub async fn insert_message(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    attachments: Option<&Value>,
) -> Result<MessageRow, sqlx::Error> {
    sqlx::query_as!(
        MessageRow,
        r#"INSERT INTO ai_messages (id, workspace_id, session_id, role, content, attachments)
           VALUES ($1, $2, $3, $4, $5, $6)
           RETURNING id, session_id, role, content, attachments, created_at"#,
        id,
        workspace_id,
        session_id,
        role,
        content,
        attachments
    )
    .fetch_one(executor)
    .await
}

/// A session's activity timestamp, bumped when a message lands in it.
pub async fn touch_session(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE ai_sessions
           SET updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await?;

    Ok(())
}
