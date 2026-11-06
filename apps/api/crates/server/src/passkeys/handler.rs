//! Passkey routes (D110).
//!
//! Managing passkeys belongs to a signed-in person in a workspace, so the
//! change is audited where they act, as a profile change is. Signing in
//! with one is public, like the password form.

use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    Json,
};
use oewang_db::repositories::passkeys::PasskeyRow;
use oewang_domain::Envelope;
use serde::{Deserialize, Serialize};
use serde_json::Value;
use webauthn_rs::prelude::{PublicKeyCredential, RegisterPublicKeyCredential};

use crate::{
    auth::{
        extractor::Auth,
        handler::{session_context, SessionResponse},
    },
    passkeys::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct PasskeyView {
    pub id: String,
    pub name: String,
    pub created_at: String,
    pub last_used_at: Option<String>,
}

impl From<PasskeyRow> for PasskeyView {
    fn from(row: PasskeyRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            created_at: row.created_at.to_rfc3339(),
            last_used_at: row.last_used_at.map(|at| at.to_rfc3339()),
        }
    }
}

/// The first half of a ceremony: what the browser passes to
/// `navigator.credentials`, and the ID that finishes it.
#[derive(Debug, Serialize)]
pub struct CeremonyView {
    pub ceremony_id: String,
    pub options: Value,
}

impl From<service::Started> for CeremonyView {
    fn from(started: service::Started) -> Self {
        Self {
            ceremony_id: started.ceremony_id,
            options: started.options,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct FinishRegistrationRequest {
    pub ceremony_id: String,
    pub name: Option<String>,
    pub credential: RegisterPublicKeyCredential,
}

#[derive(Debug, Deserialize)]
pub struct FinishSignInRequest {
    pub ceremony_id: String,
    pub credential: PublicKeyCredential,
}

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<Vec<PasskeyView>>>, ApiError> {
    service::list(&state.db, &auth.user_id)
        .await
        .map(|rows| {
            Json(Envelope::data(
                rows.into_iter().map(PasskeyView::from).collect(),
                request_id.0.clone(),
            ))
        })
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn start_registration(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> Result<Json<Envelope<CeremonyView>>, ApiError> {
    service::start_registration(&state.db, &state.webauthn, &auth.user_id)
        .await
        .map(|started| Json(Envelope::data(started.into(), request_id.0.clone())))
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn finish_registration(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<FinishRegistrationRequest>,
) -> Result<(StatusCode, Json<Envelope<PasskeyView>>), ApiError> {
    service::finish_registration(
        &state.db,
        &state.webauthn,
        auth.actor(),
        &body.ceremony_id,
        body.name.as_deref(),
        &body.credential,
    )
    .await
    .map(|row| {
        (
            StatusCode::CREATED,
            Json(Envelope::data(row.into(), request_id.0.clone())),
        )
    })
    .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn remove(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Path(id): Path<String>,
) -> Result<StatusCode, ApiError> {
    service::remove(&state.db, auth.actor(), &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn start_sign_in(
    State(state): State<AppState>,
    request_id: RequestId,
) -> Result<Json<Envelope<CeremonyView>>, ApiError> {
    service::start_sign_in(&state.db, &state.webauthn)
        .await
        .map(|started| Json(Envelope::data(started.into(), request_id.0.clone())))
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn finish_sign_in(
    State(state): State<AppState>,
    request_id: RequestId,
    headers: HeaderMap,
    Json(body): Json<FinishSignInRequest>,
) -> Result<Json<Envelope<SessionResponse>>, ApiError> {
    let context = session_context(&state, &headers);

    service::finish_sign_in(
        &state.db,
        &state.webauthn,
        &body.ceremony_id,
        &body.credential,
        context,
    )
    .await
    .map(|issued| Json(Envelope::data(issued.into(), request_id.0.clone())))
    .map_err(|error| ApiError::new(error, request_id.0))
}
