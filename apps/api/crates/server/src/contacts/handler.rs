//! `/v1/contacts` (CON-1 to CON-4).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use oewang_db::repositories::contacts::{ContactListRow, ContactRow, ContactSort};
use oewang_domain::{AppError, Envelope, Page, PageMeta, Result};
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::{Auth, AuthWrite},
    contacts::service::{self, ContactChange, ContactInput},
    offline::{self, IfMatch},
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub search: Option<String>,
    /// `name` (default) or `created_at`.
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub id: Option<String>,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub note: Option<String>,
}

/// A key left out leaves the field alone; `null` clears it.
#[derive(Debug, Deserialize)]
pub struct UpdateBody {
    pub name: Option<String>,
    #[serde(default, deserialize_with = "explicit_null")]
    pub email: Option<Option<String>>,
    #[serde(default, deserialize_with = "explicit_null")]
    pub phone: Option<Option<String>>,
    #[serde(default, deserialize_with = "explicit_null")]
    pub note: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct MergeBody {
    pub into_id: String,
}

#[derive(Debug, Serialize)]
pub struct ContactView {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub note: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub debt_count: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub open_debt_count: Option<i64>,
    pub created_at: String,
    /// The row's version: send it back verbatim as `If-Match` (D115).
    pub updated_at: String,
}

impl From<ContactRow> for ContactView {
    fn from(row: ContactRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            note: row.note,
            debt_count: None,
            open_debt_count: None,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

impl From<ContactListRow> for ContactView {
    fn from(row: ContactListRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            email: row.email,
            phone: row.phone,
            note: row.note,
            debt_count: Some(row.debt_count),
            open_debt_count: Some(row.open_debt_count),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<ContactView>>>, ApiError> {
    let id = request_id.0;
    let result = async {
        let sort = match non_empty(&query.sort) {
            None | Some("name") => ContactSort::Name,
            Some("created_at") => ContactSort::CreatedAt,
            Some(_) => return Err(AppError::validation([("sort", "Use name or created_at.")])),
        };
        let descending = descending(&query.order)?;
        let page = Page::new(query.page, query.per_page);
        let search = non_empty(&query.search);
        let (rows, total) = service::list(
            &state.db,
            &auth.workspace_id,
            search,
            sort,
            descending,
            page,
        )
        .await?;
        Ok((rows, total, page))
    }
    .await;

    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(Into::into).collect(),
            id,
            PageMeta::new(page.page, page.limit, total as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
    Path(contact_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ContactView>>, ApiError> {
    ok(
        service::find(&state.db, &auth.workspace_id, &contact_id).await,
        request_id,
    )
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<CreateBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<ContactView>>), ApiError> {
    let input = ContactInput {
        name: &body.name,
        email: body.email.as_deref(),
        phone: body.phone.as_deref(),
        note: body.note.as_deref(),
    };
    let result = service::create_with_id(&state.db, auth.actor(), body.id.as_deref(), input).await;
    let id = request_id.0;
    match result {
        Ok((row, made)) => Ok((
            if made {
                StatusCode::CREATED
            } else {
                StatusCode::OK
            },
            Json(Envelope::data(row.into(), id)),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(contact_id): Path<String>,
    request_id: RequestId,
    if_match: IfMatch,
    Json(body): Json<UpdateBody>,
) -> std::result::Result<Json<Envelope<ContactView>>, ApiError> {
    let change = ContactChange {
        name: body.name.as_deref(),
        email: body.email.as_ref().map(|v| v.as_deref()),
        phone: body.phone.as_ref().map(|v| v.as_deref()),
        note: body.note.as_ref().map(|v| v.as_deref()),
    };
    let updated = service::update(&state.db, auth.actor(), &contact_id, change, if_match.0).await;
    let current = async {
        service::find(&state.db, &auth.workspace_id, &contact_id)
            .await
            .map(ContactView::from)
    };
    ok(offline::with_current(updated, current).await, request_id)
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(contact_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    match service::delete(&state.db, auth.actor(), &contact_id).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

pub async fn merge(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(contact_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<MergeBody>,
) -> std::result::Result<Json<Envelope<ContactView>>, ApiError> {
    ok(
        service::merge(&state.db, auth.actor(), &contact_id, body.into_id.trim()).await,
        request_id,
    )
}

fn ok<R, V: From<R>>(
    result: Result<R>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<V>>, ApiError> {
    let id = request_id.0;
    match result {
        Ok(row) => Ok(Json(Envelope::data(V::from(row), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub(crate) fn descending(order: &Option<String>) -> Result<bool> {
    match non_empty(order) {
        None | Some("asc") => Ok(false),
        Some("desc") => Ok(true),
        Some(_) => Err(AppError::validation([("order", "Use asc or desc.")])),
    }
}

pub(crate) fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

/// Absent and `null` are different things in a patch: serde alone fills a
/// missing key with `None`, so a present key is wrapped in `Some`.
pub(crate) fn explicit_null<'de, T, D>(
    deserializer: D,
) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Option::<T>::deserialize(deserializer).map(Some)
}
