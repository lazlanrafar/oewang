//! Members and invitations (WS-3, WS-4).
//!
//! The rules, each inside the mutation's own transaction with its audit row
//! (D14, OPS-1):
//! - nobody grants a role above their own;
//! - only an owner acts on an owner, so an admin cannot demote or remove one;
//! - the last owner cannot be demoted or removed;
//! - an invitation is for the address it was sent to, not for whoever holds
//!   the link;
//! - accepting never changes the role of someone already in the workspace.

use chrono::{DateTime, Duration, Utc};
use oewang_db::repositories::{accounts, tokens};
use oewang_domain::{
    auth::{normalize_email, validate_email},
    AppError, Result, Role,
};
use serde_json::json;
use sqlx::{PgPool, Postgres, Transaction};

use crate::{
    audit::{log, Actor},
    auth::token,
};

/// How long an invitation stays usable.
const INVITE_TTL_DAYS: i64 = 7;

/// A new invitation, with the raw token the caller mails and shows once.
pub struct Invitation {
    pub id: String,
    pub email: String,
    pub role: Role,
    pub expires_at: DateTime<Utc>,
    pub raw_token: String,
}

pub async fn change_role(
    pool: &PgPool,
    actor: Actor<'_>,
    actor_role: Role,
    target_user: &str,
    new_role: Role,
) -> Result<()> {
    if !actor_role.can_grant(new_role) {
        return Err(AppError::InsufficientRole);
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let current = target_role(&mut tx, actor, actor_role, target_user).await?;

    // Demoting an owner needs the same check as removing one.
    if current == Role::Owner && new_role != Role::Owner {
        ensure_another_owner(&mut tx, actor.workspace_id).await?;
    }

    accounts::update_membership_role(&mut *tx, actor.workspace_id, target_user, new_role.as_str())
        .await
        .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "member.role_changed",
        "member",
        target_user,
        Some(json!({ "role": current.as_str() })),
        Some(json!({ "role": new_role.as_str() })),
    )
    .await?;

    tx.commit().await.map_err(internal)
}

pub async fn remove(
    pool: &PgPool,
    actor: Actor<'_>,
    actor_role: Role,
    target_user: &str,
) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let current = target_role(&mut tx, actor, actor_role, target_user).await?;

    if current == Role::Owner {
        ensure_another_owner(&mut tx, actor.workspace_id).await?;
    }

    accounts::soft_delete_membership(&mut *tx, actor.workspace_id, target_user)
        .await
        .map_err(internal)?;
    // A removed member's sessions end now, not in fifteen minutes.
    tokens::revoke_all_for_user(&mut *tx, target_user)
        .await
        .map_err(internal)?;
    // And so does any Telegram chat they linked to this workspace (D85).
    crate::telegram::link::revoke_member(&mut *tx, actor.workspace_id, target_user).await?;

    log(
        &mut tx,
        actor,
        "member.removed",
        "member",
        target_user,
        Some(json!({ "role": current.as_str() })),
        None,
    )
    .await?;

    tx.commit().await.map_err(internal)
}

pub async fn invite(
    pool: &PgPool,
    actor: Actor<'_>,
    actor_role: Role,
    email: &str,
    role: Role,
) -> Result<Invitation> {
    validate_email(email)?;
    if !actor_role.can_grant(role) {
        return Err(AppError::InsufficientRole);
    }
    let email = normalize_email(email);

    let mut tx = pool.begin().await.map_err(internal)?;

    if accounts::email_is_member(&mut *tx, actor.workspace_id, &email)
        .await
        .map_err(internal)?
    {
        return Err(AppError::validation([(
            "email",
            "This person is already a member.",
        )]));
    }
    // Inviting again replaces the old link instead of leaving two live.
    tokens::soft_delete_pending_for_email(&mut *tx, actor.workspace_id, &email)
        .await
        .map_err(internal)?;

    let raw = token::issue_refresh_token();
    let expires_at = Utc::now() + Duration::days(INVITE_TTL_DAYS);
    let id = cuid2::create_id();
    tokens::insert_invitation(
        &mut *tx,
        &id,
        actor.workspace_id,
        &email,
        role.as_str(),
        // Only the hash is stored, like every other token (AUTH-8).
        &raw.hash,
        actor.user_id,
        expires_at,
    )
    .await
    .map_err(internal)?;
    log(
        &mut tx,
        actor,
        "member.invited",
        "invitation",
        &id,
        None,
        Some(json!({ "email": email, "role": role.as_str() })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;

    Ok(Invitation {
        id,
        email,
        role,
        expires_at,
        raw_token: raw.raw,
    })
}

pub async fn revoke_invite(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let affected = tokens::soft_delete_invitation(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?;
    if affected == 0 {
        return Err(AppError::NotFound);
    }
    log(
        &mut tx,
        actor,
        "member.invite_revoked",
        "invitation",
        id,
        None,
        None,
    )
    .await?;
    tx.commit().await.map_err(internal)
}

/// Accept an invitation and return the workspace joined.
///
/// The caller must already be signed in: an invite grants membership, not an
/// account. Claiming is a single statement that also marks the invite used,
/// so a token cannot be redeemed twice even concurrently. A refusal rolls the
/// claim back, so the right person can still use the link.
pub async fn accept(pool: &PgPool, user_id: &str, raw_token: &str) -> Result<String> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let invitation = tokens::claim_invitation(&mut *tx, &token::hash_token(raw_token))
        .await
        .map_err(internal)?
        .ok_or(AppError::InviteInvalid)?;
    let user = accounts::find_user_by_id(&mut *tx, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::Unauthenticated)?;
    if normalize_email(&user.email) != normalize_email(&invitation.email) {
        return Err(AppError::InviteInvalid);
    }

    accounts::join_membership(
        &mut *tx,
        &cuid2::create_id(),
        &invitation.workspace_id,
        user_id,
        &invitation.role,
    )
    .await
    .map_err(internal)?;
    log(
        &mut tx,
        Actor::web(&invitation.workspace_id, user_id),
        "member.joined",
        "member",
        user_id,
        None,
        Some(json!({ "invitation_id": invitation.id, "role": invitation.role })),
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(invitation.workspace_id)
}

/// The target's current role, once the actor may act on it at all: an
/// owner is acted on only by an owner.
async fn target_role(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    actor_role: Role,
    target_user: &str,
) -> Result<Role> {
    let membership = accounts::find_membership(&mut **tx, actor.workspace_id, target_user)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let role = membership
        .role
        .parse::<Role>()
        .map_err(|_| AppError::NotFound)?;
    if role == Role::Owner && actor_role != Role::Owner {
        return Err(AppError::InsufficientRole);
    }
    Ok(role)
}

/// Locked, so two concurrent demotions cannot each see two owners and both
/// proceed to leave none (WS-4).
async fn ensure_another_owner(
    tx: &mut Transaction<'_, Postgres>,
    workspace_id: &str,
) -> Result<()> {
    let owners = accounts::lock_owners(&mut **tx, workspace_id)
        .await
        .map_err(internal)?;
    if owners.len() <= 1 {
        return Err(AppError::LastOwner);
    }
    Ok(())
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
