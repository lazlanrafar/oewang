//! Receipt queue routes (D95, AI-12).

use axum::{extract::State, http::StatusCode, Json};
use oewang_db::repositories::receipts as jobs;
use oewang_domain::{AppError, Envelope};
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::{Auth, AuthWrite},
    receipts::queue::{self, CHANNEL_WEB},
    response::{ApiError, RequestId},
    state::AppState,
    vault::service as vault,
};

#[derive(Debug, Deserialize)]
pub struct QueueRequest {
    pub vault_file_id: String,
}

#[derive(Debug, Serialize)]
pub struct QueuedView {
    pub id: String,
    pub status: String,
    pub next_attempt_at: String,
}

#[derive(Debug, Serialize)]
pub struct NoticeView {
    pub id: String,
    /// `done` or `failed`.
    pub status: String,
    pub code: Option<String>,
    pub file_name: String,
    pub transaction_id: Option<String>,
    pub transaction_name: Option<String>,
    /// A decimal string in the wallet's currency (D12).
    pub amount: Option<String>,
    pub currency_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct SeenRequest {
    pub ids: Vec<String>,
}

/// Queue a receipt the reader could not answer for, so nobody has to upload
/// it again. `AuthWrite`, because the job ends in a saved transaction.
pub async fn queue_receipt(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<QueueRequest>,
) -> std::result::Result<(StatusCode, Json<Envelope<QueuedView>>), ApiError> {
    let id = request_id.0;

    let result = async {
        // The workspace filter and the ready check are the vault's own.
        let file = vault::find(&state.db, &auth.workspace_id, &body.vault_file_id).await?;
        if file.status != "ready" {
            return Err(AppError::FileNotFound);
        }
        queue::enqueue(
            &state,
            &auth.workspace_id,
            &auth.user_id,
            &file.id,
            CHANNEL_WEB,
            None,
        )
        .await
    }
    .await;

    match result {
        Ok(job) => Ok((
            StatusCode::ACCEPTED,
            Json(Envelope::data(
                QueuedView {
                    id: job.id,
                    status: job.status,
                    next_attempt_at: job.next_attempt_at.to_rfc3339(),
                },
                id,
            )),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Queued web receipts that have ended and not been told yet.
pub async fn notices(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<NoticeView>>>, ApiError> {
    match jobs::unseen_notices(&state.db, &auth.workspace_id, &auth.user_id).await {
        Ok(rows) => Ok(Json(Envelope::data(
            rows.into_iter()
                .map(|row| NoticeView {
                    id: row.id,
                    status: row.status,
                    code: row.last_error,
                    file_name: row.file_name,
                    transaction_id: row.transaction_id,
                    transaction_name: row.transaction_name,
                    amount: row.amount.map(|amount| amount.to_string()),
                    currency_code: row.currency_code,
                })
                .collect(),
            request_id.0,
        ))),
        Err(error) => Err(ApiError::new(
            AppError::Internal(anyhow::anyhow!(error)),
            request_id.0,
        )),
    }
}

pub async fn mark_seen(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<SeenRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    jobs::mark_seen(&state.db, &auth.workspace_id, &auth.user_id, &body.ids)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(AppError::Internal(anyhow::anyhow!(error)), request_id.0))
}
