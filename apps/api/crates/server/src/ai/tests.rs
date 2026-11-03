//! Service tests for chat sessions.
//!
//! Against a real database, like the other services: the rules that matter
//! are the workspace scope, the soft delete taking the messages with it,
//! and the audit row landing in the same transaction.

use oewang_domain::{AppError, Page};
use sqlx::PgPool;

use crate::{ai::service, audit::Actor};

const WORKSPACE: &str = "ws_test";
const OTHER_WORKSPACE: &str = "ws_other";
const USER: &str = "usr_test";

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

async fn fixture(pool: &PgPool) {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, 'test@example.com', 'x')",
    )
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();

    for (id, slug) in [(WORKSPACE, "test"), (OTHER_WORKSPACE, "other")] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Test', $2, 'IDR')",
        )
        .bind(id)
        .bind(slug)
        .execute(pool)
        .await
        .unwrap();
    }

    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_test', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();
}

async fn audit_actions(pool: &PgPool, entity_id: &str) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT action FROM audit_logs WHERE entity_id = $1 ORDER BY created_at, id",
    )
    .bind(entity_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_create_a_session_with_a_default_title(pool: PgPool) {
    fixture(&pool).await;

    let session = service::create(&pool, actor(), None).await.unwrap();

    assert_eq!(session.title, service::DEFAULT_TITLE);
    assert_eq!(audit_actions(&pool, &session.id).await, ["ai_session.created"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_blank_title(pool: PgPool) {
    fixture(&pool).await;

    let error = service::create(&pool, actor(), Some("   ")).await.unwrap_err();

    assert_eq!(error.code(), "VALIDATION_FAILED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_list_sessions_newest_activity_first(pool: PgPool) {
    fixture(&pool).await;

    let first = service::create(&pool, actor(), Some("First")).await.unwrap();
    let second = service::create(&pool, actor(), Some("Second")).await.unwrap();

    // A message in the older session moves it back to the top (CHAT-1).
    service::append_message(&pool, WORKSPACE, &first.id, "user", "hello", None)
        .await
        .unwrap();

    let (rows, total) = service::list(&pool, WORKSPACE, Page::new(None, None)).await.unwrap();

    assert_eq!(total, 2);
    assert_eq!(rows[0].id, first.id);
    assert_eq!(rows[0].message_count, 1);
    assert_eq!(rows[0].last_message.as_deref(), Some("hello"));
    assert_eq!(rows[1].id, second.id);
    assert_eq!(rows[1].message_count, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_list_another_workspaces_sessions(pool: PgPool) {
    fixture(&pool).await;
    service::create(&pool, actor(), Some("Mine")).await.unwrap();
    service::create(&pool, Actor::web(OTHER_WORKSPACE, USER), Some("Theirs")).await.unwrap();

    let (rows, total) = service::list(&pool, WORKSPACE, Page::new(None, None)).await.unwrap();

    assert_eq!(total, 1);
    assert_eq!(rows[0].title, "Mine");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_read_a_conversation_oldest_message_first(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    service::append_message(&pool, WORKSPACE, &session.id, "user", "first", None)
        .await
        .unwrap();
    service::append_message(&pool, WORKSPACE, &session.id, "assistant", "second", None)
        .await
        .unwrap();

    let conversation = service::get(&pool, WORKSPACE, &session.id).await.unwrap();

    let contents: Vec<&str> = conversation.messages.iter().map(|m| m.content.as_str()).collect();
    assert_eq!(contents, ["first", "second"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_session_from_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let theirs = service::create(&pool, Actor::web(OTHER_WORKSPACE, USER), None).await.unwrap();

    let error = service::get(&pool, WORKSPACE, &theirs.id).await.unwrap_err();

    assert!(matches!(error, AppError::SessionNotFound));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_rename_a_session(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let renamed = service::rename(&pool, actor(), &session.id, "Food last month").await.unwrap();

    assert_eq!(renamed.title, "Food last month");
    assert_eq!(
        audit_actions(&pool, &session.id).await,
        ["ai_session.created", "ai_session.renamed"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_rename_a_session_in_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let theirs = service::create(&pool, Actor::web(OTHER_WORKSPACE, USER), None).await.unwrap();

    let error = service::rename(&pool, actor(), &theirs.id, "Mine now").await.unwrap_err();

    assert!(matches!(error, AppError::SessionNotFound));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_soft_delete_a_session_with_its_messages(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    service::append_message(&pool, WORKSPACE, &session.id, "user", "hello", None)
        .await
        .unwrap();

    service::delete(&pool, actor(), &session.id).await.unwrap();

    assert!(matches!(
        service::get(&pool, WORKSPACE, &session.id).await.unwrap_err(),
        AppError::SessionNotFound
    ));

    // Soft delete only: the rows are still there, marked (OPS-2).
    let rows: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM ai_messages WHERE session_id = $1 AND deleted_at IS NOT NULL",
    )
    .bind(&session.id)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(rows, 1);

    assert_eq!(
        audit_actions(&pool, &session.id).await,
        ["ai_session.created", "ai_session.deleted"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_delete_twice(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    service::delete(&pool, actor(), &session.id).await.unwrap();

    let error = service::delete(&pool, actor(), &session.id).await.unwrap_err();

    assert!(matches!(error, AppError::SessionNotFound));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_message_in_a_session_from_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let theirs = service::create(&pool, Actor::web(OTHER_WORKSPACE, USER), None).await.unwrap();

    let error = service::append_message(&pool, WORKSPACE, &theirs.id, "user", "hello", None)
        .await
        .unwrap_err();

    assert!(matches!(error, AppError::SessionNotFound));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_unknown_message_role(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let error = service::append_message(&pool, WORKSPACE, &session.id, "tool", "x", None)
        .await
        .unwrap_err();

    assert_eq!(error.code(), "VALIDATION_FAILED");
}
