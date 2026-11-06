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

// ------------------------------------------------------------------- OAuth

use crate::mcp::oauth::{self, Failure};

/// An OAuth answer: the result, or `{error, error_description}` in RFC
/// 6749's shape for the app's relay to send with a 400.
fn oauth_answer<T: Serialize>(
    result: Result<T, Failure>,
    request_id: String,
) -> Result<Json<Envelope<Value>>, ApiError> {
    match result {
        Ok(value) => Ok(Json(Envelope::data(
            serde_json::to_value(value).unwrap_or(Value::Null),
            request_id,
        ))),
        Err(Failure::OAuth(error)) => Ok(Json(Envelope::data(
            serde_json::json!({ "error": error.error, "error_description": error.description }),
            request_id,
        ))),
        Err(Failure::App(error)) => Err(ApiError::new(error, request_id)),
    }
}

#[derive(Debug, Deserialize)]
pub struct RegisterBody {
    pub client_name: Option<String>,
    #[serde(default)]
    pub redirect_uris: Vec<String>,
}

/// Dynamic client registration (RFC 7591). No caller identity: a client
/// registers before anyone has approved it.
pub async fn register_client(
    State(state): State<AppState>,
    request_id: RequestId,
    Json(body): Json<RegisterBody>,
) -> Result<Json<Envelope<Value>>, ApiError> {
    let result = oauth::register(&state.db, body.client_name.as_deref(), &body.redirect_uris).await;
    oauth_answer(result, request_id.0)
}

/// What the consent page shows and checks the request against.
pub async fn get_client(
    State(state): State<AppState>,
    _auth: Auth,
    Path(id): Path<String>,
    request_id: RequestId,
) -> Result<Json<Envelope<oauth::ClientView>>, ApiError> {
    match oauth::client(&state.db, &id).await {
        Ok(client) => Ok(Json(Envelope::data(client, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

#[derive(Debug, Deserialize)]
pub struct AuthorizeBody {
    pub client_id: String,
    pub redirect_uri: String,
    pub code_challenge: String,
    pub code_challenge_method: String,
    /// Null or absent: every workspace.
    pub workspace_ids: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct CodeView {
    pub code: String,
}

/// The person approved the app on the consent page.
pub async fn authorize(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<AuthorizeBody>,
) -> Result<Json<Envelope<CodeView>>, ApiError> {
    let consent = oauth::Consent {
        client_id: &body.client_id,
        redirect_uri: &body.redirect_uri,
        code_challenge: &body.code_challenge,
        code_challenge_method: &body.code_challenge_method,
        workspace_ids: body.workspace_ids,
    };
    match oauth::authorize(&state.db, auth.actor(), consent).await {
        Ok(code) => Ok(Json(Envelope::data(CodeView { code }, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

#[derive(Debug, Deserialize)]
pub struct TokenBody {
    pub grant_type: String,
    pub client_id: Option<String>,
    pub code: Option<String>,
    pub redirect_uri: Option<String>,
    pub code_verifier: Option<String>,
    pub refresh_token: Option<String>,
}

/// The token endpoint: a code with its PKCE verifier, or a refresh token.
pub async fn token(
    State(state): State<AppState>,
    request_id: RequestId,
    Json(body): Json<TokenBody>,
) -> Result<Json<Envelope<Value>>, ApiError> {
    let missing = |what: &'static str| {
        Failure::OAuth(oauth::OAuthError {
            error: "invalid_request",
            description: what,
        })
    };
    let client_id = body.client_id.as_deref().unwrap_or_default();
    let result = match body.grant_type.as_str() {
        "authorization_code" => match (
            body.code.as_deref(),
            body.redirect_uri.as_deref(),
            body.code_verifier.as_deref(),
        ) {
            (Some(code), Some(redirect_uri), Some(code_verifier)) if !client_id.is_empty() => {
                oauth::exchange_code(
                    &state.db,
                    oauth::CodeExchange {
                        code,
                        client_id,
                        redirect_uri,
                        code_verifier,
                    },
                )
                .await
            }
            _ => Err(missing(
                "Send code, redirect_uri, code_verifier and client_id.",
            )),
        },
        "refresh_token" => match body.refresh_token.as_deref() {
            Some(refresh) if !client_id.is_empty() => {
                oauth::refresh(&state.db, refresh, client_id).await
            }
            _ => Err(missing("Send refresh_token and client_id.")),
        },
        _ => Err(Failure::OAuth(oauth::OAuthError {
            error: "unsupported_grant_type",
            description: "Use authorization_code or refresh_token.",
        })),
    };
    oauth_answer(result, request_id.0)
}
