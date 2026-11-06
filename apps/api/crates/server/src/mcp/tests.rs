//! MCP tokens and their reach, against a real database (D106).
//!
//! The tools themselves run the web's handlers, which carry their own
//! tests; what is new here is who a token is and where it may go.

use oewang_db::repositories::mcp;
use oewang_domain::AppError;
use serde_json::json;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    auth::token::hash_token,
    mcp::{caller::McpCaller, service, tokens},
};

const USER: &str = "usr_mcp";
const OTHER_USER: &str = "usr_mcp_other";

async fn fixture(pool: &PgPool) {
    for (id, email) in [(USER, "m@example.com"), (OTHER_USER, "o@example.com")] {
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')")
            .bind(id)
            .bind(email)
            .execute(pool)
            .await
            .unwrap();
    }
    for ws in ["ws_a", "ws_b", "ws_c"] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $1, $1, 'IDR')",
        )
        .bind(ws)
        .execute(pool)
        .await
        .unwrap();
    }
    // USER is in a and b; c belongs to someone else.
    for (ws, user) in [("ws_a", USER), ("ws_b", USER), ("ws_c", OTHER_USER)] {
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ($1 || $2, $1, $2, 'owner')",
        )
        .bind(ws)
        .bind(user)
        .execute(pool)
        .await
        .unwrap();
    }
}

fn actor() -> Actor<'static> {
    Actor::web("ws_a", USER)
}

fn caller(token_id: &str, workspace_ids: Option<Vec<String>>) -> McpCaller {
    McpCaller {
        token_id: token_id.into(),
        user_id: USER.into(),
        workspace_ids,
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_only_the_hash_and_find_a_live_token(pool: PgPool) {
    fixture(&pool).await;
    let created = tokens::create(&pool, actor(), "Claude Code", None, Some(30))
        .await
        .unwrap();
    assert!(created.raw.starts_with(tokens::TOKEN_PREFIX));
    assert_eq!(created.row.token_prefix, &created.raw[..12]);

    let stored: String = sqlx::query_scalar("SELECT token_hash FROM mcp_tokens WHERE id = $1")
        .bind(&created.row.id)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_ne!(stored, created.raw);
    assert!(mcp::find_live(&pool, &hash_token(&created.raw))
        .await
        .unwrap()
        .is_some());

    // Revoked is gone; so is expired.
    tokens::revoke(&pool, actor(), &created.row.id)
        .await
        .unwrap();
    assert!(mcp::find_live(&pool, &hash_token(&created.raw))
        .await
        .unwrap()
        .is_none());
    let old = tokens::create(&pool, actor(), "Old", None, Some(30))
        .await
        .unwrap();
    sqlx::query("UPDATE mcp_tokens SET expires_at = now() - interval '1 second' WHERE id = $1")
        .bind(&old.row.id)
        .execute(&pool)
        .await
        .unwrap();
    assert!(mcp::find_live(&pool, &hash_token(&old.raw))
        .await
        .unwrap()
        .is_none());

    let actions: Vec<String> = sqlx::query_scalar(
        "SELECT action FROM audit_logs WHERE entity = 'mcp_token' ORDER BY created_at, id",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(
        actions,
        [
            "mcp.token_created",
            "mcp.token_revoked",
            "mcp.token_created"
        ]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_grant_outside_the_persons_workspaces(pool: PgPool) {
    fixture(&pool).await;
    for grant in [
        vec![],
        vec!["ws_c".to_string()],
        vec!["ws_a".into(), "ws_zz".into()],
    ] {
        let error = tokens::create(&pool, actor(), "x", Some(grant), None)
            .await
            .err()
            .unwrap();
        assert!(matches!(error, AppError::Validation(ref f) if f.contains_key("workspace_ids")));
    }
    assert!(tokens::create(&pool, actor(), "x", None, Some(7))
        .await
        .is_err());
    // Another person's token cannot be revoked.
    let mine = tokens::create(&pool, actor(), "mine", None, None)
        .await
        .unwrap();
    assert!(matches!(
        tokens::revoke(&pool, Actor::web("ws_c", OTHER_USER), &mine.row.id).await,
        Err(AppError::NotFound)
    ));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_resolve_the_workspace_inside_the_grant_and_the_memberships(pool: PgPool) {
    fixture(&pool).await;

    // One workspace in reach: no argument needed.
    let single = caller("t1", Some(vec!["ws_b".into()]));
    let mut args = json!({});
    assert_eq!(
        service::resolve_workspace(&pool, &single, &mut args)
            .await
            .unwrap(),
        "ws_b"
    );
    let mut outside = json!({ "workspace_id": "ws_a" });
    assert!(matches!(
        service::resolve_workspace(&pool, &single, &mut outside).await,
        Err(AppError::NotAMember)
    ));

    // All workspaces: an argument is required, and only real memberships.
    let all = caller("t2", None);
    assert!(matches!(
        service::resolve_workspace(&pool, &all, &mut json!({})).await,
        Err(AppError::Validation(_))
    ));
    let mut chosen = json!({ "workspace_id": "ws_a", "limit": 5 });
    assert_eq!(
        service::resolve_workspace(&pool, &all, &mut chosen)
            .await
            .unwrap(),
        "ws_a"
    );
    assert_eq!(
        chosen,
        json!({ "limit": 5 }),
        "the workspace is stripped before the tool runs"
    );
    assert!(matches!(
        service::resolve_workspace(&pool, &all, &mut json!({ "workspace_id": "ws_c" })).await,
        Err(AppError::NotAMember)
    ));

    // Leaving a workspace takes it out of an "all" token's reach at once.
    sqlx::query("UPDATE user_workspaces SET deleted_at = now() WHERE workspace_id = 'ws_b' AND user_id = $1")
        .bind(USER)
        .execute(&pool)
        .await
        .unwrap();
    assert_eq!(
        service::resolve_workspace(&pool, &all, &mut json!({}))
            .await
            .unwrap(),
        "ws_a"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_end_every_token_when_signing_out_everywhere(pool: PgPool) {
    fixture(&pool).await;
    let created = tokens::create(&pool, actor(), "Cursor", None, None)
        .await
        .unwrap();
    crate::auth::service::logout_everywhere(&pool, USER)
        .await
        .unwrap();
    assert!(mcp::find_live(&pool, &hash_token(&created.raw))
        .await
        .unwrap()
        .is_none());
}
