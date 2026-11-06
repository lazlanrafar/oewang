//! File routes.
//!
//! Bytes travel as base64 inside the OWE1 envelope, never as a signed
//! object-storage URL (D23, VLT-3).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use base64::{engine::general_purpose::STANDARD, Engine};
use oewang_db::repositories::vault::{
    FileFilters, FileKind, FileListRow, FileSort, LinkedTransactionRow,
};
use oewang_domain::{AppError, Envelope, Page, PageMeta};
use serde::{Deserialize, Serialize};

use crate::{
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
    pub tags: Vec<String>,
    /// `false` when no preview can be made; `null` until first asked for.
    pub thumbnail: Option<bool>,
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
            tags: row.tags,
            thumbnail: row.thumbnail,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

/// One row of the vault list (VLT-6).
#[derive(Debug, Serialize)]
pub struct FileListView {
    pub id: String,
    pub name: String,
    pub size: i64,
    pub r#type: String,
    pub tags: Vec<String>,
    pub thumbnail: Option<bool>,
    /// Live transactions carrying this file.
    pub used_by: i64,
    /// `pending` or `failed` while the receipt reader has it queued (D95).
    pub receipt_status: Option<String>,
    pub created_at: String,
}

impl From<FileListRow> for FileListView {
    fn from(row: FileListRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            size: row.size,
            r#type: row.r#type,
            tags: row.tags,
            thumbnail: row.thumbnail,
            used_by: row.used_by,
            receipt_status: row.receipt_status,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

/// A file with the transactions that carry it (VLT-10).
#[derive(Debug, Serialize)]
pub struct FileDetailView {
    #[serde(flatten)]
    pub file: FileView,
    pub used_by: i64,
    pub transactions: Vec<LinkedTransactionView>,
}

#[derive(Debug, Serialize)]
pub struct LinkedTransactionView {
    pub id: String,
    pub name: Option<String>,
    pub date: String,
    pub r#type: String,
    /// A decimal string in the wallet's currency (D12).
    pub amount: String,
    pub currency_code: String,
}

impl From<LinkedTransactionRow> for LinkedTransactionView {
    fn from(row: LinkedTransactionRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            date: row.date.to_rfc3339(),
            r#type: row.r#type,
            amount: row.amount.to_string(),
            currency_code: row.currency_code,
        }
    }
}

#[derive(Debug, Deserialize)]
pub struct FileListQuery {
    pub search: Option<String>,
    /// `image` or `pdf`.
    pub r#type: Option<String>,
    /// `lt1`, `1to5` or `gt5`, in megabytes, as the picker offers them.
    pub size: Option<String>,
    pub tag: Option<String>,
    /// `newest`, `name_asc`, `name_desc`, `size_desc` or `size_asc`.
    pub sort: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

const MB: i64 = 1024 * 1024;

impl FileListQuery {
    fn filters(&self) -> oewang_domain::Result<FileFilters<'_>> {
        let kind = match non_empty(&self.r#type) {
            None => None,
            Some("image") => Some(FileKind::Image),
            Some("pdf") => Some(FileKind::Pdf),
            Some(_) => return Err(AppError::validation([("type", "Use image or pdf.")])),
        };
        let (min_size, max_size) = match non_empty(&self.size) {
            None => (None, None),
            Some("lt1") => (None, Some(MB)),
            Some("1to5") => (Some(MB), Some(5 * MB)),
            Some("gt5") => (Some(5 * MB), None),
            Some(_) => return Err(AppError::validation([("size", "Use lt1, 1to5 or gt5.")])),
        };

        Ok(FileFilters {
            search: non_empty(&self.search),
            kind,
            min_size,
            max_size,
            tag: non_empty(&self.tag),
        })
    }

    fn sort(&self) -> oewang_domain::Result<FileSort> {
        Ok(match non_empty(&self.sort) {
            None | Some("newest") => FileSort::Newest,
            Some("name_asc") => FileSort::NameAsc,
            Some("name_desc") => FileSort::NameDesc,
            Some("size_desc") => FileSort::SizeDesc,
            Some("size_asc") => FileSort::SizeAsc,
            Some(_) => {
                return Err(AppError::validation([(
                    "sort",
                    "Use newest, name_asc, name_desc, size_desc or size_asc.",
                )]))
            }
        })
    }
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

/// Rename, retag, or both. An absent field is left alone.
#[derive(Debug, Deserialize)]
pub struct UpdateBody {
    pub name: Option<String>,
    pub tags: Option<Vec<String>>,
}

#[derive(Debug, Serialize)]
pub struct ThumbnailView {
    pub r#type: &'static str,
    /// Standard base64 of a small square JPEG (D91).
    pub data: String,
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
        auth.actor(),
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

    match service::complete(&state.db, &state.files, auth.actor(), &file_id).await {
        Ok(file) => Ok(Json(Envelope::data(FileView::from(file), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get_file(
    State(state): State<AppState>,
    auth: Auth,
    Path(file_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<FileDetailView>>, ApiError> {
    let id = request_id.0;

    match service::detail(&state.db, &auth.workspace_id, &file_id).await {
        Ok(detail) => Ok(Json(Envelope::data(
            FileDetailView {
                file: FileView::from(detail.file),
                used_by: detail.used_by,
                transactions: detail.transactions.into_iter().map(Into::into).collect(),
            },
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<FileListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<FileListView>>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let sort = query.sort()?;
        let page = Page::new(query.page, query.limit);
        let (rows, total) =
            service::list(&state.db, &auth.workspace_id, &filters, sort, page).await?;
        Ok::<_, AppError>((rows, total, page))
    }
    .await;

    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(Into::into).collect(),
            id,
            PageMeta::new(page.page, page.limit, total.max(0) as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(file_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateBody>,
) -> std::result::Result<Json<Envelope<FileView>>, ApiError> {
    let id = request_id.0;

    match service::update(
        &state.db,
        auth.actor(),
        &file_id,
        body.name.as_deref(),
        body.tags.as_deref(),
    )
    .await
    {
        Ok(file) => Ok(Json(Envelope::data(FileView::from(file), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn thumbnail(
    State(state): State<AppState>,
    auth: Auth,
    Path(file_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ThumbnailView>>, ApiError> {
    let id = request_id.0;

    match service::thumbnail(&state.db, &state.files, &auth.workspace_id, &file_id).await {
        Ok(bytes) => Ok(Json(Envelope::data(
            ThumbnailView {
                r#type: "image/jpeg",
                data: STANDARD.encode(bytes),
            },
            id,
        ))),
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

    match service::delete(&state.db, &state.files, auth.actor(), &file_id).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
