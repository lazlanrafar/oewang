//! File routes.
//!
//! Bytes travel as base64 inside the OWE1 envelope, never as a signed
//! object-storage URL (D23, VLT-3).

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use oewang_domain::{AppError, Envelope};
use serde::{Deserialize, Serialize};

use crate::{
    audit::Actor,
    auth::extractor::{Auth, AuthWrite},
    response::{ApiError, RequestId},
    state::AppState,
    vault::service::{self, VaultFileRow},
};

#[derive(Debug, Serialize)]
pub struct FileView {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub r#type: String,
    pub sha256: Option<String>,
    pub status: String,
    pub created_at: String,
}

impl From<VaultFileRow> for FileView {
    fn from(row: VaultFileRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            size: row.size,
            r#type: row.r#type,
            sha256: row.sha256,
            status: row.status,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct BegunView {
    pub id: String,
    pub chunk_size: i64,
    pub chunk_count: u32,
    pub status: String,
}

#[derive(Debug, Serialize)]
pub struct ChunkView {
    pub index: u32,
    /// Standard base64. The envelope around it is what keeps it private.
    pub data: String,
}

#[derive(Debug, Deserialize)]
pub struct BeginBody {
    pub filename: String,
    pub content_type: String,
    pub size_bytes: i64,
}

#[derive(Debug, Deserialize)]
pub struct ChunkBody {
    pub data: String,
}

pub async fn begin(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<BeginBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<BegunView>>), ApiError> {
    let id = request_id.0;

    match service::begin(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &body.filename,
        &body.content_type,
        body.size_bytes,
        state.config.uploads_per_day,
        state.config.max_file_bytes,
    )
    .await
    {
        Ok(begun) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(
                BegunView {
                    id: begun.file.id,
                    chunk_size: begun.chunk_size,
                    chunk_count: begun.chunk_count,
                    status: begun.file.status,
                },
                id,
            )),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn put_chunk(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path((file_id, index)): Path<(String, u32)>,
    request_id: RequestId,
    Json(body): Json<ChunkBody>,
) -> std::result::Result<StatusCode, ApiError> {
    let id = request_id.0;

    let result = async {
        let bytes = STANDARD
            .decode(body.data.as_bytes())
            .map_err(|_| AppError::validation([("data", "The chunk is not valid base64.")]))?;

        service::put_chunk(
            &state.db,
            &state.files,
            &auth.workspace_id,
            &file_id,
            index,
            &bytes,
        )
        .await
    }
    .await;

    match result {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn complete(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(file_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<FileView>>, ApiError> {
    let id = request_id.0;

    match service::complete(
        &state.db,
        &state.files,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &file_id,
    )
    .await
    {
        Ok(file) => Ok(Json(Envelope::data(FileView::from(file), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get_file(
    State(state): State<AppState>,
    auth: Auth,
    Path(file_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<FileView>>, ApiError> {
    let id = request_id.0;

    match service::find(&state.db, &auth.workspace_id, &file_id).await {
        Ok(file) => Ok(Json(Envelope::data(FileView::from(file), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get_chunk(
    State(state): State<AppState>,
    auth: Auth,
    Path((file_id, index)): Path<(String, u32)>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ChunkView>>, ApiError> {
    let id = request_id.0;

    match service::read_chunk(&state.db, &state.files, &auth.workspace_id, &file_id, index).await {
        Ok(bytes) => Ok(Json(Envelope::data(
            ChunkView {
                index,
                data: STANDARD.encode(bytes),
            },
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn delete_file(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(file_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let id = request_id.0;

    match service::delete(
        &state.db,
        &state.files,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &file_id,
    )
    .await
    {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
