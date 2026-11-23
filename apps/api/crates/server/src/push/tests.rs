//! Push against a real database, with a recorder standing in for FCM
//! (D116). The FCM client itself, its JWT and how it reads FCM's answers,
//! is tested in `oewang_clients::push`.
//!
//! The recorder is installed once for the whole test binary, so every test
//! registers its own random tokens and reads back only what was sent to
//! them. Pushes run inline under test (see `push::dispatch`), so a test can
//! assert on them as soon as the write returns.

use std::{
    collections::HashSet,
    future::Future,
    pin::Pin,
    sync::{Arc, Mutex, OnceLock},
    time::Duration,
};

use axum::{extract::State, Json};
use chrono::{DateTime, TimeZone, Utc};
use oewang_clients::{Delivery, PushMessage, PushSender};
use oewang_domain::{ledger::TransactionType, Role};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    auth::extractor::AuthWrite,
    budgets::service as budgets,
    push::service,
    receipts::queue,
    response::RequestId,
    test_support::{self, NOWHERE},
    transactions::{
        service::{self as transactions, TransactionInput},
        statement,
    },
    workspaces::handler::{self as workspaces, InviteRequest},
};

const WORKSPACE: &str = "ws_push";
const USER: &str = "usr_push";
const MEMBER: &str = "usr_push_member";
const WALLET: &str = "w_push";

#[derive(Default)]
struct Recorder {
    sent: Mutex<Vec<(String, PushMessage)>>,
    dead: Mutex<HashSet<String>>,
}

impl PushSender for Recorder {
    fn send<'a>(
        &'a self,
        token: &'a str,
        message: &'a PushMessage,
    ) -> Pin<Box<dyn Future<Output = Delivery> + Send + 'a>> {
        Box::pin(async move {
            self.sent
                .lock()
                .unwrap()
                .push((token.to_string(), message.clone()));
            if self.dead.lock().unwrap().contains(token) {
                Delivery::Dead
            } else {
                Delivery::Sent
            }
        })
    }
}

impl Recorder {
    fn sent_to(&self, token: &str) -> Vec<PushMessage> {
        self.sent
            .lock()
            .unwrap()
            .iter()
            .filter(|(to, _)| to == token)
            .map(|(_, message)| message.clone())
            .collect()
    }
}

fn recorder() -> Arc<Recorder> {
    static RECORDER: OnceLock<Arc<Recorder>> = OnceLock::new();
    RECORDER
        .get_or_init(|| {
            let recorder = Arc::new(Recorder::default());
            super::install(recorder.clone());
            recorder
        })
        .clone()
}

fn token() -> String {
    format!("fcm-{}", cuid2::create_id())
}

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

fn decimal(value: &str) -> Decimal {
    value.parse().unwrap()
}

fn november(day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, day, 9, 0, 0).unwrap()
}

async fn fixture(pool: &PgPool) {
    for (id, email) in [(USER, "owner@example.com"), (MEMBER, "member@example.com")] {
        sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, $2, 'x')")
            .bind(id)
            .bind(email)
            .execute(pool)
            .await
            .unwrap();
    }
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Home', 'home', 'IDR')",
    )
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
    for (id, user, role) in [("m_owner", USER, "owner"), ("m_member", MEMBER, "member")] {
        sqlx::query(
            "INSERT INTO user_workspaces (id, workspace_id, user_id, role) VALUES ($1, $2, $3, $4)",
        )
        .bind(id)
        .bind(WORKSPACE)
        .bind(user)
        .bind(role)
        .execute(pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code) VALUES ($1, $2, 'Cash', 'IDR')",
    )
    .bind(WALLET)
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

async fn category(pool: &PgPool, id: &str) {
    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type) VALUES ($1, $2, $1, 'expense')",
    )
    .bind(id)
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

async fn device(pool: &PgPool, user: &str) -> String {
    let token = token();
    service::register(pool, Actor::web(WORKSPACE, user), &token, "android")
        .await
        .unwrap();
    token
}

async fn spend(pool: &PgPool, category: &str, amount: &str, date: DateTime<Utc>) {
    transactions::create(
        pool,
        actor(),
        TransactionInput {
            kind: TransactionType::Expense,
            wallet_id: WALLET,
            to_wallet_id: None,
            category_id: Some(category),
            amount: decimal(amount),
            to_amount: None,
            original_amount: None,
            original_currency_code: None,
            exchange_rate: None,
            requested_base_rate: None,
            date,
            name: Some("Shop"),
            description: None,
            attachment_ids: None,
        },
    )
    .await
    .unwrap();
}

async fn alerts(pool: &PgPool, category: &str) -> Vec<(String, i16)> {
    sqlx::query_as::<_, (String, i16)>(
        "SELECT to_char(a.month, 'YYYY-MM'), a.threshold FROM budget_alerts a
         JOIN budgets b ON b.id = a.budget_id
         WHERE a.workspace_id = $1 AND b.category_id = $2
         ORDER BY a.month, a.threshold",
    )
    .bind(WORKSPACE)
    .bind(category)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn live_devices(pool: &PgPool, token: &str) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT user_id FROM device_tokens WHERE token = $1 AND deleted_at IS NULL",
    )
    .bind(token)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn audit_actions(pool: &PgPool) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT action FROM audit_logs WHERE workspace_id = $1 AND entity = 'device_token'
         ORDER BY created_at, id",
    )
    .bind(WORKSPACE)
    .fetch_all(pool)
    .await
    .unwrap()
}

/// What a spawned task sends arrives a moment after the call that started
/// it returned; this waits for it rather than sleeping a fixed time.
async fn sent_within(recorder: &Recorder, token: &str, count: usize) -> Vec<PushMessage> {
    for _ in 0..100 {
        if recorder.sent_to(token).len() >= count {
            break;
        }
        tokio::time::sleep(Duration::from_millis(50)).await;
    }
    recorder.sent_to(token)
}

// ------------------------------------------------------------------ devices

/// Devices, the API half (D116): register.
#[sqlx::test(migrations = "../../migrations")]
async fn should_register_a_device_and_audit_it_without_the_token(pool: PgPool) {
    fixture(&pool).await;
    let token = token();

    let row = service::register(&pool, actor(), &token, "ios")
        .await
        .unwrap();

    assert_eq!(row.platform, "ios");
    assert_eq!(live_devices(&pool, &token).await, vec![USER.to_string()]);
    assert_eq!(audit_actions(&pool).await, vec!["device_token.registered"]);
    let leaked: i64 = sqlx::query_scalar(
        "SELECT count(*) FROM audit_logs WHERE after::text LIKE '%' || $1 || '%'",
    )
    .bind(&token)
    .fetch_one(&pool)
    .await
    .unwrap();
    assert_eq!(leaked, 0);
}

/// Devices (D116): the same phone signing in to another account.
#[sqlx::test(migrations = "../../migrations")]
async fn should_move_a_token_registered_again_to_the_new_person(pool: PgPool) {
    fixture(&pool).await;
    let token = token();

    let first = service::register(&pool, actor(), &token, "android")
        .await
        .unwrap();
    let again = service::register(&pool, Actor::web(WORKSPACE, MEMBER), &token, "android")
        .await
        .unwrap();

    assert_eq!(again.id, first.id);
    assert!(again.last_seen_at >= first.last_seen_at);
    assert_eq!(live_devices(&pool, &token).await, vec![MEMBER.to_string()]);
}

/// Devices (D116): sign-out removes the caller's own token, and only theirs.
#[sqlx::test(migrations = "../../migrations")]
async fn should_remove_only_the_callers_own_token(pool: PgPool) {
    fixture(&pool).await;
    let token = device(&pool, USER).await;

    service::remove(&pool, Actor::web(WORKSPACE, MEMBER), &token)
        .await
        .unwrap();
    assert_eq!(live_devices(&pool, &token).await, vec![USER.to_string()]);

    service::remove(&pool, actor(), &token).await.unwrap();
    assert!(live_devices(&pool, &token).await.is_empty());
    // Already gone is not an error: signing out must not fail.
    service::remove(&pool, actor(), &token).await.unwrap();

    assert_eq!(
        audit_actions(&pool).await,
        vec!["device_token.registered", "device_token.removed"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_unknown_platform_or_an_empty_token(pool: PgPool) {
    fixture(&pool).await;
    for (token, platform) in [("abc", "windows"), ("  ", "ios")] {
        let error = service::register(&pool, actor(), token, platform)
            .await
            .unwrap_err();
        assert_eq!(error.code(), "VALIDATION_FAILED");
    }
}

/// Devices (D116): a token FCM reports unregistered is soft-deleted.
#[sqlx::test(migrations = "../../migrations")]
async fn should_retire_a_device_fcm_reports_unregistered(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    let dead = device(&pool, USER).await;
    let alive = device(&pool, USER).await;
    recorder.dead.lock().unwrap().insert(dead.clone());

    let message = PushMessage {
        title: "t".into(),
        body: "b".into(),
        route: "/transactions".into(),
    };
    service::notify_user(&pool, USER, message.clone()).await;

    assert_eq!(recorder.sent_to(&dead), vec![message.clone()]);
    assert!(live_devices(&pool, &dead).await.is_empty());
    assert_eq!(live_devices(&pool, &alive).await, vec![USER.to_string()]);

    // The next push does not try it again.
    service::notify_user(&pool, USER, message).await;
    assert_eq!(recorder.sent_to(&dead).len(), 1);
    assert_eq!(recorder.sent_to(&alive).len(), 2);
}

// ----------------------------------------------------------------- receipts

async fn vault_file(pool: &PgPool, id: &str) {
    // Empty and ready: the reader is never reached in these tests, or is
    // unreachable, so the bytes do not matter.
    sqlx::query(
        "INSERT INTO vault_files (id, workspace_id, name, key, size, type, status)
         VALUES ($1, $2, 'receipt.jpg', $1, 0, 'image/jpeg', 'ready')",
    )
    .bind(id)
    .bind(WORKSPACE)
    .execute(pool)
    .await
    .unwrap();
}

async fn due_job(pool: &PgPool, file_id: &str, age_hours: i32) {
    sqlx::query(
        "INSERT INTO receipt_jobs (id, workspace_id, user_id, vault_file_id, channel,
                                   next_attempt_at, created_at)
         VALUES ($1 || '_job', $2, $3, $1, 'web', now() - interval '1 minute',
                 now() - make_interval(hours => $4))",
    )
    .bind(file_id)
    .bind(WORKSPACE)
    .bind(USER)
    .bind(age_hours)
    .execute(pool)
    .await
    .unwrap();
}

/// PUSH-2: a queued receipt that is saved pushes once, to whoever queued it,
/// and opens the transaction.
#[sqlx::test(migrations = "../../migrations")]
async fn should_push_once_when_a_queued_receipt_is_saved(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    category(&pool, "c_food").await;
    let mine = device(&pool, USER).await;
    let theirs = device(&pool, MEMBER).await;

    // Already attached to a transaction: the queue finds it saved without
    // asking the reader (a retry after a crash).
    vault_file(&pool, "f_saved").await;
    spend(&pool, "c_food", "10", november(2)).await;
    let transaction_id: String = sqlx::query_scalar("SELECT id FROM transactions LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO transaction_attachments (id, workspace_id, transaction_id, vault_file_id)
         VALUES ('a1', $1, $2, 'f_saved')",
    )
    .bind(WORKSPACE)
    .bind(&transaction_id)
    .execute(&pool)
    .await
    .unwrap();
    due_job(&pool, "f_saved", 0).await;

    let state = test_support::state(pool.clone(), NOWHERE);
    assert_eq!(queue::tick(&state).await.unwrap(), 1);

    let sent = recorder.sent_to(&mine);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "Receipt saved");
    assert_eq!(
        sent[0].route,
        format!("/transactions?detail={transaction_id}")
    );
    assert!(recorder.sent_to(&theirs).is_empty());
}

/// PUSH-2: one the reader gave up on pushes once and opens the file.
#[sqlx::test(migrations = "../../migrations")]
async fn should_push_once_when_a_queued_receipt_is_given_up(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    let mine = device(&pool, USER).await;

    // A day old, and the reader is unreachable: this attempt is the last.
    vault_file(&pool, "f_lost").await;
    due_job(&pool, "f_lost", 25).await;

    let state = test_support::state(pool.clone(), NOWHERE);
    queue::tick(&state).await.unwrap();

    let sent = recorder.sent_to(&mine);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "Receipt not read");
    assert_eq!(sent[0].route, "/vault?file=f_lost");
}

/// PUSH-2: a statement import that ends pushes once to whoever started it.
#[sqlx::test(migrations = "../../migrations")]
async fn should_push_once_when_an_import_job_ends(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    let mine = device(&pool, USER).await;
    let theirs = device(&pool, MEMBER).await;
    vault_file(&pool, "f_statement").await;

    // The reader is unreachable, so the job fails; failing is an ending.
    let state = test_support::state(pool.clone(), NOWHERE);
    statement::start(
        &pool,
        &state.files,
        &state.ai,
        statement::StatementImport {
            actor: actor(),
            request_id: "req",
            wallet_id: WALLET,
            vault_file_id: "f_statement",
            row_limit: 100,
        },
    )
    .await
    .unwrap();

    let sent = sent_within(&recorder, &mine, 1).await;
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "Statement not imported");
    assert_eq!(sent[0].route, "/transactions");
    assert!(recorder.sent_to(&theirs).is_empty());
}

// ------------------------------------------------------------------ budgets

/// PUSH-3, PUSH-5: 80% once, nothing while it stays above, 100% once, to
/// every member with a device; the text and amounts are the API's own.
#[sqlx::test(migrations = "../../migrations")]
async fn should_push_each_budget_threshold_once_a_month(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    category(&pool, "c_food").await;
    budgets::create(&pool, actor(), "c_food", decimal("1000000"))
        .await
        .unwrap();
    let owner = device(&pool, USER).await;
    let member = device(&pool, MEMBER).await;

    spend(&pool, "c_food", "500000", november(2)).await;
    assert!(recorder.sent_to(&owner).is_empty());

    spend(&pool, "c_food", "300000", november(3)).await;
    let sent = recorder.sent_to(&owner);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "c_food: 80% of the budget used");
    assert_eq!(
        sent[0].body,
        "Rp 800.000 of Rp 1.000.000 spent in November 2026 (80%)."
    );
    assert_eq!(sent[0].route, "/budgets?month=2026-11");
    assert_eq!(recorder.sent_to(&member), sent);

    // Still past 80%, not yet 100%: nothing new.
    spend(&pool, "c_food", "50000", november(4)).await;
    assert_eq!(recorder.sent_to(&owner).len(), 1);

    spend(&pool, "c_food", "200000", november(5)).await;
    let sent = recorder.sent_to(&owner);
    assert_eq!(sent.len(), 2);
    assert_eq!(sent[1].title, "c_food: budget reached");

    // Over the limit and staying there: still nothing new.
    spend(&pool, "c_food", "10000", november(6)).await;
    assert_eq!(recorder.sent_to(&owner).len(), 2);
    assert_eq!(
        alerts(&pool, "c_food").await,
        vec![("2026-11".to_string(), 80), ("2026-11".to_string(), 100)]
    );
}

/// PUSH-3: a jump past both thresholds records both and sends only 100%.
#[sqlx::test(migrations = "../../migrations")]
async fn should_send_only_the_100_push_on_a_jump_past_both(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    category(&pool, "c_rent").await;
    budgets::create(&pool, actor(), "c_rent", decimal("1000"))
        .await
        .unwrap();
    let owner = device(&pool, USER).await;

    spend(&pool, "c_rent", "1200", november(1)).await;

    let sent = recorder.sent_to(&owner);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].title, "c_rent: budget reached");
    assert_eq!(
        alerts(&pool, "c_rent").await,
        vec![("2026-11".to_string(), 80), ("2026-11".to_string(), 100)]
    );

    // The 80% row is what stops a later write announcing it.
    spend(&pool, "c_rent", "1", november(2)).await;
    assert_eq!(recorder.sent_to(&owner).len(), 1);
}

/// PUSH-3: a new month starts with nothing announced.
#[sqlx::test(migrations = "../../migrations")]
async fn should_start_each_month_fresh(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    category(&pool, "c_fuel").await;
    budgets::create(&pool, actor(), "c_fuel", decimal("100"))
        .await
        .unwrap();
    let owner = device(&pool, USER).await;

    spend(&pool, "c_fuel", "85", november(10)).await;
    spend(
        &pool,
        "c_fuel",
        "85",
        Utc.with_ymd_and_hms(2026, 12, 1, 9, 0, 0).unwrap(),
    )
    .await;

    let routes: Vec<String> = recorder
        .sent_to(&owner)
        .into_iter()
        .map(|message| message.route)
        .collect();
    assert_eq!(
        routes,
        vec!["/budgets?month=2026-11", "/budgets?month=2026-12"]
    );
}

/// PUSH-3: concurrent writers past the same threshold announce it once.
#[sqlx::test(migrations = "../../migrations")]
async fn should_announce_once_when_writes_race_past_a_threshold(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    category(&pool, "c_race").await;
    budgets::create(&pool, actor(), "c_race", decimal("100"))
        .await
        .unwrap();
    let owner = device(&pool, USER).await;
    spend(&pool, "c_race", "90", november(10)).await;
    assert_eq!(recorder.sent_to(&owner).len(), 1);

    // The month is already past 80%; re-running the check from several
    // writers at once must not announce it again.
    let checks = (0..4).map(|_| {
        let pool = pool.clone();
        tokio::spawn(async move {
            service::budgets_after_write(&pool, WORKSPACE, [november(11)]).await;
        })
    });
    for check in checks.collect::<Vec<_>>() {
        check.await.unwrap();
    }
    assert_eq!(recorder.sent_to(&owner).len(), 1);
}

// ------------------------------------------------------------------ invites

fn owner_write() -> AuthWrite {
    AuthWrite {
        user_id: USER.into(),
        workspace_id: WORKSPACE.into(),
        role: Role::Owner,
        source: crate::audit::SOURCE_WEB,
    }
}

async fn invite(pool: &PgPool, email: &str) {
    let state = test_support::state(pool.clone(), NOWHERE);
    let (status, _) = workspaces::create_invite(
        State(state),
        owner_write(),
        RequestId("req".into()),
        Json(InviteRequest {
            email: email.into(),
            role: Role::Member,
        }),
    )
    .await
    .map_err(|_| "invite refused")
    .unwrap();
    assert_eq!(status, axum::http::StatusCode::CREATED);
}

/// PUSH-4: an invitation to an address with an account pushes to it, and
/// the push carries no invitation token.
#[sqlx::test(migrations = "../../migrations")]
async fn should_push_an_invitation_to_an_existing_account(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ('usr_guest', 'Guest@Example.com', 'x')",
    )
    .execute(&pool)
    .await
    .unwrap();
    let guest = token();
    sqlx::query(
        "INSERT INTO device_tokens (id, user_id, platform, token) VALUES ('d_guest', 'usr_guest', 'ios', $1)",
    )
    .bind(&guest)
    .execute(&pool)
    .await
    .unwrap();

    invite(&pool, "guest@example.com").await;

    let sent = recorder.sent_to(&guest);
    assert_eq!(sent.len(), 1);
    assert_eq!(sent[0].route, "/workspaces");
    assert_eq!(
        sent[0].body,
        "You have been invited to Home. Open the invitation email to join."
    );
}

/// PUSH-4: an address nobody has signed up with gets the email only.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_push_an_invitation_to_an_unknown_address(pool: PgPool) {
    let recorder = recorder();
    fixture(&pool).await;
    // Every device in this database: none of them is the invitee's.
    let owner = device(&pool, USER).await;
    let member = device(&pool, MEMBER).await;

    invite(&pool, "nobody@example.com").await;

    assert!(recorder.sent_to(&owner).is_empty());
    assert!(recorder.sent_to(&member).is_empty());
}
