//! Workspace, member and invitation routes.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use oewang_db::repositories::{accounts, tokens, wallets};
use oewang_domain::{AppError, Envelope, Result, Role};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    audit::Actor,
    auth::{
        extractor::{Auth, AuthOwner, AuthUser, AuthWrite},
        service::slugify,
    },
    response::{ApiError, RequestId},
    state::AppState,
    workspaces::{currency, service},
};

#[derive(Debug, Serialize)]
pub struct WorkspaceListItem {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub currency_code: String,
    pub role: String,
}

#[derive(Debug, Serialize)]
pub struct MemberView {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub joined_at: String,
}

#[derive(Debug, Serialize)]
pub struct InvitationView {
    pub id: String,
    pub email: String,
    pub role: String,
    pub expires_at: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateWorkspaceRequest {
    pub name: Option<String>,
    pub country: Option<String>,
    /// Locked once any transaction exists (WAL-6). The lock lives in the
    /// accounts service, where the ledger rules are.
    pub currency_code: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct InviteRequest {
    pub email: String,
    pub role: Role,
}

#[derive(Debug, Serialize)]
pub struct InviteCreated {
    pub id: String,
    pub email: String,
    pub role: String,
    pub expires_at: String,
    /// Returned once, at creation. Never stored and never shown again.
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct AcceptInviteRequest {
    pub token: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateMemberRequest {
    pub role: Role,
}

pub async fn list_workspaces(
    State(state): State<AppState>,
    auth: AuthUser,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<WorkspaceListItem>>>, ApiError> {
    let rows = accounts::list_workspaces_for_user(&state.db, &auth.user_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?;

    let items = rows
        .into_iter()
        .map(|row| WorkspaceListItem {
            id: row.id,
            name: row.name,
            slug: row.slug,
            currency_code: row.currency_code,
            role: row.role,
        })
        .collect();

    Ok(Json(Envelope::data(items, request_id.0)))
}

#[derive(Debug, Deserialize)]
pub struct CreateWorkspaceRequest {
    pub name: String,
    pub currency_code: String,
}

/// Open a new workspace you own (WS-6). The client switches into it with
/// `POST /v1/auth/switch-workspace`, the same as into any other.
pub async fn create_workspace(
    State(state): State<AppState>,
    auth: AuthUser,
    request_id: RequestId,
    Json(body): Json<CreateWorkspaceRequest>,
) -> std::result::Result<(StatusCode, Json<Envelope<WorkspaceListItem>>), ApiError> {
    match crate::auth::account::create_workspace(
        &state.db,
        &auth.user_id,
        &body.name,
        &body.currency_code,
    )
    .await
    {
        Ok(row) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(
                WorkspaceListItem {
                    id: row.id,
                    name: row.name,
                    slug: row.slug,
                    currency_code: row.currency_code,
                    role: Role::Owner.as_str().to_string(),
                },
                request_id.0,
            )),
        )),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

#[derive(Debug, Serialize)]
pub struct CurrentWorkspace {
    #[serde(flatten)]
    pub workspace: WorkspaceListItem,
    /// True once any transaction exists, deleted ones included (WAL-6), so
    /// a settings page can say so before a change is refused.
    pub currency_locked: bool,
}

pub async fn current_workspace(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<CurrentWorkspace>>, ApiError> {
    let workspace = accounts::find_workspace(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?
        .ok_or_else(|| ApiError::new(AppError::NotFound, request_id.0.clone()))?;
    let currency_locked = wallets::workspace_has_transactions(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?;

    Ok(Json(Envelope::data(
        CurrentWorkspace {
            workspace: WorkspaceListItem {
                id: workspace.id,
                name: workspace.name,
                slug: workspace.slug,
                currency_code: workspace.currency_code,
                role: auth.role.as_str().to_string(),
            },
            currency_locked,
        },
        request_id.0,
    )))
}

/// Update name, country and currency.
///
/// The currency goes through the accounts service, which refuses it once the
/// workspace holds a transaction: changing it would silently reinterpret
/// every `base_amount` already written (WAL-6).
pub async fn update_workspace(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<UpdateWorkspaceRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    let result = apply_update(&state, &auth, &body).await;
    result
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn apply_update(
    state: &AppState,
    auth: &AuthWrite,
    body: &UpdateWorkspaceRequest,
) -> Result<()> {
    // The currency moves first. It is the only field with a lock in front of
    // it, and running it last would leave a rename committed behind a
    // rejected currency change.
    if let Some(currency) = body.currency_code.as_deref() {
        crate::accounts::service::update_workspace_currency(&state.db, auth.actor(), currency)
            .await?;
    }

    let name = body
        .name
        .as_deref()
        .map(str::trim)
        .filter(|n| !n.is_empty());

    // A slug is derived from the name, and two workspaces can legitimately
    // share a name. Deriving one without checking produced a 500 from the
    // unique index; find a free one instead.
    let slug = match name {
        Some(name) => Some(free_slug(state, &auth.workspace_id, name).await?),
        None => None,
    };

    accounts::update_workspace(
        &state.db,
        &auth.workspace_id,
        name,
        slug.as_deref(),
        body.country.as_deref(),
    )
    .await
    .map_err(internal)?;

    Ok(())
}

/// The first unused slug for this name, ignoring the workspace itself.
async fn free_slug(state: &AppState, workspace_id: &str, name: &str) -> Result<String> {
    let base = slugify(name);

    if !accounts::slug_taken_by_other(&state.db, &base, workspace_id)
        .await
        .map_err(internal)?
    {
        return Ok(base);
    }

    for suffix in 2..=20 {
        let candidate = format!("{base}-{suffix}");
        if !accounts::slug_taken_by_other(&state.db, &candidate, workspace_id)
            .await
            .map_err(internal)?
        {
            return Ok(candidate);
        }
    }

    // Giving up on a readable slug beats an unbounded wait on a contended
    // name, the same fallback registration uses.
    Ok(format!("{base}-{}", cuid2::create_id()))
}

#[derive(Debug, Deserialize)]
pub struct PreviewQuery {
    pub to: String,
}

#[derive(Debug, Deserialize)]
pub struct ConvertRequest {
    pub currency_code: String,
    /// Units of the new currency per unit of the old, as a decimal string
    /// (D12).
    pub rate: String,
}

/// What converting to `to` would touch, and a rate to start from (WAL-7).
pub async fn currency_preview(
    State(state): State<AppState>,
    auth: AuthOwner,
    Query(query): Query<PreviewQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<currency::Preview>>, ApiError> {
    match currency::preview(&state.db, &auth.workspace_id, &query.to).await {
        Ok(preview) => Ok(Json(Envelope::data(preview, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

/// Reprice the whole ledger into a new workspace currency at one rate
/// (WAL-7, D105). Owner only.
pub async fn convert_currency(
    State(state): State<AppState>,
    auth: AuthOwner,
    request_id: RequestId,
    Json(body): Json<ConvertRequest>,
) -> std::result::Result<Json<Envelope<currency::Converted>>, ApiError> {
    let result = async {
        let rate = body.rate.trim().parse::<Decimal>().map_err(|_| {
            AppError::validation([("rate", "Enter a number, for example 0.00006.")])
        })?;
        let actor = Actor::web(&auth.workspace_id, &auth.user_id);
        currency::convert(&state.db, actor, &body.currency_code, rate).await
    }
    .await;

    match result {
        Ok(converted) => Ok(Json(Envelope::data(converted, request_id.0))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

pub async fn delete_workspace(
    State(state): State<AppState>,
    auth: AuthOwner,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    accounts::soft_delete_workspace(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0))?;
    Ok(StatusCode::NO_CONTENT)
}

pub async fn list_members(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<MemberView>>>, ApiError> {
    let rows = accounts::list_members(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?;

    let members = rows
        .into_iter()
        .map(|row| MemberView {
            user_id: row.user_id,
            email: row.email,
            name: row.name,
            role: row.role,
            joined_at: row.joined_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(Envelope::data(members, request_id.0)))
}

/// Change a member's role. The rules are in the service (WS-3, WS-4).
pub async fn update_member(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(user_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateMemberRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    service::change_role(&state.db, actor(&auth), auth.role, &user_id, body.role)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn remove_member(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(user_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    service::remove(&state.db, actor(&auth), auth.role, &user_id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

pub async fn list_invites(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<InvitationView>>>, ApiError> {
    let rows = tokens::list_pending_invitations(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?;

    let invites = rows
        .into_iter()
        .map(|row| InvitationView {
            id: row.id,
            email: row.email,
            role: row.role,
            expires_at: row.expires_at.to_rfc3339(),
            created_at: row.created_at.to_rfc3339(),
        })
        .collect();

    Ok(Json(Envelope::data(invites, request_id.0)))
}

pub async fn create_invite(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<InviteRequest>,
) -> std::result::Result<(StatusCode, Json<Envelope<InviteCreated>>), ApiError> {
    let invitation =
        match service::invite(&state.db, actor(&auth), auth.role, &body.email, body.role).await {
            Ok(invitation) => invitation,
            Err(error) => return Err(ApiError::new(error, request_id.0)),
        };

    // After the commit: a failed send must not undo the invitation, and the
    // link is in the response for the inviter to pass on by hand.
    state
        .mailer
        .send_workspace_invite(&invitation.email, &invitation.raw_token)
        .await;

    let created = InviteCreated {
        id: invitation.id,
        email: invitation.email,
        role: invitation.role.as_str().to_string(),
        expires_at: invitation.expires_at.to_rfc3339(),
        token: invitation.raw_token,
    };
    Ok((
        StatusCode::CREATED,
        Json(Envelope::data(created, request_id.0)),
    ))
}

pub async fn revoke_invite(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    service::revoke_invite(&state.db, actor(&auth), &id)
        .await
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

#[derive(Debug, Serialize)]
pub struct InviteAccepted {
    /// The workspace joined, so the client can switch into it.
    pub workspace_id: String,
}

/// Accept an invitation addressed to the signed-in user.
pub async fn accept_invite(
    State(state): State<AppState>,
    auth: AuthUser,
    request_id: RequestId,
    Json(body): Json<AcceptInviteRequest>,
) -> std::result::Result<Json<Envelope<InviteAccepted>>, ApiError> {
    match service::accept(&state.db, &auth.user_id, &body.token).await {
        Ok(workspace_id) => Ok(Json(Envelope::data(
            InviteAccepted { workspace_id },
            request_id.0,
        ))),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

fn actor(auth: &AuthWrite) -> Actor<'_> {
    auth.actor()
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
