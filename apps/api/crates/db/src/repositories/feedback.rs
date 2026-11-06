//! Feedback sent from settings (FB-1).

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgExecutor;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct FeedbackRow {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
    pub created_at: DateTime<Utc>,
}

pub async fn insert(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    user_id: &str,
    kind: &str,
    message: &str,
) -> Result<FeedbackRow, sqlx::Error> {
    sqlx::query_as!(
        FeedbackRow,
        r#"INSERT INTO feedback (id, workspace_id, user_id, type, message)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, type AS kind, message, created_at"#,
        id,
        workspace_id,
        user_id,
        kind,
        message
    )
    .fetch_one(executor)
    .await
}
