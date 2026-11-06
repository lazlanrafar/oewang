//! Feedback from settings (FB-1): a type and a message, stored with who sent
//! it and from which workspace.

use oewang_db::repositories::feedback::{self, FeedbackRow};
use oewang_domain::{AppError, Result};
use sqlx::PgPool;

use crate::audit::{log, snapshot, Actor};

pub const KINDS: [&str; 3] = ["bug", "feature", "other"];
pub const MAX_MESSAGE_CHARS: usize = 5000;

pub async fn send(
    pool: &PgPool,
    actor: Actor<'_>,
    kind: &str,
    message: &str,
) -> Result<FeedbackRow> {
    if !KINDS.contains(&kind) {
        return Err(AppError::validation([(
            "type",
            "Use bug, feature or other.",
        )]));
    }
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::validation([("message", "Required.")]));
    }
    if message.chars().count() > MAX_MESSAGE_CHARS {
        return Err(AppError::validation([(
            "message",
            "Feedback can be at most 5000 characters.",
        )]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let row = feedback::insert(
        &mut *tx,
        &cuid2::create_id(),
        actor.workspace_id,
        actor.user_id,
        kind,
        message,
    )
    .await
    .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "feedback.sent",
        "feedback",
        &row.id,
        None,
        snapshot(&row)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(row)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
