//! Chat session routes.
//!
//! Every route takes any member: a conversation belongs to the workspace,
//! and a viewer who cannot write transactions can still ask questions
//! (docs/api/endpoints.md#chat).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use oewang_db::repositories::ai::{MessageRow, SessionRow, SessionSummaryRow};
use oewang_domain::{Envelope, Page, PageMeta};
use serde::{Deserialize, Serialize};

use crate::{
    ai::service,
    audit::Actor,
    auth::extractor::Auth,
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
                messages: conversation.messages.into_iter().map(MessageView::from).collect(),
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
        Ok(session) => Ok((StatusCode::CREATED, Json(Envelope::data(session.into(), id)))),
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
