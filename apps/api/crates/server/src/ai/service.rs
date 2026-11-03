//! Chat sessions, their messages, and what one turn sends to the model.
//!
//! One conversation is one `ai_sessions` row with its `ai_messages`
//! (docs/features/chat.md#sessions). A turn is two writes around a network
//! call: the user's message before the AI service is reached, the
//! assistant's once its stream has ended.
//!
//! Everything the AI service needs travels in the request body, because that
//! service holds no database connection (D3, CHAT-7). Every figure in it is
//! read from the database already computed and formatted as a string; the
//! model does no arithmetic and is handed nothing to do arithmetic on (D12,
//! D27).

use chrono::Utc;
use oewang_db::{
    repositories::{accounts, ai, categories, vault, wallets},
    PgPool,
};
use oewang_domain::{AppError, Page, Result, Role};
use rust_decimal::Decimal;
use serde::Serialize;
use serde_json::{json, Value};

use crate::audit::{log, snapshot, Actor};

pub use oewang_db::repositories::ai::{MessageRow, SessionRow, SessionSummaryRow};

const ENTITY: &str = "ai_session";

/// How many earlier messages travel with a turn.
///
/// A conversation grows without limit and the cost of a turn must not. The AI
/// service applies its own, smaller window before it builds the prompt
/// (docs/ai/service.md#the-tool-loop); this one bounds the request body on
/// the hop between them.
const HISTORY_WINDOW: usize = 40;

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
/// The stream persists both halves of a turn through here, which is why it
/// takes the role rather than assuming the user's.
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

// -------------------------------------------------------------- one turn

/// What `POST /chat/stream` sends to the AI service
/// (docs/ai/service.md#post-chatstream-request).
#[derive(Debug, Serialize)]
pub struct TurnRequest {
    pub workspace_id: String,
    pub user_id: String,
    /// A claim the prompt is shaped by, never a permission. Every write the
    /// model asks for is re-checked against the membership row (CHAT-4).
    pub role: String,
    pub session_id: String,
    pub message: String,
    pub history: Vec<TurnMessage>,
    pub context: TurnContext,
    pub settings: TurnSettings,
    pub attachments: Vec<TurnAttachment>,
}

#[derive(Debug, Serialize)]
pub struct TurnMessage {
    pub role: String,
    pub content: String,
}

/// The workspace as the prompt describes it (CHAT-7).
#[derive(Debug, Serialize)]
pub struct TurnContext {
    pub currency_code: String,
    /// ISO 8601. UTC, because the data model holds no workspace timezone;
    /// the AI service drops the timezone line rather than guessing one.
    pub today: String,
    pub wallets: Vec<TurnWallet>,
    pub categories: Vec<TurnCategory>,
}

#[derive(Debug, Serialize)]
pub struct TurnWallet {
    pub id: String,
    pub name: String,
    /// A string, as money is everywhere (D12), and read from the balance
    /// column rather than summed here: the model is handed the figure, not
    /// the arithmetic (D27).
    #[serde(with = "rust_decimal::serde::str")]
    pub balance: Decimal,
    pub currency_code: String,
    pub is_default: bool,
}

#[derive(Debug, Serialize)]
pub struct TurnCategory {
    pub id: String,
    pub name: String,
    pub r#type: String,
}

#[derive(Debug, Serialize)]
pub struct TurnSettings {
    pub custom_instructions: Option<String>,
    pub response_language: String,
}

#[derive(Debug, Serialize)]
pub struct TurnAttachment {
    pub vault_file_id: String,
    pub r#type: String,
    /// Where the API serves the bytes. The AI service cannot fetch it on its
    /// own: it holds no user token (D4) and signed object-storage URLs do not
    /// exist in this product (D23).
    pub url: String,
}

/// Validate the turn, persist what the user said, and build what the AI
/// service is asked with.
///
/// The user's message lands before the network call, so a turn that fails
/// mid-stream still shows what was asked (docs/features/chat.md#streaming).
pub async fn begin_turn(
    pool: &PgPool,
    workspace_id: &str,
    user_id: &str,
    role: Role,
    session_id: &str,
    message: &str,
    attachment_ids: &[String],
) -> Result<TurnRequest> {
    let message = message.trim();
    if message.is_empty() {
        return Err(AppError::validation([("message", "A message is required.")]));
    }

    // Workspace-scoped, so a session id from another workspace is not found
    // rather than answered (AUTH-4).
    require(pool, workspace_id, session_id).await?;

    let mut attachments = Vec::with_capacity(attachment_ids.len());
    for id in attachment_ids {
        let file = vault::find_file(pool, workspace_id, id)
            .await
            .map_err(internal)?
            .ok_or(AppError::FileNotFound)?;
        attachments.push(file);
    }

    let workspace = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotAMember)?;
    let wallets = wallets::list_wallets(pool, workspace_id).await.map_err(internal)?;
    let categories = categories::list_categories(pool, workspace_id, None)
        .await
        .map_err(internal)?;
    let settings = ai::find_settings(pool, workspace_id).await.map_err(internal)?;

    let stored = ai::list_messages(pool, workspace_id, session_id).await.map_err(internal)?;

    let files: Vec<Value> = attachments
        .iter()
        .map(|file| json!({ "vault_file_id": file.id, "name": file.name, "type": file.r#type }))
        .collect();
    let stored_attachments = (!files.is_empty()).then(|| json!({ "files": files }));

    append_message(
        pool,
        workspace_id,
        session_id,
        "user",
        message,
        stored_attachments.as_ref(),
    )
    .await?;

    Ok(TurnRequest {
        workspace_id: workspace_id.to_string(),
        user_id: user_id.to_string(),
        role: role.as_str().to_string(),
        session_id: session_id.to_string(),
        message: message.to_string(),
        history: stored
            .into_iter()
            // The model takes a conversation of two speakers. A system row is
            // not one of them.
            .filter(|row| row.role == "user" || row.role == "assistant")
            .rev()
            .take(HISTORY_WINDOW)
            .collect::<Vec<_>>()
            .into_iter()
            .rev()
            .map(|row| TurnMessage { role: row.role, content: row.content })
            .collect(),
        context: TurnContext {
            currency_code: workspace.currency_code,
            today: Utc::now().date_naive().to_string(),
            wallets: wallets
                .into_iter()
                .map(|wallet| TurnWallet {
                    id: wallet.id,
                    name: wallet.name,
                    balance: wallet.balance,
                    currency_code: wallet.currency_code,
                    is_default: wallet.is_default,
                })
                .collect(),
            categories: categories
                .into_iter()
                .map(|category| TurnCategory {
                    id: category.id,
                    name: category.name,
                    r#type: category.r#type,
                })
                .collect(),
        },
        settings: TurnSettings {
            custom_instructions: settings.as_ref().and_then(|row| row.custom_instructions.clone()),
            response_language: settings
                .map(|row| row.response_language)
                .unwrap_or_else(|| "auto".to_string()),
        },
        attachments: attachments
            .into_iter()
            .map(|file| TurnAttachment {
                url: format!("/v1/vault/files/{}/chunks/0", file.id),
                vault_file_id: file.id,
                r#type: file.r#type,
            })
            .collect(),
    })
}

/// Persist what the assistant said.
///
/// Called when the stream ends, however it ends: a reply cut short by the
/// caller hanging up is still the reply they got, and is stored (CHAT-9).
pub async fn finish_turn(
    pool: &PgPool,
    workspace_id: &str,
    session_id: &str,
    content: &str,
    usage: Option<&Value>,
) -> Result<MessageRow> {
    let attachments = usage.map(|usage| json!({ "usage": usage }));

    append_message(pool, workspace_id, session_id, "assistant", content, attachments.as_ref()).await
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
