//! `POST /v1/feedback` (FB-1).

use axum::{extract::State, http::StatusCode, Json};
use oewang_domain::Envelope;
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::Auth,
    feedback::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct SendBody {
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
}

#[derive(Debug, Serialize)]
pub struct Sent {
    pub id: String,
}

/// Any role may send feedback: a read-only member can still hit a bug.
pub async fn send(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<SendBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<Sent>>), ApiError> {
    let actor = auth.actor();
    match service::send(&state.db, actor, body.kind.trim(), &body.message).await {
        Ok(row) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(Sent { id: row.id }, request_id.0)),
        )),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}
