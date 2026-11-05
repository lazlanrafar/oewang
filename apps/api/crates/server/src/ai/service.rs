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
    let total = ai::count_sessions(pool, workspace_id)
        .await
        .map_err(internal)?;

    Ok((rows, total))
}

#[derive(Debug)]
pub struct Conversation {
    pub session: SessionRow,
    pub messages: Vec<MessageRow>,
}

pub async fn get(pool: &PgPool, workspace_id: &str, id: &str) -> Result<Conversation> {
    let session = require(pool, workspace_id, id).await?;
    let messages = ai::list_messages(pool, workspace_id, id)
        .await
        .map_err(internal)?;

    Ok(Conversation { session, messages })
}

pub async fn create(pool: &PgPool, actor: Actor<'_>, title: Option<&str>) -> Result<SessionRow> {
    let title = clean_title(title.unwrap_or(DEFAULT_TITLE))?;

    let mut tx = pool.begin().await.map_err(internal)?;

    let session = ai::insert_session(&mut *tx, &cuid2::create_id(), actor.workspace_id, &title)
        .await
        .map_err(internal)?;

    log(
        &mut tx,
        actor,
        "ai_session.created",
        ENTITY,
        &session.id,
        None,
        snapshot(&session)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    Ok(session)
}

pub async fn rename(pool: &PgPool, actor: Actor<'_>, id: &str, title: &str) -> Result<SessionRow> {
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

    log(
        &mut tx,
        actor,
        "ai_session.deleted",
        ENTITY,
        id,
        snapshot(&before)?,
        None,
    )
    .await?;

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
        return Err(AppError::validation([(
            "role",
            "That is not a message role.",
        )]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;

    // Scoped by workspace, so a session id from another workspace cannot be
    // written into (AUTH-4).
    if ai::find_session(&mut *tx, workspace_id, session_id)
        .await
        .map_err(internal)?
        .is_none()
    {
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

    ai::touch_session(&mut *tx, workspace_id, session_id)
        .await
        .map_err(internal)?;

    // No audit row: a message is the conversation itself, not a change to
    // workspace data, and OPS-3 keeps its content out of the trail anyway.
    tx.commit().await.map_err(internal)?;

    Ok(message)
}

// ------------------------------------------------------------- settings

pub use oewang_db::repositories::ai::AgentSettingsRow;

/// What the workspace wants the assistant to be like (CHAT-10).
///
/// A workspace with no row reads the defaults rather than failing. The row
/// is normally written with the workspace itself.
pub async fn settings(pool: &PgPool, workspace_id: &str) -> Result<AgentSettingsRow> {
    Ok(ai::find_settings(pool, workspace_id)
        .await
        .map_err(internal)?
        .unwrap_or(AgentSettingsRow {
            custom_instructions: None,
            response_language: "auto".to_string(),
        }))
}

/// How long the workspace's own instructions may be.
///
/// They are prepended to every turn's prompt, so an unbounded field is an
/// unbounded cost per turn, and a long enough one would crowd out the
/// rules above it (docs/ai/service.md#system-prompt).
const MAX_CUSTOM_INSTRUCTIONS: usize = 2_000;

const LANGUAGES: [&str; 3] = ["auto", "english", "indonesian"];

pub async fn update_settings(
    pool: &PgPool,
    actor: Actor<'_>,
    custom_instructions: Option<&str>,
    response_language: Option<&str>,
) -> Result<AgentSettingsRow> {
    let current = settings(pool, actor.workspace_id).await?;

    let instructions = match custom_instructions {
        None => current.custom_instructions.clone(),
        Some(raw) => {
            let cleaned = raw.trim();
            if cleaned.chars().count() > MAX_CUSTOM_INSTRUCTIONS {
                return Err(AppError::validation([(
                    "custom_instructions",
                    "That is longer than the assistant can carry on every turn.",
                )]));
            }
            (!cleaned.is_empty()).then(|| cleaned.to_string())
        }
    };

    let language = match response_language {
        None => current.response_language.clone(),
        Some(raw) if LANGUAGES.contains(&raw) => raw.to_string(),
        Some(_) => {
            return Err(AppError::validation([(
                "response_language",
                "Choose auto, english or indonesian.",
            )]))
        }
    };

    let mut tx = pool.begin().await.map_err(internal)?;

    let row = ai::upsert_settings(
        &mut *tx,
        &cuid2::create_id(),
        actor.workspace_id,
        instructions.as_deref(),
        &language,
    )
    .await
    .map_err(internal)?;

    // The instructions themselves stay out of the trail: they are the
    // workspace's text, and the audit row records that they changed, not
    // what they say (OPS-3).
    log(
        &mut tx,
        actor,
        "ai_settings.updated",
        "ai_settings",
        actor.workspace_id,
        snapshot(&json!({
            "has_custom_instructions": current.custom_instructions.is_some(),
            "response_language": current.response_language,
        }))?,
        snapshot(&json!({
            "has_custom_instructions": row.custom_instructions.is_some(),
            "response_language": row.response_language,
        }))?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    Ok(row)
}

// -------------------------------------------------------------- one turn

pub const CHANNEL_WEB: &str = "web";
pub const CHANNEL_TELEGRAM: &str = "telegram";

/// What `POST /chat/stream` sends to the AI service
/// (docs/ai/service.md#post-chatstream-request).
#[derive(Debug, Serialize)]
pub struct TurnRequest {
    /// Minted here, once per user turn, and echoed by the AI service on
    /// every tool call it makes. The per-turn caps are counted against it,
    /// which is why the API mints it and the AI service does not: a service
    /// that minted its own id per call would have no cap at all (D25).
    pub turn_id: String,
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
    /// Where the reply will be read: `web` renders Markdown, entity links
    /// and the canvas; `telegram` shows plain text (D86). It shapes the
    /// prompt only.
    pub channel: &'static str,
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
        return Err(AppError::validation([(
            "message",
            "A message is required.",
        )]));
    }

    // Workspace-scoped, so a session id from another workspace is not found
    // rather than answered (AUTH-4).
    let session = require(pool, workspace_id, session_id).await?;

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
    let wallets = wallets::list_wallets(pool, workspace_id)
        .await
        .map_err(internal)?;
    let categories = categories::list_categories(pool, workspace_id, None)
        .await
        .map_err(internal)?;
    let settings = ai::find_settings(pool, workspace_id)
        .await
        .map_err(internal)?;

    let stored = ai::list_messages(pool, workspace_id, session_id)
        .await
        .map_err(internal)?;

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

    // The first message names the conversation (CHAT-8). Taken from the
    // message rather than asked of the model: a label is not a place a
    // model's judgement earns a call on the first turn of every new
    // conversation, and this costs nothing and arrives instantly.
    //
    // Only while the session is still unnamed, so a title the user set is
    // never overwritten.
    if session.title == DEFAULT_TITLE {
        if let Ok(title) = clean_title(&summarize(message)) {
            ai::rename_session(pool, workspace_id, session_id, &title)
                .await
                .map_err(internal)?;
        }
    }

    Ok(TurnRequest {
        turn_id: cuid2::create_id(),
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
            .map(|row| TurnMessage {
                role: row.role,
                content: row.content,
            })
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
            custom_instructions: settings
                .as_ref()
                .and_then(|row| row.custom_instructions.clone()),
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
        channel: CHANNEL_WEB,
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
    tool_calls: &[Value],
) -> Result<MessageRow> {
    let mut attachments = serde_json::Map::new();
    if let Some(usage) = usage {
        attachments.insert("usage".to_string(), usage.clone());
    }
    if !tool_calls.is_empty() {
        attachments.insert("tool_calls".to_string(), Value::Array(tool_calls.to_vec()));
    }

    if attachments.is_empty() {
        return append_message(pool, workspace_id, session_id, "assistant", content, None).await;
    }

    let attachments = Value::Object(attachments);

    append_message(
        pool,
        workspace_id,
        session_id,
        "assistant",
        content,
        Some(&attachments),
    )
    .await
}

async fn require(pool: &PgPool, workspace_id: &str, id: &str) -> Result<SessionRow> {
    ai::find_session(pool, workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::SessionNotFound)
}

/// How much of the first message becomes the session's name.
///
/// Short enough to read in a list at a glance, long enough that two
/// questions about the same wallet do not look identical.
const TITLE_FROM_MESSAGE: usize = 60;

/// The first message, cut to a label.
///
/// Cut on a word boundary when there is one near the end, because a title
/// ending mid-word reads as a bug rather than as a truncation.
fn summarize(message: &str) -> String {
    let line = message.lines().next().unwrap_or(message).trim();

    if line.chars().count() <= TITLE_FROM_MESSAGE {
        return line.to_string();
    }

    let cut: String = line.chars().take(TITLE_FROM_MESSAGE).collect();
    let trimmed = match cut.rfind(char::is_whitespace) {
        Some(space) if space > TITLE_FROM_MESSAGE / 2 => &cut[..space],
        _ => cut.as_str(),
    };

    format!("{}…", trimmed.trim_end_matches([',', '.', ';', ':']))
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
    fn should_name_a_session_after_a_short_first_message() {
        assert_eq!(
            summarize("How much did I spend on food?"),
            "How much did I spend on food?"
        );
    }

    #[test]
    fn should_cut_a_long_message_on_a_word_boundary() {
        let message = "How much did I spend on food last month across every \
                       wallet including the one in dollars";
        let title = summarize(message);

        assert!(title.ends_with('…'), "{title}");
        assert!(title.chars().count() <= TITLE_FROM_MESSAGE + 1, "{title}");
        assert!(!title.contains("  "), "{title}");
        // Cut between words, not inside one.
        assert!(message.starts_with(title.trim_end_matches('…')), "{title}");
    }

    #[test]
    fn should_take_only_the_first_line() {
        assert_eq!(summarize("Lunch\nand dinner"), "Lunch");
    }

    #[test]
    fn should_trim_and_keep_one_line() {
        assert_eq!(
            clean_title("  Lunch spending\n  ").unwrap(),
            "Lunch spending"
        );
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

// -------------------------------------------------------------- receipts

/// A receipt draft, checked, with the file it came from.
///
/// Nothing in it is persisted. The user confirms it on a sheet and the
/// ordinary create path writes the transaction (AI-2).
#[derive(Debug)]
pub struct ReceiptOutcome {
    pub vault_file_id: String,
    pub draft: oewang_domain::receipt::ReceiptDraft,
    pub quality: oewang_domain::receipt::Quality,
}

/// Read an uploaded receipt and answer with a draft (AI-1, AI-7).
///
/// Three steps, in this order for a reason: the bytes are fetched with a
/// workspace filter, the model is asked and given no tools, and the numbers
/// it produced are checked by arithmetic in Rust before anyone sees them.
/// The model's total is a reading of a photograph; the sum of the items is
/// evidence, and where they disagree the code decides and says so (D27,
/// D30).
pub async fn parse_receipt(
    pool: &PgPool,
    store: &impl oewang_clients::storage::Storage,
    ai: &oewang_clients::Owe1Client,
    request_id: &str,
    workspace_id: &str,
    file_id: &str,
) -> Result<ReceiptOutcome> {
    let workspace = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let document = crate::ai::extraction::document(pool, store, workspace_id, file_id).await?;
    let answer = crate::ai::extraction::parse_receipt(
        ai,
        request_id,
        workspace_id,
        &workspace.currency_code,
        document,
    )
    .await?;

    let checked = oewang_domain::receipt::check(
        answer.draft,
        &workspace.currency_code,
        Utc::now().date_naive(),
    );

    // A receipt with neither a total nor a date is not a receipt that was
    // read, whatever the ladder scored it (AI-3).
    if checked.draft.total.is_none() && checked.draft.date.is_none() {
        return Err(AppError::ReceiptUnreadable);
    }

    let mut quality = answer.quality;
    // The ladder reports what it was unsure of; the arithmetic reports what
    // it replaced. Both reach the sheet, and they are different claims
    // (AI-11).
    quality.corrected_fields = checked.corrected;

    Ok(ReceiptOutcome {
        vault_file_id: file_id.to_string(),
        draft: checked.draft,
        quality,
    })
}
