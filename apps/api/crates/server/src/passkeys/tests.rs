//! Service tests for passkeys and for sessions without a workspace.
//!
//! A real authenticator's signature cannot be produced here, so these cover
//! everything around it: who may claim a ceremony, what an unknown or
//! replayed one answers, whose passkey may be removed, and the session a
//! sign-in opens for someone with and without a workspace.

use std::time::Duration;

use oewang_db::repositories::passkeys;
use oewang_domain::{AppError, Role, Secret};
use sqlx::PgPool;
use webauthn_rs::prelude::Webauthn;

use crate::{
    audit::Actor,
    auth::service::{self as auth, SessionContext},
    passkeys::service,
};

const USER: &str = "usr_passkey";
const OTHER: &str = "usr_other";
const WORKSPACE: &str = "ws_passkey";

fn webauthn() -> Webauthn {
    service::relying_party("http://localhost:3000").unwrap()
}

fn secret() -> Secret {
    Secret::new("a-test-signing-secret-at-least-32-characters-long")
}

fn context(secret: &Secret) -> SessionContext<'_> {
    SessionContext {
        jwt_secret: secret,
        access_ttl: Duration::from_secs(900),
        refresh_ttl: Duration::from_secs(3600),
        user_agent: None,
        ip: None,
    }
}

async fn user(pool: &PgPool, id: &str) {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, $1 || '@example.com', 'x')",
    )
    .bind(id)
    .execute(pool)
    .await
    .unwrap();
}

async fn workspace_for(pool: &PgPool, user_id: &str) {
    sqlx::query("INSERT INTO workspaces (id, name, slug) VALUES ($1, 'Home', 'home')")
        .bind(WORKSPACE)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ('m1', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(user_id)
    .execute(pool)
    .await
    .unwrap();
}

/// A passkey row written straight to the table. Its credential is never
/// read by the tests that use it.
async fn passkey_row(pool: &PgPool, id: &str, user_id: &str) {
    passkeys::insert(
        pool,
        id,
        user_id,
        &format!("cred-{id}"),
        &serde_json::json!({}),
        "Laptop",
    )
    .await
    .unwrap();
}

// ------------------------------------------------------------ the handle

#[test]
fn should_derive_a_stable_handle_per_user() {
    assert_eq!(service::user_handle("a"), service::user_handle("a"));
    assert_ne!(service::user_handle("a"), service::user_handle("b"));
}

#[test]
fn should_take_the_relying_party_from_the_app_url() {
    assert!(service::relying_party("https://app.oewang.com").is_ok());
    assert!(service::relying_party("not a url").is_err());
}

// ----------------------------------------------------------- registration

#[sqlx::test(migrations = "../../migrations")]
async fn should_ask_for_a_discoverable_credential(pool: PgPool) {
    user(&pool, USER).await;

    let started = service::start_registration(&pool, &webauthn(), USER)
        .await
        .unwrap();

    let selection = &started.options["authenticatorSelection"];
    assert_eq!(selection["residentKey"], "required");
    assert_eq!(selection["requireResidentKey"], true);
    assert_eq!(started.options["rp"]["id"], "localhost");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_let_only_the_user_who_started_a_registration_claim_it(pool: PgPool) {
    user(&pool, USER).await;
    user(&pool, OTHER).await;
    let started = service::start_registration(&pool, &webauthn(), USER)
        .await
        .unwrap();

    let by_other = passkeys::claim_ceremony(&pool, &started.ceremony_id, "register", Some(OTHER))
        .await
        .unwrap();
    assert!(by_other.is_none());

    let as_sign_in = passkeys::claim_ceremony(&pool, &started.ceremony_id, "authenticate", None)
        .await
        .unwrap();
    assert!(as_sign_in.is_none());

    let by_owner = passkeys::claim_ceremony(&pool, &started.ceremony_id, "register", Some(USER))
        .await
        .unwrap();
    assert!(by_owner.is_some());

    let again = passkeys::claim_ceremony(&pool, &started.ceremony_id, "register", Some(USER))
        .await
        .unwrap();
    assert!(again.is_none(), "a ceremony is claimed once");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_expired_ceremony(pool: PgPool) {
    user(&pool, USER).await;
    let started = service::start_registration(&pool, &webauthn(), USER)
        .await
        .unwrap();
    sqlx::query("UPDATE passkey_ceremonies SET expires_at = now() - interval '1 second'")
        .execute(&pool)
        .await
        .unwrap();

    let claimed = passkeys::claim_ceremony(&pool, &started.ceremony_id, "register", Some(USER))
        .await
        .unwrap();
    assert!(claimed.is_none());
}

// ---------------------------------------------------------------- removal

#[sqlx::test(migrations = "../../migrations")]
async fn should_remove_only_your_own_passkey_and_audit_it(pool: PgPool) {
    user(&pool, USER).await;
    user(&pool, OTHER).await;
    workspace_for(&pool, USER).await;
    passkey_row(&pool, "pk_mine", USER).await;
    passkey_row(&pool, "pk_theirs", OTHER).await;
    let actor = Actor::web(WORKSPACE, USER);

    let error = service::remove(&pool, actor, "pk_theirs")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::NotFound));

    service::remove(&pool, actor, "pk_mine").await.unwrap();
    assert!(service::list(&pool, USER).await.unwrap().is_empty());
    assert_eq!(service::list(&pool, OTHER).await.unwrap().len(), 1);

    let audited: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_logs WHERE action = 'passkey.removed' AND entity_id = 'pk_mine'",
    )
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(audited, 1);

    let error = service::remove(&pool, actor, "pk_mine").await.unwrap_err();
    assert!(matches!(error, AppError::NotFound), "already removed");
}

// ---------------------------------------------------------------- sign in

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_sign_in_whose_ceremony_is_unknown_or_used(pool: PgPool) {
    let secret = secret();
    let started = service::start_sign_in(&pool, &webauthn()).await.unwrap();
    assert!(started.options["challenge"].is_string());

    // Used up by a first answer, whatever that answer was.
    passkeys::claim_ceremony(&pool, &started.ceremony_id, "authenticate", None)
        .await
        .unwrap()
        .unwrap();

    let credential = serde_json::from_value(serde_json::json!({
        "id": "AAAA",
        "rawId": "AAAA",
        "response": {
            "authenticatorData": "AAAA",
            "clientDataJSON": "AAAA",
            "signature": "AAAA",
            "userHandle": "AAAA"
        },
        "type": "public-key"
    }))
    .unwrap();

    for ceremony in [started.ceremony_id.as_str(), "unknown"] {
        let error =
            service::finish_sign_in(&pool, &webauthn(), ceremony, &credential, context(&secret))
                .await
                .err()
                .unwrap();
        assert!(matches!(error, AppError::InvalidCredentials), "{ceremony}");
    }
}

// ------------------------------------------------- sessions, no workspace

#[sqlx::test(migrations = "../../migrations")]
async fn should_open_a_session_without_a_workspace_for_a_new_user(pool: PgPool) {
    let secret = secret();
    let issued = auth::register(
        &pool,
        "new@example.com",
        "a-long-enough-password",
        None,
        context(&secret),
    )
    .await
    .unwrap();

    assert_eq!(issued.workspace_id, None);
    assert_eq!(issued.role, None);

    let workspaces: i64 = sqlx::query_scalar("SELECT count(*) FROM workspaces")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(workspaces, 0, "signing up makes no workspace");

    // A refresh keeps it without one.
    let refreshed = auth::refresh(&pool, &issued.refresh_token, context(&secret))
        .await
        .unwrap();
    assert_eq!(refreshed.workspace_id, None);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_scope_a_sign_in_to_the_first_workspace_when_there_is_one(pool: PgPool) {
    let secret = secret();
    user(&pool, USER).await;

    let without = auth::sign_in(&pool, USER, context(&secret)).await.unwrap();
    assert_eq!(without.workspace_id, None);

    workspace_for(&pool, USER).await;
    let with = auth::sign_in(&pool, USER, context(&secret)).await.unwrap();
    assert_eq!(with.workspace_id.as_deref(), Some(WORKSPACE));
    assert_eq!(with.role, Some(Role::Owner));
}
