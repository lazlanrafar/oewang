//! Members and invitations against a real database: the role rules hold
//! inside the transaction, and each write leaves its audit row.

use oewang_domain::{AppError, Role};
use sqlx::PgPool;

use crate::{audit::Actor, workspaces::service};

const WORKSPACE: &str = "ws_members";
const OWNER: &str = "usr_owner";
const ADMIN: &str = "usr_admin";
const READER: &str = "usr_reader";
const OUTSIDER: &str = "usr_outsider";

async fn fixture(pool: &PgPool) {
    for (id, email) in [
        (OWNER, "owner@example.com"),
        (ADMIN, "admin@example.com"),
        (READER, "reader@example.com"),
        (OUTSIDER, "Outsider@Example.com"),
    ] {
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')")
            .bind(id)
            .bind(email)
            .execute(pool)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $1, $1, 'IDR')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    for (user, role) in [(OWNER, "owner"), (ADMIN, "admin"), (READER, "member")] {
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
             VALUES ($1 || '_m', $2, $1, $3)",
        )
        .bind(user)
        .bind(WORKSPACE)
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    }
}

fn as_user(user: &'static str) -> Actor<'static> {
    Actor::web(WORKSPACE, user)
}

async fn role_of(pool: &PgPool, user: &str) -> Option<String> {
    sqlx::query_scalar(
        "SELECT role FROM user_workspaces
         WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL",
    )
    .bind(WORKSPACE)
    .bind(user)
    .fetch_optional(pool)
    .await
    .unwrap()
}

async fn audit_actions(pool: &PgPool) -> Vec<String> {
    sqlx::query_scalar(
        "SELECT action FROM audit_logs WHERE workspace_id = $1 ORDER BY created_at, id",
    )
    .bind(WORKSPACE)
    .fetch_all(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_owners_out_of_an_admins_reach(pool: PgPool) {
    fixture(&pool).await;

    let demote = service::change_role(&pool, as_user(ADMIN), Role::Admin, OWNER, Role::Member)
        .await
        .unwrap_err();
    assert!(matches!(demote, AppError::InsufficientRole));
    let remove = service::remove(&pool, as_user(ADMIN), Role::Admin, OWNER)
        .await
        .unwrap_err();
    assert!(matches!(remove, AppError::InsufficientRole));
    let mint = service::change_role(&pool, as_user(ADMIN), Role::Admin, READER, Role::Owner)
        .await
        .unwrap_err();
    assert!(matches!(mint, AppError::InsufficientRole));
    assert_eq!(role_of(&pool, OWNER).await.as_deref(), Some("owner"));

    // The only owner cannot step down either.
    let last = service::change_role(&pool, as_user(OWNER), Role::Owner, OWNER, Role::Admin)
        .await
        .unwrap_err();
    assert!(matches!(last, AppError::LastOwner));
    assert!(audit_actions(&pool).await.is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_change_and_remove_a_member_with_an_audit_row_each(pool: PgPool) {
    fixture(&pool).await;

    service::change_role(&pool, as_user(ADMIN), Role::Admin, READER, Role::Admin)
        .await
        .unwrap();
    assert_eq!(role_of(&pool, READER).await.as_deref(), Some("admin"));
    service::remove(&pool, as_user(OWNER), Role::Owner, READER)
        .await
        .unwrap();
    assert_eq!(role_of(&pool, READER).await, None);

    assert_eq!(
        audit_actions(&pool).await,
        ["member.role_changed", "member.removed"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_admit_only_the_invited_address(pool: PgPool) {
    fixture(&pool).await;

    let invitation = service::invite(
        &pool,
        as_user(ADMIN),
        Role::Admin,
        "outsider@example.com",
        Role::Member,
    )
    .await
    .unwrap();

    // Someone else holding the link is refused, and the link survives.
    let stolen = service::accept(&pool, READER, &invitation.raw_token)
        .await
        .unwrap_err();
    assert!(matches!(stolen, AppError::InviteInvalid));

    // The address matches regardless of case.
    let joined = service::accept(&pool, OUTSIDER, &invitation.raw_token)
        .await
        .unwrap();
    assert_eq!(joined, WORKSPACE);
    assert_eq!(role_of(&pool, OUTSIDER).await.as_deref(), Some("member"));

    // Used once, gone.
    assert!(matches!(
        service::accept(&pool, OUTSIDER, &invitation.raw_token).await,
        Err(AppError::InviteInvalid)
    ));
    assert_eq!(
        audit_actions(&pool).await,
        ["member.invited", "member.joined"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_demote_a_member_who_accepts_an_invite(pool: PgPool) {
    fixture(&pool).await;

    let invitation = service::invite(
        &pool,
        as_user(OWNER),
        Role::Owner,
        "outsider@example.com",
        Role::Admin,
    )
    .await
    .unwrap();
    service::accept(&pool, OUTSIDER, &invitation.raw_token)
        .await
        .unwrap();
    service::change_role(&pool, as_user(OWNER), Role::Owner, OUTSIDER, Role::Owner)
        .await
        .unwrap();

    // An old member-level invite, accepted later, changes nothing.
    let stale = service::invite(
        &pool,
        as_user(OWNER),
        Role::Owner,
        "someone@example.com",
        Role::Member,
    )
    .await
    .unwrap();
    sqlx::query("UPDATE workspace_invitations SET email = 'outsider@example.com' WHERE id = $1")
        .bind(&stale.id)
        .execute(&pool)
        .await
        .unwrap();
    service::accept(&pool, OUTSIDER, &stale.raw_token)
        .await
        .unwrap();
    assert_eq!(role_of(&pool, OUTSIDER).await.as_deref(), Some("owner"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_member_and_replace_a_pending_invite(pool: PgPool) {
    fixture(&pool).await;

    // `Invitation` is not `Debug` on purpose: it carries a raw token.
    let member = service::invite(
        &pool,
        as_user(OWNER),
        Role::Owner,
        "READER@example.com",
        Role::Member,
    )
    .await;
    assert!(matches!(member, Err(AppError::Validation(ref f)) if f.contains_key("email")));

    let first = service::invite(
        &pool,
        as_user(OWNER),
        Role::Owner,
        "outsider@example.com",
        Role::Member,
    )
    .await
    .unwrap();
    let second = service::invite(
        &pool,
        as_user(OWNER),
        Role::Owner,
        "outsider@example.com",
        Role::Admin,
    )
    .await
    .unwrap();
    assert!(matches!(
        service::accept(&pool, OUTSIDER, &first.raw_token).await,
        Err(AppError::InviteInvalid)
    ));

    service::revoke_invite(&pool, as_user(OWNER), &second.id)
        .await
        .unwrap();
    assert!(matches!(
        service::accept(&pool, OUTSIDER, &second.raw_token).await,
        Err(AppError::InviteInvalid)
    ));
    assert_eq!(
        audit_actions(&pool).await,
        ["member.invited", "member.invited", "member.invite_revoked"]
    );
}
