//! Auth routes.
//!
//! Handlers parse, validate and map to HTTP. Nothing else. The rules live in
//! `service`, the SQL in the repositories.

use axum::{
    extract::State,
    http::{header, HeaderMap, StatusCode},
    Json,
};
use oewang_db::repositories::accounts;
use oewang_domain::{AppError, Envelope, Result, Role};
use serde::{Deserialize, Serialize};

use crate::{
    auth::{
        extractor::Auth,
        service::{self, SessionContext},
    },
    response::{ApiError, RequestId},
    state::AppState,
};

// ------------------------------------------------------------- payloads

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub email: String,
    pub password: String,
    pub name: Option<String>,
    pub workspace_name: String,
}

#[derive(Debug, Deserialize)]
pub struct LoginRequest {
    pub email: String,
    pub password: String,
}

#[derive(Debug, Deserialize)]
pub struct RefreshRequest {
    pub refresh_token: String,
}

#[derive(Debug, Deserialize)]
pub struct SwitchWorkspaceRequest {
    pub workspace_id: String,
}

#[derive(Debug, Deserialize)]
pub struct ForgotPasswordRequest {
    pub email: String,
}

#[derive(Debug, Deserialize)]
pub struct ResetPasswordRequest {
    pub token: String,
    pub password: String,
}

#[derive(Debug, Serialize)]
pub struct SessionResponse {
    pub access_token: String,
    pub access_expires_at: i64,
    pub refresh_token: String,
    pub refresh_expires_at: i64,
    pub user_id: String,
    pub workspace_id: String,
    pub role: Role,
}

impl From<service::IssuedSession> for SessionResponse {
    fn from(issued: service::IssuedSession) -> Self {
        Self {
            access_token: issued.access_token,
            access_expires_at: issued.access_expires_at,
            refresh_token: issued.refresh_token,
            refresh_expires_at: issued.refresh_expires_at,
            user_id: issued.user_id,
            workspace_id: issued.workspace_id,
            role: issued.role,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct MeResponse {
    pub user: UserView,
    pub workspace: WorkspaceView,
    pub role: Role,
}

#[derive(Debug, Serialize)]
pub struct UserView {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceView {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub currency_code: String,
}

#[derive(Debug, Serialize)]
pub struct SessionListItem {
    pub id: String,
    pub user_agent: Option<String>,
    pub ip: Option<String>,
    pub created_at: String,
    pub expires_at: String,
}

// ------------------------------------------------------------- handlers

pub async fn register(
    State(state): State<AppState>,
    request_id: RequestId,
    headers: HeaderMap,
    Json(body): Json<RegisterRequest>,
) -> std::result::Result<(StatusCode, Json<Envelope<SessionResponse>>), ApiError> {
    let context = session_context(&state, &headers);

    let issued = service::register(
        &state.db,
        &body.email,
        &body.password,
        body.name.as_deref(),
        &body.workspace_name,
        context,
    )
    .await
    .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok((
        StatusCode::CREATED,
        Json(Envelope::data(issued.into(), request_id.0)),
    ))
}

pub async fn login(
    State(state): State<AppState>,
    request_id: RequestId,
    headers: HeaderMap,
    Json(body): Json<LoginRequest>,
) -> std::result::Result<Json<Envelope<SessionResponse>>, ApiError> {
    let context = session_context(&state, &headers);

    let issued = service::login(&state.db, &body.email, &body.password, context)
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(issued.into(), request_id.0)))
}

pub async fn refresh(
    State(state): State<AppState>,
    request_id: RequestId,
    headers: HeaderMap,
    Json(body): Json<RefreshRequest>,
) -> std::result::Result<Json<Envelope<SessionResponse>>, ApiError> {
    let context = session_context(&state, &headers);

    let issued = service::refresh(&state.db, &body.refresh_token, context)
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(issued.into(), request_id.0)))
}

pub async fn logout(
    State(state): State<AppState>,
    request_id: RequestId,
    Json(body): Json<RefreshRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    service::logout(&state.db, &body.refresh_token)
        .await
        .map_err(|error| ApiError::new(error, request_id.0))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn logout_all(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    service::logout_everywhere(&state.db, &auth.user_id)
        .await
        .map_err(|error| ApiError::new(error, request_id.0))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn me(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<MeResponse>>, ApiError> {
    let result = load_me(&state, &auth).await;
    result
        .map(|view| Json(Envelope::data(view, request_id.0.clone())))
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn load_me(state: &AppState, auth: &Auth) -> Result<MeResponse> {
    let user = accounts::find_user_by_id(&state.db, &auth.user_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .ok_or(AppError::Unauthenticated)?;

    let workspace = accounts::find_workspace(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .ok_or(AppError::NotFound)?;

    // Read live rather than echoing the token's snapshot, so the UI shows
    // the role the user actually has.
    let role = service::current_role(&state.db, &auth.workspace_id, &auth.user_id).await?;

    Ok(MeResponse {
        user: UserView {
            id: user.id,
            email: user.email,
            name: user.name,
        },
        workspace: WorkspaceView {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            currency_code: workspace.currency_code,
        },
        role,
    })
}

pub async fn switch_workspace(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    headers: HeaderMap,
    Json(body): Json<SwitchWorkspaceRequest>,
) -> std::result::Result<Json<Envelope<SessionResponse>>, ApiError> {
    let context = session_context(&state, &headers);

    let issued = service::switch_workspace(&state.db, &auth.user_id, &body.workspace_id, context)
        .await
        .map_err(|error| ApiError::new(error, request_id.0.clone()))?;

    Ok(Json(Envelope::data(issued.into(), request_id.0)))
}

pub async fn sessions(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<SessionListItem>>>, ApiError> {
    let rows = oewang_db::repositories::tokens::list_sessions(&state.db, &auth.user_id)
        .await
        .map_err(|e| ApiError::new(AppError::Internal(anyhow::anyhow!(e)), request_id.0.clone()))?;

    let items = rows
        .into_iter()
        .map(|row| SessionListItem {
            id: row.id,
            user_agent: row.user_agent,
            ip: row.ip,
            created_at: row.created_at.to_rfc3339(),
            expires_at: row.expires_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(Envelope::data(items, request_id.0)))
}

/// Always 204, whether or not the address exists (AUTH-10).
///
/// The only way to tell is to receive the email, which is the point.
pub async fn forgot_password(
    State(state): State<AppState>,
    request_id: RequestId,
    Json(body): Json<ForgotPasswordRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    let outcome = service::begin_password_reset(&state.db, &body.email)
        .await
        .map_err(|error| ApiError::new(error, request_id.0))?;

    if let Some((email, raw_token)) = outcome {
        state.mailer.send_password_reset(&email, &raw_token).await;
    }

    Ok(StatusCode::NO_CONTENT)
}

pub async fn reset_password(
    State(state): State<AppState>,
    request_id: RequestId,
    Json(body): Json<ResetPasswordRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    service::complete_password_reset(&state.db, &body.token, &body.password)
        .await
        .map_err(|error| ApiError::new(error, request_id.0))?;
    Ok(StatusCode::NO_CONTENT)
}

// ------------------------------------------------------------- internals

fn session_context<'a>(state: &'a AppState, headers: &'a HeaderMap) -> SessionContext<'a> {
    SessionContext {
        jwt_secret: &state.config.jwt_secret,
        access_ttl: state.config.access_token_ttl,
        refresh_ttl: state.config.refresh_token_ttl,
        user_agent: headers
            .get(header::USER_AGENT)
            .and_then(|value| value.to_str().ok()),
        // Set by the reverse proxy. Shown in the session list, never used for
        // authorization, because a client can claim anything here.
        ip: headers
            .get("x-forwarded-for")
            .and_then(|value| value.to_str().ok())
            .and_then(|value| value.split(',').next())
            .map(str::trim),
    }
}
