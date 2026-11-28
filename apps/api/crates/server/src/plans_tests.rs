//! PLN-6: every entry point a plan can leave out, allowed on Free (which
//! holds every feature) and refused with `FEATURE_NOT_IN_PLAN` once the
//! workspace's plan drops it. Each test makes both calls on the same state,
//! so it also shows the change applies on the next request: nothing is
//! cached in a token or in memory.
//!
//! The Telegram updates are tested in `telegram/update_tests.rs`, with the
//! Bot API stub they need.

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use oewang_domain::{AppError, Feature, Role};
use serde_json::json;
use sqlx::PgPool;

use crate::{
    ai,
    audit::Actor,
    auth::extractor::{Auth, AuthWrite},
    mcp::{self, caller::McpCaller},
    plans, receipts,
    response::{ApiError, RequestId},
    state::AppState,
    telegram::{self, Bot},
    test_support::{self, plan_without, NOWHERE},
    transactions::statement,
    vault,
};

const WORKSPACE: &str = "ws_pl";
const USER: &str = "usr_pl";

async fn fixture(pool: &PgPool) {
    for sql in [
        "INSERT INTO users (id, email, password_hash) VALUES ('usr_pl', 'pl@example.com', 'x')",
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ('ws_pl', 'Home', 'home', 'IDR')",
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ('m_pl', 'ws_pl', 'usr_pl', 'owner')",
        "INSERT INTO wallets (id, workspace_id, name, currency_code, is_default) VALUES ('w_cash', 'ws_pl', 'Cash', 'IDR', true)",
    ] {
        sqlx::query(sql).execute(pool).await.unwrap();
    }
}

fn auth() -> Auth {
    Auth {
        user_id: USER.into(),
        workspace_id: WORKSPACE.into(),
        role: Role::Owner,
        source: "web",
    }
}

fn auth_write() -> AuthWrite {
    AuthWrite {
        user_id: USER.into(),
        workspace_id: WORKSPACE.into(),
        role: Role::Owner,
        source: "web",
    }
}

fn rid() -> RequestId {
    RequestId("req_pl".into())
}

/// The refusal, by code, from a service.
fn refused<T>(result: &oewang_domain::Result<T>) -> bool {
    matches!(result, Err(AppError::FeatureNotInPlan(_)))
}

/// The refusal, by code and status, from a handler.
fn refused_http<T>(result: &Result<T, ApiError>, feature: Feature) -> bool {
    match result {
        Err(refusal) => {
            matches!(&refusal.error, AppError::FeatureNotInPlan(named) if *named == feature)
                && refusal.error.status() == 403
        }
        Ok(_) => false,
    }
}

async fn count(pool: &PgPool, sql: &'static str) -> i64 {
    sqlx::query_scalar(sql).fetch_one(pool).await.unwrap()
}

fn jpeg() -> Vec<u8> {
    let mut bytes = std::io::Cursor::new(Vec::new());
    image::RgbImage::from_pixel(8, 8, image::Rgb([200, 120, 40]))
        .write_to(&mut bytes, image::ImageFormat::Jpeg)
        .unwrap();
    bytes.into_inner()
}

/// A ready file in the vault, put there while the plan allowed it.
async fn ready_file(state: &AppState) -> String {
    let bytes = jpeg();
    let actor = Actor::web(WORKSPACE, USER);
    let begun = vault::service::begin(
        &state.db,
        actor,
        "receipt.jpg",
        "image/jpeg",
        bytes.len() as i64,
        200,
        10 * 1024 * 1024,
    )
    .await
    .unwrap();
    vault::service::put_chunk(
        &state.db,
        &state.files,
        WORKSPACE,
        &begun.file.id,
        0,
        &bytes,
    )
    .await
    .unwrap();
    vault::service::complete(&state.db, &state.files, actor, &begun.file.id)
        .await
        .unwrap()
        .id
}

/// PLN-6: an unknown workspace is not this check's to answer; its callers
/// already say `NOT_A_MEMBER` or `NOT_FOUND`, never a 500.
#[sqlx::test(migrations = "../../migrations")]
async fn should_pass_an_unknown_workspace_to_the_callers_own_checks(pool: PgPool) {
    fixture(&pool).await;
    assert!(plans::require(&pool, "ws_nobody", Feature::Chat)
        .await
        .is_ok());
    for feature in Feature::ALL {
        assert!(plans::require(&pool, WORKSPACE, feature).await.is_ok());
    }
}

/// PLN-6: `chat`, at `POST /v1/ai/chat/stream`, before the rate limit and
/// before the user's message is written.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_the_chat_stream(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let session = ai::service::create(&pool, Actor::web(WORKSPACE, USER), None)
        .await
        .unwrap();
    let body = || {
        Json(ai::handler::StreamBody {
            session_id: session.id.clone(),
            message: "how much on food?".into(),
            attachment_ids: Vec::new(),
        })
    };

    let allowed = ai::handler::chat_stream(State(state.clone()), auth(), rid(), None, body()).await;
    assert!(!refused_http(&allowed, Feature::Chat));

    plan_without(&pool, WORKSPACE, &[Feature::Chat]).await;
    let before = count(&pool, "SELECT count(*) FROM ai_messages").await;
    let result = ai::handler::chat_stream(State(state.clone()), auth(), rid(), None, body()).await;
    assert!(refused_http(&result, Feature::Chat));
    assert_eq!(
        count(&pool, "SELECT count(*) FROM ai_messages").await,
        before
    );
}

/// PLN-6: `receipt_scan`, at `POST /v1/ai/receipt/parse`. The check sits
/// in `ai::service::parse_receipt`, which the bot and the queue also read
/// through, so it holds before the AI service is asked.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_the_web_receipt_scan(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let file = ready_file(&state).await;
    let body = || {
        Json(ai::handler::ReceiptBody {
            vault_file_id: file.clone(),
        })
    };

    // Allowed: it gets as far as the AI service, which nothing answers.
    let allowed =
        ai::handler::parse_receipt(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(!refused_http(&allowed, Feature::ReceiptScan));

    plan_without(&pool, WORKSPACE, &[Feature::ReceiptScan]).await;
    let result =
        ai::handler::parse_receipt(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(refused_http(&result, Feature::ReceiptScan));
}

/// PLN-6: `receipt_scan`, at `POST /v1/receipts/pending` and in the queue's
/// read. A job queued before the change waits rather than reads.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_queueing_a_receipt_and_reading_a_queued_one(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let file = ready_file(&state).await;
    let body = || {
        Json(receipts::handler::QueueRequest {
            vault_file_id: file.clone(),
        })
    };

    let allowed =
        receipts::handler::queue_receipt(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(matches!(&allowed, Ok((StatusCode::ACCEPTED, _))));

    plan_without(&pool, WORKSPACE, &[Feature::ReceiptScan]).await;
    let result =
        receipts::handler::queue_receipt(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(refused_http(&result, Feature::ReceiptScan));
    assert_eq!(count(&pool, "SELECT count(*) FROM receipt_jobs").await, 1);

    let read = receipts::service::read_and_save(&state, Actor::web(WORKSPACE, USER), &file).await;
    assert!(refused(&read));
}

/// PLN-6: `statement_import`, at `POST /v1/transactions/import`, before the
/// file is read or a job is written.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_the_statement_import(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let file = ready_file(&state).await;
    let start = || {
        statement::start(
            &state.db,
            &state.files,
            &state.ai,
            statement::StatementImport {
                actor: Actor::web(WORKSPACE, USER),
                request_id: "req_pl",
                wallet_id: "w_cash",
                vault_file_id: &file,
                row_limit: 100,
            },
        )
    };

    let allowed = start().await;
    assert!(!refused(&allowed), "{:?}", allowed.err());

    plan_without(&pool, WORKSPACE, &[Feature::StatementImport]).await;
    let jobs = count(&pool, "SELECT count(*) FROM transaction_import_jobs").await;
    let result = start().await;
    assert!(refused(&result));
    assert_eq!(
        count(&pool, "SELECT count(*) FROM transaction_import_jobs").await,
        jobs
    );
}

/// PLN-6: `mcp`, on every tool call in the workspace it resolves to.
/// `list_workspaces` reads the token, not a workspace, and still answers.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_mcp_tool_calls(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let caller = McpCaller {
        token_id: "tok_pl".into(),
        user_id: USER.into(),
        workspace_ids: None,
    };

    let allowed = mcp::service::call(&state, &caller, "req_pl", "list_wallets", json!({})).await;
    assert!(allowed.is_ok(), "{:?}", allowed.err());

    plan_without(&pool, WORKSPACE, &[Feature::Mcp]).await;
    let result = mcp::service::call(&state, &caller, "req_pl", "list_wallets", json!({})).await;
    assert!(matches!(
        result,
        Err(AppError::FeatureNotInPlan(Feature::Mcp))
    ));
    let listed = mcp::service::call(&state, &caller, "req_pl", "list_workspaces", json!({})).await;
    assert!(listed.is_ok());
}

/// PLN-6: `vault`, at `POST /v1/vault/files`, before a row is reserved.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_a_vault_upload(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let body = || {
        Json(vault::handler::BeginBody {
            filename: "contract.pdf".into(),
            content_type: "application/pdf".into(),
            size_bytes: 1024,
        })
    };

    let allowed = vault::handler::begin(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(matches!(&allowed, Ok((StatusCode::CREATED, _))));

    plan_without(&pool, WORKSPACE, &[Feature::Vault]).await;
    let result = vault::handler::begin(State(state.clone()), auth_write(), rid(), body()).await;
    assert!(refused_http(&result, Feature::Vault));
    assert_eq!(count(&pool, "SELECT count(*) FROM vault_files").await, 1);
}

/// PLN-6: `telegram`, at `POST /v1/integrations/telegram/link-token`.
#[sqlx::test(migrations = "../../migrations")]
async fn should_gate_minting_a_telegram_link(pool: PgPool) {
    fixture(&pool).await;
    let bot = Bot {
        client: oewang_clients::TelegramClient::new(NOWHERE.into(), "1:token".into()),
        username: "OewangTestBot".into(),
    };

    assert!(telegram::link::issue(&pool, &bot, WORKSPACE, USER)
        .await
        .is_ok());

    plan_without(&pool, WORKSPACE, &[Feature::Telegram]).await;
    let result = telegram::link::issue(&pool, &bot, WORKSPACE, USER).await;
    assert!(matches!(
        result,
        Err(AppError::FeatureNotInPlan(Feature::Telegram))
    ));
}

/// PLN-6: what a feature already made stays readable on a plan with no
/// features at all: files and their bytes, past conversations, the MCP
/// token list, and the Telegram link's status. None of those routes, nor
/// token revoke or Telegram unlink, calls `plans::require`.
#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_what_was_made_readable_on_a_plan_without_features(pool: PgPool) {
    fixture(&pool).await;
    let state = test_support::state(pool.clone(), NOWHERE);
    let file = ready_file(&state).await;
    let session = ai::service::create(&pool, Actor::web(WORKSPACE, USER), None)
        .await
        .unwrap();

    plan_without(&pool, WORKSPACE, &Feature::ALL).await;

    let files = vault::handler::list(
        State(state.clone()),
        auth(),
        Query(serde_json::from_value(json!({})).unwrap()),
        rid(),
    )
    .await;
    assert_eq!(files.ok().unwrap().0.data.unwrap().len(), 1);
    assert!(
        vault::handler::get_file(State(state.clone()), auth(), Path(file.clone()), rid())
            .await
            .is_ok()
    );
    assert!(
        vault::handler::get_chunk(State(state.clone()), auth(), Path((file, 0)), rid())
            .await
            .is_ok()
    );

    assert!(ai::handler::list_sessions(
        State(state.clone()),
        auth(),
        rid(),
        Query(serde_json::from_value(json!({})).unwrap())
    )
    .await
    .is_ok());
    assert!(
        ai::handler::get_session(State(state.clone()), auth(), Path(session.id), rid())
            .await
            .is_ok()
    );

    assert!(
        mcp::handler::list_tokens(State(state.clone()), auth(), rid())
            .await
            .is_ok()
    );
    assert!(
        telegram::handler::status(State(state.clone()), auth(), rid())
            .await
            .is_ok()
    );
}
