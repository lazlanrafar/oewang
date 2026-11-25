//! `/v1/console/*` handlers (CSL).

use axum::{
    extract::{Path, Query, State},
    Json,
};
use oewang_db::repositories::console::{
    ConsoleUserRow, ConsoleWorkspaceRow, UserSort, WorkspaceSort, WorkspaceStatus,
};
use oewang_domain::{AppError, ConsolePermission, Envelope, Page, PageMeta};
use serde::{Deserialize, Serialize};

use crate::{
    console::{
        operator::Operator,
        service::{self, UserDetail, WorkspaceDetail},
    },
    contacts::handler::{descending, non_empty},
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Serialize)]
pub struct MeView {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: RoleView,
    pub permissions: Vec<ConsolePermission>,
}

#[derive(Debug, Serialize)]
pub struct RoleView {
    pub id: String,
    pub name: String,
}

/// `GET /v1/console/me` (CSL-2). Any operator, whatever their permissions:
/// the app builds its menu from the answer.
pub async fn me(
    operator: Operator,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<MeView>>, ApiError> {
    Ok(Json(Envelope::data(
        MeView {
            id: operator.user_id,
            email: operator.email,
            name: operator.name,
            role: RoleView {
                id: operator.role_id,
                name: operator.role_name,
            },
            permissions: operator.permissions,
        },
        request_id.0,
    )))
}

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub search: Option<String>,
    /// Workspaces only: `active`, `suspended` or `deleted`; absent is all.
    pub status: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

/// `GET /v1/console/users` (CSL-3). Newest first by default.
pub async fn users(
    State(state): State<AppState>,
    operator: Operator,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<ConsoleUserRow>>>, ApiError> {
    operator.require(ConsolePermission::Read)?;
    let id = request_id.0;
    let result = async {
        let (sort, default_desc) = match non_empty(&query.sort) {
            None | Some("created_at") => (UserSort::CreatedAt, true),
            Some("email") => (UserSort::Email, false),
            Some(_) => return Err(AppError::validation([("sort", "Use created_at or email.")])),
        };
        let desc = if query.order.is_some() {
            descending(&query.order)?
        } else {
            default_desc
        };
        let page = Page::new(query.page, query.per_page);
        let (rows, total) =
            service::users(&state.db, non_empty(&query.search), sort, desc, page).await?;
        Ok((rows, total, page))
    }
    .await;
    paged(result, id)
}

/// `GET /v1/console/users/{id}` (CSL-3).
pub async fn user(
    State(state): State<AppState>,
    operator: Operator,
    Path(user_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<UserDetail>>, ApiError> {
    operator.require(ConsolePermission::Read)?;
    match service::user(&state.db, &user_id).await {
        Ok(view) => Ok(Json(Envelope::data(view, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

/// `GET /v1/console/workspaces` (CSL-4). Newest first by default.
pub async fn workspaces(
    State(state): State<AppState>,
    operator: Operator,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<ConsoleWorkspaceRow>>>, ApiError> {
    operator.require(ConsolePermission::Read)?;
    let id = request_id.0;
    let result = async {
        let (sort, default_desc) = match non_empty(&query.sort) {
            None | Some("created_at") => (WorkspaceSort::CreatedAt, true),
            Some("name") => (WorkspaceSort::Name, false),
            Some(_) => return Err(AppError::validation([("sort", "Use created_at or name.")])),
        };
        let status = match non_empty(&query.status) {
            None => None,
            Some("active") => Some(WorkspaceStatus::Active),
            Some("suspended") => Some(WorkspaceStatus::Suspended),
            Some("deleted") => Some(WorkspaceStatus::Deleted),
            Some(_) => {
                return Err(AppError::validation([(
                    "status",
                    "Use active, suspended or deleted.",
                )]))
            }
        };
        let desc = if query.order.is_some() {
            descending(&query.order)?
        } else {
            default_desc
        };
        let page = Page::new(query.page, query.per_page);
        let (rows, total) = service::workspaces(
            &state.db,
            non_empty(&query.search),
            status,
            sort,
            desc,
            page,
        )
        .await?;
        Ok((rows, total, page))
    }
    .await;
    paged(result, id)
}

/// `GET /v1/console/workspaces/{id}` (CSL-4).
pub async fn workspace(
    State(state): State<AppState>,
    operator: Operator,
    Path(workspace_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<WorkspaceDetail>>, ApiError> {
    operator.require(ConsolePermission::Read)?;
    match service::workspace(&state.db, &workspace_id).await {
        Ok(view) => Ok(Json(Envelope::data(view, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

fn paged<T: Serialize>(
    result: oewang_domain::Result<(Vec<T>, i64, Page)>,
    request_id: String,
) -> std::result::Result<Json<Envelope<Vec<T>>>, ApiError> {
    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows,
            request_id,
            PageMeta::new(page.page, page.limit, total as u64),
        ))),
        Err(error) => Err(ApiError::new(error, request_id)),
    }
}

/// `POST /v1/console/workspaces/{id}/suspend` and `/unsuspend` (CSL-5).
pub async fn suspend(
    state: State<AppState>,
    operator: Operator,
    path: Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ConsoleWorkspaceRow>>, ApiError> {
    set_suspended(state, operator, path, request_id, true).await
}

pub async fn unsuspend(
    state: State<AppState>,
    operator: Operator,
    path: Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ConsoleWorkspaceRow>>, ApiError> {
    set_suspended(state, operator, path, request_id, false).await
}

async fn set_suspended(
    State(state): State<AppState>,
    operator: Operator,
    Path(workspace_id): Path<String>,
    request_id: RequestId,
    suspend: bool,
) -> std::result::Result<Json<Envelope<ConsoleWorkspaceRow>>, ApiError> {
    operator.require(ConsolePermission::WorkspacesSuspend)?;
    match service::set_suspended(&state.db, &operator.user_id, &workspace_id, suspend).await {
        Ok(row) => Ok(Json(Envelope::data(row, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

/// `POST /v1/console/workspaces/{id}/restore` (CSL-6).
pub async fn restore(
    State(state): State<AppState>,
    operator: Operator,
    Path(workspace_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ConsoleWorkspaceRow>>, ApiError> {
    operator.require(ConsolePermission::WorkspacesRestore)?;
    match service::restore(&state.db, &operator.user_id, &workspace_id).await {
        Ok(row) => Ok(Json(Envelope::data(row, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

/// `POST /v1/console/users/{id}/disable` and `/enable` (CSL-7).
pub async fn disable(
    state: State<AppState>,
    operator: Operator,
    path: Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ConsoleUserRow>>, ApiError> {
    set_disabled(state, operator, path, request_id, true).await
}

pub async fn enable(
    state: State<AppState>,
    operator: Operator,
    path: Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ConsoleUserRow>>, ApiError> {
    set_disabled(state, operator, path, request_id, false).await
}

async fn set_disabled(
    State(state): State<AppState>,
    operator: Operator,
    Path(user_id): Path<String>,
    request_id: RequestId,
    disable: bool,
) -> std::result::Result<Json<Envelope<ConsoleUserRow>>, ApiError> {
    operator.require(ConsolePermission::UsersDisable)?;
    match service::set_disabled(&state.db, &operator.user_id, &user_id, disable).await {
        Ok(row) => Ok(Json(Envelope::data(row, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}
