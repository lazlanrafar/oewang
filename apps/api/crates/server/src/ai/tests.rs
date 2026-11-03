//! Service tests for chat sessions and for one turn.
//!
//! Against a real database, like the other services: the rules that matter
//! are the workspace scope, the soft delete taking the messages with it,
//! and the audit row landing in the same transaction.
//!
//! The turn tests drive the pump with a scripted stream. No model is reached
//! from here, and none should be: what is under test is which rows exist
//! afterwards, including after a caller hangs up (CHAT-9).

use oewang_clients::{Owe1ClientError, StreamEvent};
use oewang_domain::{AppError, Page, Role};
use serde_json::{json, Value};
use sqlx::PgPool;
use tokio::sync::mpsc;

use crate::{
    ai::{
        service,
        stream::{self, EventSource, Frame, NextEvent, Sealer},
    },
    audit::Actor,
};

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

/// A wallet and a category, so a turn has a workspace to describe.
async fn ledger_fixture(pool: &PgPool) {
    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code, balance, is_default)
         VALUES ('wal_cash', $1, 'Cash', 'IDR', 250000.0000, true)",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();

    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type)
         VALUES ('cat_food', $1, 'Food', 'expense')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

/// A scripted stream, standing in for the AI service.
struct Scripted(std::vec::IntoIter<Result<StreamEvent, Owe1ClientError>>);

impl Scripted {
    fn new(events: Vec<(&str, Value)>) -> Self {
        Self(
            events
                .into_iter()
                .map(|(name, payload)| {
                    Ok(StreamEvent {
                        name: name.to_string(),
                        data: serde_json::to_vec(&payload).unwrap(),
                    })
                })
                .collect::<Vec<_>>()
                .into_iter(),
        )
    }
}

impl EventSource for Scripted {
    async fn next(&mut self) -> NextEvent {
        self.0.next()
    }
}

async fn messages(pool: &PgPool, session_id: &str) -> Vec<(String, String)> {
    sqlx::query_as::<_, (String, String)>(
        "SELECT role, content FROM ai_messages
         WHERE session_id = $1 AND deleted_at IS NULL ORDER BY created_at, id",
    )
    .bind(session_id)
    .fetch_all(pool)
    .await
    .unwrap()
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

// ------------------------------------------------------------- one turn

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_user_message_when_a_turn_begins(pool: PgPool) {
    fixture(&pool).await;
    ledger_fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let turn = service::begin_turn(
        &pool,
        WORKSPACE,
        USER,
        Role::Owner,
        &session.id,
        "  How much did I spend on food?  ",
        &[],
    )
    .await
    .unwrap();

    assert_eq!(
        messages(&pool, &session.id).await,
        [("user".to_string(), "How much did I spend on food?".to_string())]
    );
    // The user's own message is the turn, not part of its history.
    assert!(turn.history.is_empty());
    assert_eq!(turn.role, "owner");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_describe_the_workspace_with_figures_it_did_not_compute(pool: PgPool) {
    fixture(&pool).await;
    ledger_fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let turn =
        service::begin_turn(&pool, WORKSPACE, USER, Role::Member, &session.id, "hello", &[])
            .await
            .unwrap();

    assert_eq!(turn.context.currency_code, "IDR");
    assert_eq!(turn.context.wallets.len(), 1);
    assert_eq!(turn.context.categories.len(), 1);

    // Money is a string on the wire, read from the balance column (D12, D27).
    let body: Value = serde_json::to_value(&turn).unwrap();
    assert_eq!(body["context"]["wallets"][0]["balance"], json!("250000.0000"));
    assert_eq!(body["settings"]["response_language"], json!("auto"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_carry_the_earlier_messages_as_history(pool: PgPool) {
    fixture(&pool).await;
    ledger_fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    service::append_message(&pool, WORKSPACE, &session.id, "user", "first", None)
        .await
        .unwrap();
    service::append_message(&pool, WORKSPACE, &session.id, "assistant", "answer", None)
        .await
        .unwrap();

    let turn =
        service::begin_turn(&pool, WORKSPACE, USER, Role::Owner, &session.id, "second", &[])
            .await
            .unwrap();

    let history: Vec<&str> = turn.history.iter().map(|m| m.content.as_str()).collect();
    assert_eq!(history, ["first", "answer"]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_turn_in_a_session_from_another_workspace(pool: PgPool) {
    fixture(&pool).await;
    let theirs = service::create(&pool, Actor::web(OTHER_WORKSPACE, USER), None).await.unwrap();

    let error = service::begin_turn(&pool, WORKSPACE, USER, Role::Owner, &theirs.id, "hi", &[])
        .await
        .unwrap_err();

    assert!(matches!(error, AppError::SessionNotFound));
    assert!(messages(&pool, &theirs.id).await.is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_turn_with_an_empty_message(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let error = service::begin_turn(&pool, WORKSPACE, USER, Role::Owner, &session.id, "  ", &[])
        .await
        .unwrap_err();

    assert_eq!(error.code(), "VALIDATION_FAILED");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_attachment_this_workspace_does_not_have(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    let error = service::begin_turn(
        &pool,
        WORKSPACE,
        USER,
        Role::Owner,
        &session.id,
        "what is this",
        &["vf_nope".to_string()],
    )
    .await
    .unwrap_err();

    assert!(matches!(error, AppError::FileNotFound));
    assert!(messages(&pool, &session.id).await.is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_assistant_message_when_the_stream_ends(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    let (sender, mut receiver) = mpsc::channel::<Frame>(16);

    let events = Scripted::new(vec![
        ("token", json!({ "text": "You spent " })),
        ("token", json!({ "text": "50,000." })),
        ("done", json!({ "message_id": null, "usage": { "input": 12, "output": 4 } })),
    ]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        // No context: encryption off, so the frames are the plain payloads.
        Sealer::new(None),
    )
    .await;

    assert_eq!(
        messages(&pool, &session.id).await,
        [("assistant".to_string(), "You spent 50,000.".to_string())]
    );

    let mut frames = Vec::new();
    while let Some(frame) = receiver.recv().await {
        frames.push(frame);
    }
    let names: Vec<&str> = frames.iter().map(|f| f.name.as_str()).collect();
    assert_eq!(names, ["token", "token", "done"]);

    // `message_id` names the stored row, which the AI service cannot know.
    let done: Value = serde_json::from_str(&frames[2].data).unwrap();
    let stored: String = sqlx::query_scalar("SELECT id FROM ai_messages WHERE role = 'assistant'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(done["message_id"], json!(stored));
    assert_eq!(done["usage"]["output"], json!(4));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_tool_calls_beside_the_reply(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    let (sender, mut receiver) = mpsc::channel::<Frame>(16);

    let events = Scripted::new(vec![
        ("tool_call", json!({ "id": "t1", "name": "create_transaction", "args": { "amount": "50000" } })),
        ("tool_result", json!({ "id": "t1", "ok": true, "summary": "Created expense of Rp 50.000 in Cash." })),
        ("token", json!({ "text": "Added." })),
        ("done", json!({ "message_id": null, "usage": { "input": 12, "output": 4 } })),
    ]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        Sealer::new(None),
    )
    .await;

    // Both events still travel on untouched: recording them is not
    // interpreting them.
    let mut names = Vec::new();
    while let Some(frame) = receiver.recv().await {
        names.push(frame.name);
    }
    assert_eq!(names, ["tool_call", "tool_result", "token", "done"]);

    let attachments: Value =
        sqlx::query_scalar("SELECT attachments FROM ai_messages WHERE role = 'assistant'")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(attachments["tool_calls"][0]["name"], json!("create_transaction"));
    assert_eq!(attachments["tool_calls"][0]["result"]["ok"], json!(true));
    assert_eq!(
        attachments["tool_calls"][0]["result"]["summary"],
        json!("Created expense of Rp 50.000 in Cash.")
    );
    assert_eq!(attachments["usage"]["output"], json!(4));
}

/// A turn cut off between the call and its answer stores the call without a
/// result, which is what the UI reads as "never answered" rather than as a
/// finished one.
#[sqlx::test(migrations = "../../migrations")]
async fn should_store_a_tool_call_that_never_answered(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    let (sender, receiver) = mpsc::channel::<Frame>(16);

    let events = Scripted::new(vec![
        ("tool_call", json!({ "id": "t1", "name": "get_spending_summary", "args": {} })),
    ]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        Sealer::new(None),
    )
    .await;
    drop(receiver);

    let attachments: Value =
        sqlx::query_scalar("SELECT attachments FROM ai_messages WHERE role = 'assistant'")
            .fetch_one(&pool)
            .await
            .unwrap();

    assert_eq!(attachments["tool_calls"][0]["name"], json!("get_spending_summary"));
    assert_eq!(attachments["tool_calls"][0]["result"], Value::Null);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_partial_reply_when_the_caller_disconnects(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();

    // The caller hung up: nobody is reading the other end any more (CHAT-9).
    let (sender, receiver) = mpsc::channel::<Frame>(1);
    drop(receiver);

    let events = Scripted::new(vec![
        ("token", json!({ "text": "You spent " })),
        ("token", json!({ "text": "50,000." })),
        ("done", json!({ "message_id": null })),
    ]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        Sealer::new(None),
    )
    .await;

    assert_eq!(
        messages(&pool, &session.id).await,
        [("assistant".to_string(), "You spent ".to_string())],
        "what the caller was sent before it left is still its reply"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_end_on_an_error_when_the_other_side_stops_without_saying_done(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    let (sender, mut receiver) = mpsc::channel::<Frame>(16);

    let events = Scripted::new(vec![("token", json!({ "text": "You spent " }))]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        Sealer::new(None),
    )
    .await;

    // A stream never ends silently, and the half-reply is still stored.
    let mut frames = Vec::new();
    while let Some(frame) = receiver.recv().await {
        frames.push(frame);
    }
    assert_eq!(frames.last().unwrap().name, "error");
    assert_eq!(
        messages(&pool, &session.id).await,
        [("assistant".to_string(), "You spent ".to_string())]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_store_nothing_when_the_assistant_said_nothing(pool: PgPool) {
    fixture(&pool).await;
    let session = service::create(&pool, actor(), None).await.unwrap();
    let (sender, mut receiver) = mpsc::channel::<Frame>(16);

    let events =
        Scripted::new(vec![("error", json!({ "code": "MODEL_FAILED", "message": "..." }))]);

    stream::pump(
        events,
        sender,
        pool.clone(),
        WORKSPACE.to_string(),
        session.id.clone(),
        Sealer::new(None),
    )
    .await;

    assert!(messages(&pool, &session.id).await.is_empty());

    let frame = receiver.recv().await.unwrap();
    assert_eq!(frame.name, "error");
}
