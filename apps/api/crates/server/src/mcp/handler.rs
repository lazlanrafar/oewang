//! `/v1/mcp` and the account area's token routes (D106).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use oewang_db::repositories::mcp::McpTokenRow;
use oewang_domain::Envelope;
use serde::{Deserialize, Serialize};
use serde_json::Value;

use crate::{
    auth::extractor::Auth,
    mcp::{caller::McpCaller, protocol, tokens},
    response::{ApiError, RequestId},
    state::AppState,
};

/// One JSON-RPC message, relayed by the app's `/mcp` route. The answer is
/// the JSON-RPC response as `data`, or null for a notification.
pub async fn rpc(
    State(state): State<AppState>,
    caller: McpCaller,
    request_id: RequestId,
    Json(message): Json<Value>,
) -> Json<Envelope<Option<Value>>> {
    let answer = protocol::handle(&state, &caller, &request_id.0, message).await;
    Json(Envelope::data(answer, request_id.0))
}

#[derive(Debug, Serialize)]
pub struct TokenView {
    pub id: String,
    pub kind: String,
    pub name: String,
    pub client_id: Option<String>,
    pub token_prefix: String,
    /// Null is every workspace.
    pub workspace_ids: Option<Vec<String>>,
    pub expires_at: Option<String>,
    pub last_used_at: Option<String>,
    pub created_at: String,
}

impl From<McpTokenRow> for TokenView {
    fn from(row: McpTokenRow) -> Self {
        Self {
            id: row.id,
            kind: row.kind,
            name: row.name,
            client_id: row.client_id,
            token_prefix: row.token_prefix,
            workspace_ids: row.workspace_ids,
            expires_at: row.expires_at.map(|at| at.to_rfc3339()),
            last_used_at: row.last_used_at.map(|at| at.to_rfc3339()),
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct CreatedView {
    #[serde(flatten)]
    pub token: TokenView,
    /// The raw token, shown once, at creation.
    pub secret: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub name: String,
    /// Null or absent: every workspace.
    pub workspace_ids: Option<Vec<String>>,
    /// 30, 90 or 365; null never expires.
    pub expires_in_days: Option<i64>,
}

pub async fn list_tokens(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<Vec<TokenView>>>, ApiError> {
    list(&state, &auth, "pat", request_id).await
}

pub async fn list_connections(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<Vec<TokenView>>>, ApiError> {
    list(&state, &auth, "oauth", request_id).await
}

async fn list(
    state: &AppState,
    auth: &Auth,
    kind: &str,
    request_id: RequestId,
) -> Result<Json<Envelope<Vec<TokenView>>>, ApiError> {
    match tokens::list(&state.db, &auth.user_id, kind).await {
        Ok(rows) => Ok(Json(Envelope::data(
            rows.into_iter().map(TokenView::from).collect(),
            request_id.0,
        ))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

pub async fn create_token(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<CreateBody>,
) -> Result<(StatusCode, Json<Envelope<CreatedView>>), ApiError> {
    match tokens::create(
        &state.db,
        auth.actor(),
        &body.name,
        body.workspace_ids,
        body.expires_in_days,
    )
    .await
    {
        Ok(created) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(
                CreatedView {
                    token: created.row.into(),
                    secret: created.raw,
                },
                request_id.0,
            )),
        )),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

/// Revoke a token or disconnect an app: both are rows of the same table.
pub async fn revoke(
    State(state): State<AppState>,
    auth: Auth,
    Path(id): Path<String>,
    request_id: RequestId,
) -> Result<StatusCode, ApiError> {
    match tokens::revoke(&state.db, auth.actor(), &id).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}
