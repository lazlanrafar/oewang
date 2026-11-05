//! Chat session routes.
//!
//! Every route takes any member: a conversation belongs to the workspace,
//! and a viewer who cannot write transactions can still ask questions
//! (docs/api/endpoints.md#chat).

use axum::{
    extract::{Extension, Path, Query, State},
    http::StatusCode,
    response::Response,
    Json,
};
use oewang_db::repositories::ai::{MessageRow, SessionRow, SessionSummaryRow};
use oewang_domain::{Envelope, Page, PageMeta};
use serde::{Deserialize, Serialize};

use crate::{
    ai::{service, stream, tools},
    audit::Actor,
    auth::extractor::{Auth, AuthWrite, ServiceCaller},
    owe1::{session::now_secs, Owe1Context},
    response::{ApiError, RequestId},
    state::AppState,
};

// ------------------------------------------------------------------- views

#[derive(Debug, Serialize)]
pub struct SessionView {
    pub id: String,
    pub title: String,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SessionRow> for SessionView {
    fn from(row: SessionRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

/// A row in the session list, with what the list renders beside the title.
#[derive(Debug, Serialize)]
pub struct SessionSummaryView {
    pub id: String,
    pub title: String,
    pub message_count: i64,
    pub last_message: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

impl From<SessionSummaryRow> for SessionSummaryView {
    fn from(row: SessionSummaryRow) -> Self {
        Self {
            id: row.id,
            title: row.title,
            message_count: row.message_count,
            // Enough for one line in the list; the message itself is read
            // by opening the session.
            last_message: row.last_message.map(|text| preview(&text)),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MessageView {
    pub id: String,
    pub role: String,
    pub content: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachments: Option<serde_json::Value>,
    pub created_at: String,
}

impl From<MessageRow> for MessageView {
    fn from(row: MessageRow) -> Self {
        Self {
            id: row.id,
            role: row.role,
            content: row.content,
            attachments: row.attachments,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct ConversationView {
    #[serde(flatten)]
    pub session: SessionView,
    pub messages: Vec<MessageView>,
}

const PREVIEW_CHARS: usize = 140;

fn preview(text: &str) -> String {
    let one_line: String = text
        .chars()
        .map(|c| if c.is_control() { ' ' } else { c })
        .take(PREVIEW_CHARS)
        .collect();
    one_line.trim().to_string()
}

// ------------------------------------------------------------------ bodies

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub title: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct RenameBody {
    pub title: String,
}

/// The workspace's agent settings (CHAT-10).
#[derive(Debug, Serialize)]
pub struct SettingsView {
    pub custom_instructions: Option<String>,
    pub response_language: String,
}

impl From<service::AgentSettingsRow> for SettingsView {
    fn from(row: service::AgentSettingsRow) -> Self {
        Self {
            custom_instructions: row.custom_instructions,
            response_language: row.response_language,
        }
    }
}

/// A patch: an absent field is left alone. `custom_instructions` present
/// and empty clears it, which is how the form erases the text.
#[derive(Debug, Deserialize)]
pub struct SettingsBody {
    #[serde(default)]
    pub custom_instructions: Option<String>,
    #[serde(default)]
    pub response_language: Option<String>,
}

/// One tool call, as the AI service relays it
/// (docs/api/endpoints.md#post-v1internaltoolsexecute-body).
///
/// `workspace_id` and `role` are in the body here, unlike every other
/// route, because the caller holds no user token (D4). The first names who
/// the call is for; the second is a claim the service re-checks against the
/// membership row and otherwise ignores.
#[derive(Debug, Deserialize)]
pub struct ToolBody {
    pub workspace_id: String,
    pub user_id: String,
    pub role: String,
    pub session_id: String,
    /// Minted by this API when the turn began. A turn id it did not mint is
    /// refused, because a caller that minted its own per call would have no
    /// cap at all (D25).
    pub turn_id: String,
    /// The model's id for the call. Keys the canvas artifact an analysis
    /// tool leaves for the stream (D88).
    #[serde(default)]
    pub call_id: Option<String>,
    pub tool: String,
    #[serde(default)]
    pub args: serde_json::Value,
}

#[derive(Debug, Serialize)]
pub struct ToolView {
    pub ok: bool,
    pub result: serde_json::Value,
    pub summary: String,
}

/// Which uploaded file to read. The bytes are not in the body: a receipt
/// does not fit in one (SEC-18), so it is uploaded as chunks first and
/// named here (D23).
#[derive(Debug, Deserialize)]
pub struct ReceiptBody {
    pub vault_file_id: String,
}

/// The draft, what the ladder scored it, and what arithmetic replaced.
/// Nothing in it has been written anywhere (AI-2).
#[derive(Debug, Serialize)]
pub struct ReceiptView {
    pub vault_file_id: String,
    pub draft: oewang_domain::receipt::ReceiptDraft,
    pub quality: oewang_domain::receipt::Quality,
}

/// One user turn. `workspace_id` is not here and never will be: it comes
/// from the token (AUTH-4).
#[derive(Debug, Deserialize)]
pub struct StreamBody {
    pub session_id: String,
    pub message: String,
    #[serde(default)]
    pub attachment_ids: Vec<String>,
}

// ---------------------------------------------------------------- handlers

pub async fn list_sessions(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Query(query): Query<ListQuery>,
) -> Result<Json<Envelope<Vec<SessionSummaryView>>>, ApiError> {
    let id = request_id.0;
    let page = Page::new(query.page, query.limit);

    match service::list(&state.db, &auth.workspace_id, page).await {
        Ok((rows, total)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(SessionSummaryView::from).collect(),
            id,
            PageMeta::new(page.page, page.limit, total as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get_session(
    State(state): State<AppState>,
    auth: Auth,
    Path(session_id): Path<String>,
    request_id: RequestId,
) -> Result<Json<Envelope<ConversationView>>, ApiError> {
    let id = request_id.0;

    match service::get(&state.db, &auth.workspace_id, &session_id).await {
        Ok(conversation) => Ok(Json(Envelope::data(
            ConversationView {
                session: conversation.session.into(),
                messages: conversation
                    .messages
                    .into_iter()
                    .map(MessageView::from)
                    .collect(),
            },
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn create_session(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<CreateBody>,
) -> Result<(StatusCode, Json<Envelope<SessionView>>), ApiError> {
    let id = request_id.0;

    match service::create(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        body.title.as_deref(),
    )
    .await
    {
        Ok(session) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(session.into(), id)),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn rename_session(
    State(state): State<AppState>,
    auth: Auth,
    Path(session_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<RenameBody>,
) -> Result<Json<Envelope<SessionView>>, ApiError> {
    let id = request_id.0;

    match service::rename(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &session_id,
        &body.title,
    )
    .await
    {
        Ok(session) => Ok(Json(Envelope::data(session.into(), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn delete_session(
    State(state): State<AppState>,
    auth: Auth,
    Path(session_id): Path<String>,
    request_id: RequestId,
) -> Result<StatusCode, ApiError> {
    let id = request_id.0;

    match service::delete(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &session_id,
    )
    .await
    {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// One turn, answered as server-sent events rather than the envelope
/// (docs/api/conventions.md#streaming).
///
/// The context is the OWE1 middleware's, and it is optional only because
/// development may run with encryption off; `stream::start` refuses to send
/// plaintext events anywhere else.
pub async fn chat_stream(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    context: Option<Extension<Owe1Context>>,
    Json(body): Json<StreamBody>,
) -> Result<Response, ApiError> {
    let id = request_id.0;

    // Per workspace, not per address: what this bounds is model spend, and
    // spend belongs to a workspace (SEC-17). Counted before the user's
    // message is written, so a refused turn leaves no half-turn behind.
    state
        .rate_limits
        .check(
            crate::limits::Bucket::ChatTurn,
            &auth.workspace_id,
            now_secs(),
        )
        .map_err(|error| ApiError::new(error, id.clone()))?;

    let turn = service::begin_turn(
        &state.db,
        &auth.workspace_id,
        &auth.user_id,
        auth.role,
        &body.session_id,
        &body.message,
        &body.attachment_ids,
    )
    .await
    .map_err(|error| ApiError::new(error, id.clone()))?;

    // The turn's budget opens here and nowhere else. A tool call naming a
    // turn id this never opened is refused (D25).
    state.turns.open(&turn.turn_id, now_secs());

    stream::start(&state, turn, context.map(|Extension(context)| context))
        .await
        .map_err(|error| ApiError::new(error, id))
}

/// Read the workspace's agent settings. Any member: what the assistant
/// has been told is not a privileged question.
pub async fn get_settings(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<SettingsView>>, ApiError> {
    let id = request_id.0;

    match service::settings(&state.db, &auth.workspace_id).await {
        Ok(row) => Ok(Json(Envelope::data(row.into(), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Change them. `AuthWrite` re-reads the membership row, so a demoted
/// admin cannot still edit what every future turn is told.
pub async fn update_settings(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<SettingsBody>,
) -> Result<Json<Envelope<SettingsView>>, ApiError> {
    let id = request_id.0;

    match service::update_settings(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        body.custom_instructions.as_deref(),
        body.response_language.as_deref(),
    )
    .await
    {
        Ok(row) => Ok(Json(Envelope::data(row.into(), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Execute one tool for the AI service (CHAT-4).
///
/// Service to service: gated by the key, never routable from the internet
/// (OPS-6). A refusal answers in the standard error envelope and the AI
/// service relays it to the user as text rather than retrying
/// (docs/api/endpoints.md#internal).
pub async fn execute_tool(
    State(state): State<AppState>,
    _caller: ServiceCaller,
    request_id: RequestId,
    Json(body): Json<ToolBody>,
) -> Result<Json<Envelope<ToolView>>, ApiError> {
    let id = request_id.0;

    let outcome = tools::execute(
        &state.db,
        &state.rates,
        &state.turns,
        state.config.chat_max_tool_amount,
        tools::ToolRequest {
            workspace_id: &body.workspace_id,
            user_id: &body.user_id,
            claimed_role: &body.role,
            session_id: &body.session_id,
            turn_id: &body.turn_id,
            call_id: body.call_id.as_deref(),
            tool: &body.tool,
            args: &body.args,
        },
    )
    .await
    .map_err(|error| ApiError::new(error, id.clone()))?;

    Ok(Json(Envelope::data(
        ToolView {
            ok: true,
            result: outcome.result,
            summary: outcome.summary,
        },
        id,
    )))
}

/// Read an uploaded receipt (AI-1).
///
/// `AuthWrite`, because the only thing a draft is for is creating a
/// transaction, and a member who cannot create one has no use for the
/// model spend. Nothing is persisted either way.
pub async fn parse_receipt(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<ReceiptBody>,
) -> Result<Json<Envelope<ReceiptView>>, ApiError> {
    let id = request_id.0;

    match service::parse_receipt(
        &state.db,
        &state.files,
        &state.ai,
        &id,
        &auth.workspace_id,
        Some(&auth.user_id),
        &body.vault_file_id,
    )
    .await
    {
        Ok(outcome) => Ok(Json(Envelope::data(
            ReceiptView {
                vault_file_id: outcome.vault_file_id,
                draft: outcome.draft,
                quality: outcome.quality,
            },
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

#[cfg(test)]
mod view_tests {
    use super::*;

    #[test]
    fn should_flatten_a_long_message_into_one_line() {
        assert_eq!(preview("  two\nlines  "), "two lines");
    }

    #[test]
    fn should_bound_the_preview() {
        assert_eq!(preview(&"a".repeat(400)).chars().count(), PREVIEW_CHARS);
    }
}
