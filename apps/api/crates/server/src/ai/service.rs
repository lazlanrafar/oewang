//! Chat sessions and their messages.
//!
//! One conversation is one `ai_sessions` row with its `ai_messages`
//! (docs/features/chat.md#sessions). The tool loop that fills them arrives
//! in US-028; what lives here is the conversation's own lifecycle, which
//! the chat page needs before there is anything to say.

use oewang_db::{repositories::ai, PgPool};
use oewang_domain::{AppError, Page, Result};

use crate::audit::{log, snapshot, Actor};

pub use oewang_db::repositories::ai::{MessageRow, SessionRow, SessionSummaryRow};

const ENTITY: &str = "ai_session";

/// Long enough for a generated title, short enough that the list stays
/// readable.
const MAX_TITLE: usize = 120;

/// What a session is called before its first message names it (CHAT-8).
pub const DEFAULT_TITLE: &str = "New chat";

pub async fn list(
    pool: &PgPool,
    workspace_id: &str,
    page: Page,
) -> Result<(Vec<SessionSummaryRow>, i64)> {
    let rows = ai::list_sessions(pool, workspace_id, page.limit.into(), page.offset())
        .await
        .map_err(internal)?;
    let total = ai::count_sessions(pool, workspace_id).await.map_err(internal)?;

    Ok((rows, total))
}

#[derive(Debug)]
pub struct Conversation {
    pub session: SessionRow,
    pub messages: Vec<MessageRow>,
}

pub async fn get(pool: &PgPool, workspace_id: &str, id: &str) -> Result<Conversation> {
    let session = require(pool, workspace_id, id).await?;
    let messages = ai::list_messages(pool, workspace_id, id).await.map_err(internal)?;

    Ok(Conversation { session, messages })
}

pub async fn create(pool: &PgPool, actor: Actor<'_>, title: Option<&str>) -> Result<SessionRow> {
    let title = clean_title(title.unwrap_or(DEFAULT_TITLE))?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let session = ai::insert_session(&mut *tx, &cuid2::create_id(), actor.workspace_id, &title)
        .await
        .map_err(internal)?;

    log(&mut tx, actor, "ai_session.created", ENTITY, &session.id, None, snapshot(&session)?)
        .await?;

    tx.commit().await.map_err(internal)?;

    Ok(session)
}

pub async fn rename(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    title: &str,
) -> Result<SessionRow> {
    let title = clean_title(title)?;
    let before = require(pool, actor.workspace_id, id).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let session = ai::rename_session(&mut *tx, actor.workspace_id, id, &title)
        .await
        .map_err(internal)?
        .ok_or(AppError::SessionNotFound)?;

    log(
        &mut tx,
        actor,
        "ai_session.renamed",
        ENTITY,
        &session.id,
        snapshot(&before)?,
        snapshot(&session)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    Ok(session)
}

/// Soft delete, like everything else (OPS-2). The messages go with the
/// session rather than being left orphaned behind a deleted parent.
pub async fn delete(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let before = require(pool, actor.workspace_id, id).await?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let removed = ai::soft_delete_session(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    if !removed {
        return Err(AppError::SessionNotFound);
    }

    ai::soft_delete_session_messages(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;

    log(&mut tx, actor, "ai_session.deleted", ENTITY, id, snapshot(&before)?, None).await?;

    tx.commit().await.map_err(internal)?;

    Ok(())
}

/// Append one message and bump the session's place in the list.
///
/// The stream persists both halves of a turn through here (US-028), which
/// is why it takes the role rather than assuming the user's. Nothing calls
/// it until that story lands; it is written and tested now because the
/// session's rules and its messages' rules are one piece.
#[allow(dead_code)]
pub async fn append_message(
    pool: &PgPool,
    workspace_id: &str,
    session_id: &str,
    role: &str,
    content: &str,
    attachments: Option<&serde_json::Value>,
) -> Result<MessageRow> {
    if !matches!(role, "user" | "assistant" | "system") {
        return Err(AppError::validation([("role", "That is not a message role.")]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;

    // Scoped by workspace, so a session id from another workspace cannot be
    // written into (AUTH-4).
    if ai::find_session(&mut *tx, workspace_id, session_id).await.map_err(internal)?.is_none() {
        return Err(AppError::SessionNotFound);
    }

    let message = ai::insert_message(
        &mut *tx,
        &cuid2::create_id(),
        workspace_id,
        session_id,
        role,
        content,
        attachments,
    )
    .await
    .map_err(internal)?;

    ai::touch_session(&mut *tx, workspace_id, session_id).await.map_err(internal)?;

    // No audit row: a message is the conversation itself, not a change to
    // workspace data, and OPS-3 keeps its content out of the trail anyway.
    tx.commit().await.map_err(internal)?;

    Ok(message)
}

async fn require(pool: &PgPool, workspace_id: &str, id: &str) -> Result<SessionRow> {
    ai::find_session(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::SessionNotFound)
}

/// A title is a label, not prose: one line, trimmed, bounded.
fn clean_title(raw: &str) -> Result<String> {
    let title: String = raw.trim().chars().filter(|c| !c.is_control()).collect();

    if title.is_empty() {
        return Err(AppError::validation([("title", "A title is required.")]));
    }

    Ok(title.chars().take(MAX_TITLE).collect())
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}

#[cfg(test)]
mod title_tests {
    use super::*;

    #[test]
    fn should_trim_and_keep_one_line() {
        assert_eq!(clean_title("  Lunch spending\n  ").unwrap(), "Lunch spending");
    }

    #[test]
    fn should_refuse_an_empty_title() {
        assert!(clean_title("   ").is_err());
        assert!(clean_title("\n\t").is_err());
    }

    #[test]
    fn should_bound_a_long_title() {
        let long = "a".repeat(400);
        assert_eq!(clean_title(&long).unwrap().chars().count(), MAX_TITLE);
    }
}
