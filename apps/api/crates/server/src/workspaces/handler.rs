//! Workspace, member and invitation routes.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use chrono::{Duration, Utc};
use oewang_db::repositories::{accounts, tokens};
use oewang_domain::{
    auth::{normalize_email, validate_email},
    AppError, Envelope, Result, Role,
};
use serde::{Deserialize, Serialize};

use crate::{
    auth::{
        extractor::{Auth, AuthOwner, AuthWrite},
        service::slugify,
        token,
    },
    response::{ApiError, RequestId},
    state::AppState,
};

/// How long an invitation stays usable.
const INVITE_TTL_DAYS: i64 = 7;

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
    auth: Auth,
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

pub async fn current_workspace(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<WorkspaceListItem>>, ApiError> {
    let workspace = accounts::find_workspace(&state.db, &auth.workspace_id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?
        .ok_or_else(|| ApiError::new(AppError::NotFound, request_id.0.clone()))?;

    Ok(Json(Envelope::data(
        WorkspaceListItem {
            id: workspace.id,
            name: workspace.name,
            slug: workspace.slug,
            currency_code: workspace.currency_code,
            role: auth.role.as_str().to_string(),
        },
        request_id.0,
    )))
}

/// Update name and country.
///
/// `currency_code` is deliberately absent from the payload. It is locked
/// once a transaction exists (WAL-6), and the endpoint that can change it
/// arrives with the rule that guards it in US-011.
pub async fn update_workspace(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<UpdateWorkspaceRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    let name = body.name.as_deref().map(str::trim).filter(|n| !n.is_empty());
    let slug = name.map(slugify);

    accounts::update_workspace(
        &state.db,
        &auth.workspace_id,
        name,
        slug.as_deref(),
        body.country.as_deref(),
    )
    .await
    .map_err(|e| ApiError::new(internal(e), request_id.0))?;

    Ok(StatusCode::NO_CONTENT)
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

/// Change a member's role.
///
/// Two rules, both enforced inside one transaction: nobody may grant a role
/// above their own, and the last owner cannot be demoted (WS-4).
pub async fn update_member(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(user_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateMemberRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    let result = change_role(&state, &auth, &user_id, body.role).await;
    result
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn change_role(
    state: &AppState,
    auth: &AuthWrite,
    target_user: &str,
    new_role: Role,
) -> Result<()> {
    if !auth.role.can_grant(new_role) {
        return Err(AppError::InsufficientRole);
    }

    let mut tx = state.db.begin().await.map_err(internal)?;

    let current = accounts::find_membership(&mut *tx, &auth.workspace_id, target_user)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let current_role = current.role.parse::<Role>().map_err(|_| AppError::NotFound)?;

    // Demoting an owner needs the same check as removing one.
    if current_role == Role::Owner && new_role != Role::Owner {
        let owners = accounts::lock_owners(&mut *tx, &auth.workspace_id)
            .await
            .map_err(internal)?;
        if owners.len() <= 1 {
            return Err(AppError::LastOwner);
        }
    }

    accounts::update_membership_role(&mut *tx, &auth.workspace_id, target_user, new_role.as_str())
        .await
        .map_err(internal)?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

pub async fn remove_member(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(user_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let result = remove(&state, &auth, &user_id).await;
    result
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn remove(state: &AppState, auth: &AuthWrite, target_user: &str) -> Result<()> {
    let mut tx = state.db.begin().await.map_err(internal)?;

    let current = accounts::find_membership(&mut *tx, &auth.workspace_id, target_user)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let current_role = current.role.parse::<Role>().map_err(|_| AppError::NotFound)?;

    if current_role == Role::Owner {
        // Locked, so two concurrent removals cannot each see two owners and
        // both proceed to leave none.
        let owners = accounts::lock_owners(&mut *tx, &auth.workspace_id)
            .await
            .map_err(internal)?;
        if owners.len() <= 1 {
            return Err(AppError::LastOwner);
        }
    }

    accounts::soft_delete_membership(&mut *tx, &auth.workspace_id, target_user)
        .await
        .map_err(internal)?;

    // A removed member's sessions end now, not in fifteen minutes.
    tokens::revoke_all_for_user(&mut *tx, target_user)
        .await
        .map_err(internal)?;

    tx.commit().await.map_err(internal)?;
    Ok(())
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
    let result = invite(&state, &auth, &body).await;
    result
        .map(|created| (StatusCode::CREATED, Json(Envelope::data(created, request_id.0.clone()))))
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn invite(state: &AppState, auth: &AuthWrite, body: &InviteRequest) -> Result<InviteCreated> {
    validate_email(&body.email)?;
    if !auth.role.can_grant(body.role) {
        return Err(AppError::InsufficientRole);
    }

    let email = normalize_email(&body.email);
    let invite_token = token::issue_refresh_token();
    let expires_at = Utc::now() + Duration::days(INVITE_TTL_DAYS);
    let id = cuid2::create_id();

    tokens::insert_invitation(
        &state.db,
        &id,
        &auth.workspace_id,
        &email,
        body.role.as_str(),
        // Only the hash is stored, like every other token (AUTH-8).
        &invite_token.hash,
        &auth.user_id,
        expires_at,
    )
    .await
    .map_err(internal)?;

    state
        .mailer
        .send_workspace_invite(&email, &invite_token.raw)
        .await;

    Ok(InviteCreated {
        id,
        email,
        role: body.role.as_str().to_string(),
        expires_at: expires_at.to_rfc3339(),
        token: invite_token.raw,
    })
}

pub async fn revoke_invite(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let affected = tokens::soft_delete_invitation(&state.db, &auth.workspace_id, &id)
        .await
        .map_err(|e| ApiError::new(internal(e), request_id.0.clone()))?;

    if affected == 0 {
        return Err(ApiError::new(AppError::NotFound, request_id.0));
    }
    Ok(StatusCode::NO_CONTENT)
}

/// Accept an invitation.
///
/// The caller must already be signed in: an invite grants membership, not an
/// account. Claiming is a single statement that also marks the invite used,
/// so a token cannot be redeemed twice even concurrently.
pub async fn accept_invite(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Json(body): Json<AcceptInviteRequest>,
) -> std::result::Result<StatusCode, ApiError> {
    let result = accept(&state, &auth, &body.token).await;
    result
        .map(|_| StatusCode::NO_CONTENT)
        .map_err(|error| ApiError::new(error, request_id.0))
}

async fn accept(state: &AppState, auth: &Auth, raw_token: &str) -> Result<()> {
    let mut tx = state.db.begin().await.map_err(internal)?;

    let invitation = tokens::claim_invitation(&mut *tx, &token::hash_token(raw_token))
        .await
        .map_err(internal)?
        .ok_or(AppError::InviteInvalid)?;

    accounts::insert_membership(
        &mut *tx,
        &cuid2::create_id(),
        &invitation.workspace_id,
        &auth.user_id,
        &invitation.role,
    )
    .await
    .map_err(internal)?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
