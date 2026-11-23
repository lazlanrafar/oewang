//! Device token routes (PUSH-1).
//!
//! The token travels in the body on both routes, never in the path: it is
//! long, and a path ends up in access logs.

use axum::{extract::State, http::StatusCode, Json};
use oewang_db::repositories::push::DeviceRow;
use oewang_domain::Envelope;
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::Auth,
    push::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct RegisterRequest {
    pub token: String,
    pub platform: String,
}

#[derive(Debug, Deserialize)]
pub struct RemoveRequest {
    pub token: String,
}

#[derive(Debug, Serialize)]
pub struct DeviceView {
    pub id: String,
    pub platform: String,
    pub created_at: String,
    pub last_seen_at: String,
}

impl From<DeviceRow> for DeviceView {
    fn from(row: DeviceRow) -> Self {
        Self {
            id: row.id,
            platform: row.platform,
            created_at: row.created_at.to_rfc3339(),
            last_seen_at: row.last_seen_at.to_rfc3339(),
        }
    }
}

pub async fn register(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<RegisterRequest>,
) -> Result<(StatusCode, Json<Envelope<DeviceView>>), ApiError> {
    service::register(&state.db, auth.actor(), &body.token, &body.platform)
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
    Json(body): Json<RemoveRequest>,
) -> Result<StatusCode, ApiError> {
    service::remove(&state.db, auth.actor(), &body.token)
        .await
        .map(|()| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}
