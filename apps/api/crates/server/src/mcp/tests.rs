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

/// MCP-2
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

/// MCP-3
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

/// MCP-3
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

/// MCP-2
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

// -------------------------------------------------------------------- OAuth

mod oauth_flow {
    use super::*;
    use crate::mcp::oauth::{self, CodeExchange, Consent, Failure};

    const VERIFIER: &str = "verifier-verifier-verifier-verifier-verifier-0123";
    const REDIRECT: &str = "http://127.0.0.1:33418/callback";

    fn error_of<T>(result: Result<T, Failure>) -> &'static str {
        match result {
            Err(Failure::OAuth(error)) => error.error,
            Err(Failure::App(error)) => panic!("app error {error}"),
            Ok(_) => panic!("expected an OAuth error"),
        }
    }

    async fn code(pool: &PgPool, client_id: &str) -> String {
        oauth::authorize(
            pool,
            actor(),
            Consent {
                client_id,
                redirect_uri: REDIRECT,
                code_challenge: &hash_token(VERIFIER),
                code_challenge_method: "S256",
                workspace_ids: Some(vec!["ws_a".into()]),
            },
        )
        .await
        .unwrap()
    }

    #[test]
    fn should_accept_only_safe_redirects() {
        for good in [
            "https://claude.ai/api/mcp/auth_callback",
            "http://127.0.0.1:5000/cb",
            "http://localhost/cb",
            "http://[::1]:8080/cb",
            "cursor://anysphere.cursor-retrieval/oauth/callback",
        ] {
            assert!(oauth::valid_redirect(good), "{good}");
        }
        for bad in [
            "http://evil.example/cb",
            "javascript://alert(1)",
            "data://x",
            "https://a.example/cb#frag",
            "not a url",
            "http://localhost.evil.example/cb",
        ] {
            assert!(!oauth::valid_redirect(bad), "{bad}");
        }
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_trade_a_code_once_with_pkce_and_rotate_refresh_tokens(pool: PgPool) {
        fixture(&pool).await;
        let client = oauth::register(&pool, Some("Claude"), &[REDIRECT.into()])
            .await
            .ok()
            .unwrap();

        // Wrong verifier: refused, and the code is spent anyway.
        let first = code(&pool, &client.client_id).await;
        let wrong = oauth::exchange_code(
            &pool,
            CodeExchange {
                code: &first,
                client_id: &client.client_id,
                redirect_uri: REDIRECT,
                code_verifier: "nope",
            },
        )
        .await;
        assert_eq!(error_of(wrong), "invalid_grant");
        let again = oauth::exchange_code(
            &pool,
            CodeExchange {
                code: &first,
                client_id: &client.client_id,
                redirect_uri: REDIRECT,
                code_verifier: VERIFIER,
            },
        )
        .await;
        assert_eq!(error_of(again), "invalid_grant");

        // The right one works once.
        let second = code(&pool, &client.client_id).await;
        let tokens = oauth::exchange_code(
            &pool,
            CodeExchange {
                code: &second,
                client_id: &client.client_id,
                redirect_uri: REDIRECT,
                code_verifier: VERIFIER,
            },
        )
        .await
        .ok()
        .unwrap();
        let live = mcp::find_live(&pool, &hash_token(&tokens.access_token))
            .await
            .unwrap()
            .unwrap();
        assert_eq!(live.workspace_ids, Some(vec!["ws_a".to_string()]));

        // Refresh rotates: the old access token ends, the new one works.
        let rotated = oauth::refresh(&pool, &tokens.refresh_token, &client.client_id)
            .await
            .ok()
            .unwrap();
        assert!(mcp::find_live(&pool, &hash_token(&tokens.access_token))
            .await
            .unwrap()
            .is_none());
        assert!(mcp::find_live(&pool, &hash_token(&rotated.access_token))
            .await
            .unwrap()
            .is_some());

        // Replaying the spent refresh token revokes the whole grant.
        let replay = oauth::refresh(&pool, &tokens.refresh_token, &client.client_id).await;
        assert_eq!(error_of(replay), "invalid_grant");
        assert!(mcp::find_live(&pool, &hash_token(&rotated.access_token))
            .await
            .unwrap()
            .is_none());
        assert_eq!(
            error_of(oauth::refresh(&pool, &rotated.refresh_token, &client.client_id).await),
            "invalid_grant"
        );
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_refuse_a_redirect_or_challenge_the_client_did_not_register(pool: PgPool) {
        fixture(&pool).await;
        let client = oauth::register(&pool, Some("Claude"), &[REDIRECT.into()])
            .await
            .ok()
            .unwrap();
        assert!(
            oauth::register(&pool, Some("x"), &["http://evil.example/cb".into()])
                .await
                .is_err()
        );

        for (redirect, method, field) in [
            ("http://127.0.0.1:1/other", "S256", "redirect_uri"),
            (REDIRECT, "plain", "code_challenge"),
        ] {
            let error = oauth::authorize(
                &pool,
                actor(),
                Consent {
                    client_id: &client.client_id,
                    redirect_uri: redirect,
                    code_challenge: &hash_token(VERIFIER),
                    code_challenge_method: method,
                    workspace_ids: None,
                },
            )
            .await
            .unwrap_err();
            assert!(
                matches!(error, AppError::Validation(ref f) if f.contains_key(field)),
                "{field}"
            );
        }
    }
}

/// MCP-4, MCP-5: every listed area has a tool, and nothing held back has one.
#[test]
fn should_cover_every_area_and_expose_nothing_held_back() {
    let names: Vec<&str> = crate::mcp::tools::all().map(|tool| tool.name).collect();
    for wanted in [
        "list_transactions",
        "add_transaction_item",
        "list_wallets",
        "list_wallet_groups",
        "list_categories",
        "get_budget_status",
        "get_overview",
        "list_items",
        "list_exchange_rates",
        "list_files",
        "list_members",
        "list_invites",
        "get_assistant_settings",
        "send_feedback",
        "import_transactions",
    ] {
        assert!(names.contains(&wanted), "{wanted} is missing");
    }
    for name in &names {
        for held_back in [
            "delete_workspace",
            "convert",
            "token",
            "password",
            "bulk",
            "download",
        ] {
            assert!(!name.contains(held_back), "{name} should not be exposed");
        }
    }
}

// ------------------------------------------------------------ tool calls

/// Everything a tool can reach, pointed at nothing outside the test: the
/// console mailer, local files in a temp directory, an AI service and a
/// rate source nobody calls. Only the database is real.
fn state(pool: &PgPool) -> crate::state::AppState {
    use std::{sync::Arc, time::Duration};

    use oewang_domain::Secret;

    use crate::config::{AppEnv, Config};

    let scratch = std::env::temp_dir().join(format!("oewang-mcp-{}", cuid2::create_id()));
    std::fs::create_dir_all(&scratch).unwrap();
    let unused = "http://127.0.0.1:9".to_string();
    let config = Config {
        app_env: AppEnv::Development,
        port: 0,
        database_url: Secret::from(String::new()),
        migration_database_url: None,
        db_max_connections: 1,
        db_acquire_timeout: Duration::from_secs(5),
        db_statement_timeout: Duration::from_secs(5),
        jwt_secret: Secret::from("x".repeat(32)),
        access_token_ttl: Duration::from_secs(900),
        refresh_token_ttl: Duration::from_secs(3600),
        app_url: "http://localhost:3000".into(),
        resend_api_key: None,
        email_from: "test@example.com".into(),
        ai_service_url: unused.clone(),
        ai_service_api_key: Secret::from(String::new()),
        ai_signing_public_keys: vec![],
        ai_request_timeout: Duration::from_secs(1),
        fx_api_url: unused.clone(),
        fx_access_key: None,
        telegram: None,
        storage_backend: "local".into(),
        storage_local_path: scratch.join("files").display().to_string(),
        s3_endpoint: String::new(),
        s3_bucket: String::new(),
        s3_region: String::new(),
        s3_access_key_id: String::new(),
        s3_secret_access_key: Secret::from(String::new()),
        crypto_signing_key_file: scratch.join("signing.pem"),
        owe1_enabled: false,
        chat_max_tool_amount: oewang_domain::tools::default_max_tool_amount(),
        request_timeout: Duration::from_secs(5),
        chat_stream_timeout: Duration::from_secs(5),
        body_limit_bytes: 1024 * 1024,
        rate_limits: Config::default_rate_limits(),
        uploads_per_day: 200,
        max_file_bytes: 10 * 1024 * 1024,
        import_row_limit: 5000,
        trust_proxy_headers: false,
        app_relay_key: None,
    };
    crate::state::AppState {
        db: pool.clone(),
        owe1_signer: Arc::new(
            crate::owe1::Owe1Signer::load_or_create(&config.crypto_signing_key_file, true).unwrap(),
        ),
        owe1_sessions: crate::owe1::SessionStore::new(),
        mailer: oewang_clients::Mailer::console(config.app_url.clone()),
        rates: oewang_clients::RatesClient::new(unused.clone(), None),
        files: oewang_clients::FileStore::Local(oewang_clients::storage::LocalStorage::new(
            config.storage_local_path.clone(),
        )),
        ai: Arc::new(
            oewang_clients::Owe1Client::new(
                unused,
                Secret::from(String::new()),
                vec![],
                true,
                Duration::from_secs(1),
            )
            .unwrap(),
        ),
        turns: crate::ai::turns::TurnStore::new(),
        mcp: crate::mcp::budget::McpBudget::new(),
        rate_limits: crate::limits::RateLimiter::new(Config::default_rate_limits()),
        telegram: None,
        webauthn: Arc::new(crate::passkeys::service::relying_party(&config.app_url).unwrap()),
        config: Arc::new(config),
    }
}

/// MCP-7: a write through an MCP tool runs the web's handler, and the audit
/// row it leaves names the person and says it came from `mcp`.
#[sqlx::test(migrations = "../../migrations")]
async fn should_audit_a_tool_write_with_source_mcp(pool: PgPool) {
    fixture(&pool).await;
    let state = state(&pool);

    let created = service::call(
        &state,
        &caller("tok_audit", Some(vec!["ws_a".into()])),
        "req_audit",
        "create_category",
        json!({ "name": "Groceries", "type": "expense" }),
    )
    .await
    .unwrap();

    let (workspace_id, user_id, source): (String, String, String) =
        sqlx::query_as("SELECT workspace_id, user_id, source FROM audit_logs WHERE entity_id = $1")
            .bind(created["id"].as_str().unwrap())
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(workspace_id, "ws_a");
    assert_eq!(user_id, USER, "the person, not the app that called");
    assert_eq!(source, "mcp");
}
