//! The usage figures against a real database (USG-1, USG-2).
//!
//! Both are claims about rows: storage is derived from the vault's rows
//! rather than kept as a counter, and the token ledger only ever grows. A
//! unit test of the sums could not see either.

use oewang_db::repositories::{usage, vault};
use sqlx::PgPool;

use super::{Feature, Meter, Usage};

const WORKSPACE: &str = "ws_us";
const USER: &str = "usr_us";

async fn fixture(pool: &PgPool) {
    for sql in [
        "INSERT INTO users (id, email, password_hash) VALUES ('usr_us', 'us@example.com', 'x')",
        "INSERT INTO workspaces (id, name, slug, currency_code)
         VALUES ('ws_us', 'Home', 'home', 'IDR'), ('ws_other', 'Other', 'other', 'IDR')",
    ] {
        sqlx::query(sql).execute(pool).await.unwrap();
    }
}

async fn file(pool: &PgPool, id: &str, workspace_id: &str, size: i64, status: &str) {
    sqlx::query(
        "INSERT INTO vault_files (id, workspace_id, name, key, size, type, status)
         VALUES ($1, $2, 'r.jpg', $1, $3, 'image/jpeg', $4)",
    )
    .bind(id)
    .bind(workspace_id)
    .bind(size)
    .bind(status)
    .execute(pool)
    .await
    .unwrap();
}

fn tokens(input: i64, output: i64) -> Usage {
    Usage {
        input,
        output,
        model: Some("test-model".into()),
    }
}

/// USG-1: ready, live files of this workspace only, and nothing stored, so
/// a deleted file leaves the total the moment it is deleted.
#[sqlx::test(migrations = "../../migrations")]
async fn should_derive_storage_from_ready_live_files_of_the_workspace(pool: PgPool) {
    fixture(&pool).await;
    file(&pool, "f_a", WORKSPACE, 1_000, "ready").await;
    file(&pool, "f_b", WORKSPACE, 250, "ready").await;
    // An upload that never completed is not stored yet.
    file(&pool, "f_pending", WORKSPACE, 4_000, "pending").await;
    file(&pool, "f_theirs", "ws_other", 9_000, "ready").await;

    let used = vault::storage_usage(&pool, WORKSPACE).await.unwrap();
    assert_eq!((used.bytes, used.files), (1_250, 2));

    sqlx::query("UPDATE vault_files SET deleted_at = now() WHERE id = 'f_a'")
        .execute(&pool)
        .await
        .unwrap();
    let used = vault::storage_usage(&pool, WORKSPACE).await.unwrap();
    assert_eq!((used.bytes, used.files), (250, 1));
}

/// USG-1: an empty vault is zero, not an error or a missing row.
#[sqlx::test(migrations = "../../migrations")]
async fn should_report_an_empty_vault_as_zero(pool: PgPool) {
    fixture(&pool).await;
    let used = vault::storage_usage(&pool, WORKSPACE).await.unwrap();
    assert_eq!((used.bytes, used.files), (0, 0));
}

/// USG-2: each call is its own row, with the feature, the model and the
/// member, and the totals are the sum of every row.
#[sqlx::test(migrations = "../../migrations")]
async fn should_append_one_row_per_model_call(pool: PgPool) {
    fixture(&pool).await;
    let meter = Meter::new(&pool, WORKSPACE, Some(USER));

    meter.record(Feature::Receipt, Some(&tokens(100, 10))).await;
    meter.record(Feature::Receipt, Some(&tokens(50, 5))).await;
    meter.record(Feature::Chat, Some(&tokens(7, 3))).await;

    type Row = (String, Option<String>, Option<String>, i32, i32);
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT feature, model, user_id, input_tokens, output_tokens
         FROM ai_usage WHERE workspace_id = $1 ORDER BY feature, input_tokens",
    )
    .bind(WORKSPACE)
    .fetch_all(&pool)
    .await
    .unwrap();
    let model = Some("test-model".to_string());
    let user = Some(USER.to_string());
    assert_eq!(
        rows,
        [
            ("chat".into(), model.clone(), user.clone(), 7, 3),
            ("receipt".into(), model.clone(), user.clone(), 50, 5),
            ("receipt".into(), model, user, 100, 10),
        ]
    );

    let totals = usage::totals_by_feature(&pool, WORKSPACE).await.unwrap();
    let receipt = totals.iter().find(|row| row.feature == "receipt").unwrap();
    assert_eq!(
        (receipt.total_input, receipt.total_output, receipt.calls),
        (150, 15, 2)
    );
    assert_eq!((receipt.month_input, receipt.month_output), (150, 15));
}

/// USG-2: a call that reported no tokens leaves no row.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_record_a_call_that_spent_nothing(pool: PgPool) {
    fixture(&pool).await;
    let meter = Meter::new(&pool, WORKSPACE, None);

    meter.record(Feature::Categorize, None).await;
    meter.record(Feature::Categorize, Some(&tokens(0, 0))).await;

    let rows: i64 = sqlx::query_scalar("SELECT count(*) FROM ai_usage")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(rows, 0);
}

/// USG-2: a record the database refuses returns normally. The insert here
/// fails on the workspace foreign key; the caller's reply must not.
#[sqlx::test(migrations = "../../migrations")]
async fn should_never_fail_the_call_when_the_record_fails(pool: PgPool) {
    fixture(&pool).await;

    Meter::new(&pool, "ws_missing", Some(USER))
        .record(Feature::Chat, Some(&tokens(10, 1)))
        .await;
    // A closed pool is the other way a write fails.
    pool.close().await;
    Meter::new(&pool, WORKSPACE, Some(USER))
        .record(Feature::Chat, Some(&tokens(10, 1)))
        .await;
}

/// USG-2: append-only is a rule about the code, since the table cannot
/// tell an update from a correction. The one module that writes it only
/// inserts.
#[test]
fn should_only_ever_insert_into_the_ledger() {
    let source = include_str!("../../../db/src/repositories/usage.rs").to_uppercase();
    assert!(source.contains("INSERT INTO AI_USAGE"));
    for statement in ["UPDATE AI_USAGE", "DELETE FROM AI_USAGE", "ON CONFLICT"] {
        assert!(
            !source.contains(statement),
            "{statement} in the usage ledger"
        );
    }
}

// ------------------------------------------------------- plan limits (PLN-4, PLN-5)

/// Give the workspace a plan with these limits; null is unlimited.
async fn plan(pool: &PgPool, max_tokens: Option<i64>, max_bytes: Option<i64>) {
    sqlx::query(
        "INSERT INTO plans (id, name, max_tokens_month, max_storage_bytes)
         VALUES ('p_small', 'Small', $1, $2)",
    )
    .bind(max_tokens)
    .bind(max_bytes)
    .execute(pool)
    .await
    .unwrap();
    sqlx::query("UPDATE workspaces SET plan_id = 'p_small' WHERE id = $1")
        .bind(WORKSPACE)
        .execute(pool)
        .await
        .unwrap();
}

async fn ledger_rows(pool: &PgPool) -> i64 {
    sqlx::query_scalar("SELECT count(*) FROM ai_usage WHERE workspace_id = $1")
        .bind(WORKSPACE)
        .fetch_one(pool)
        .await
        .unwrap()
}

fn quota_tokens(result: oewang_domain::Result<()>) -> bool {
    matches!(result, Err(oewang_domain::AppError::QuotaTokensExceeded))
}

/// PLN-4: input plus output this month, compared at, below and past the
/// limit. Last month's tokens and another workspace's do not count.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_model_call_at_or_past_the_monthly_tokens(pool: PgPool) {
    fixture(&pool).await;
    plan(&pool, Some(100), None).await;
    sqlx::query(
        "INSERT INTO ai_usage (id, workspace_id, feature, input_tokens, output_tokens, created_at)
         VALUES ('u_last', $1, 'chat', 5000, 5000,
                 date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC' - interval '1 second'),
                ('u_theirs', 'ws_other', 'chat', 5000, 5000, now())",
    )
    .bind(WORKSPACE)
    .execute(&pool)
    .await
    .unwrap();
    let meter = Meter::new(&pool, WORKSPACE, Some(USER));

    meter.record(Feature::Chat, Some(&tokens(60, 39))).await;
    assert!(meter.check().await.is_ok(), "99 of 100 is below");

    meter.record(Feature::Receipt, Some(&tokens(0, 1))).await;
    assert!(quota_tokens(meter.check().await), "100 of 100 is at");

    meter.record(Feature::Chat, Some(&tokens(50, 0))).await;
    assert!(quota_tokens(meter.check().await), "150 of 100 is past");
}

/// PLN-5: stored bytes are ready, live files, as the usage page sums them;
/// the new file's declared size is added. Reaching the limit exactly is
/// allowed, one byte past is not, and the refusal reserves nothing.
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_an_upload_that_would_pass_the_storage_limit(pool: PgPool) {
    fixture(&pool).await;
    plan(&pool, None, Some(1_000)).await;
    file(&pool, "f_ready", WORKSPACE, 600, "ready").await;
    file(&pool, "f_pending", WORKSPACE, 4_000, "pending").await;
    file(&pool, "f_theirs", "ws_other", 9_000, "ready").await;
    let actor = crate::audit::Actor::web(WORKSPACE, USER);
    let begin = |size| {
        crate::vault::service::begin(&pool, actor, "r.jpg", "image/jpeg", size, 0, 10_000_000)
    };

    let error = begin(401).await.unwrap_err();
    assert!(
        matches!(error, oewang_domain::AppError::QuotaStorageExceeded),
        "{error:?}"
    );
    let files: i64 = sqlx::query_scalar("SELECT count(*) FROM vault_files WHERE workspace_id = $1")
        .bind(WORKSPACE)
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(files, 2, "nothing reserved, nothing stored touched");

    assert!(super::ensure_storage_left(&pool, WORKSPACE, 399)
        .await
        .is_ok());
    begin(400)
        .await
        .expect("exactly at the limit is not past it");
}

/// PLN-4, PLN-5: null limits are unlimited, and the seeded Free plan has
/// only nulls, so it blocks nobody.
#[sqlx::test(migrations = "../../migrations")]
async fn should_block_nothing_on_the_free_plan(pool: PgPool) {
    fixture(&pool).await;
    file(&pool, "f_big", WORKSPACE, i64::from(i32::MAX), "ready").await;
    let meter = Meter::new(&pool, WORKSPACE, Some(USER));
    meter
        .record(Feature::Chat, Some(&tokens(i64::MAX, i64::MAX)))
        .await;

    assert!(meter.check().await.is_ok());
    assert!(super::ensure_storage_left(&pool, WORKSPACE, i64::MAX)
        .await
        .is_ok());
}

static RECEIPT_CALLS: std::sync::atomic::AtomicUsize = std::sync::atomic::AtomicUsize::new(0);

fn counting_model(_path: &str, _body: &serde_json::Value) -> serde_json::Value {
    RECEIPT_CALLS.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
    serde_json::json!({ "usage": { "input": 5, "output": 5 } })
}

/// PLN-4: a refused call never reaches the AI service and writes no ledger
/// row. Lifting the limit lets the same call through, which proves the stub
/// would have counted it.
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_ask_the_ai_service_when_the_tokens_are_used_up(pool: PgPool) {
    use std::sync::atomic::Ordering;

    fixture(&pool).await;
    plan(&pool, Some(0), None).await;
    let url = crate::test_support::ai_service(pool.clone(), counting_model).await;
    let ai = crate::test_support::state(pool.clone(), &url).ai;
    let parse = || {
        crate::ai::extraction::parse_receipt(
            &ai,
            Meter::new(&pool, WORKSPACE, Some(USER)),
            "req_quota",
            "IDR",
            crate::ai::extraction::Document {
                media_type: "image/jpeg".into(),
                data: "AA==".into(),
            },
        )
    };

    let error = parse().await.unwrap_err();
    assert_eq!(error.code(), "QUOTA_TOKENS_EXCEEDED");
    assert_eq!(RECEIPT_CALLS.load(Ordering::SeqCst), 0);
    assert_eq!(ledger_rows(&pool).await, 0);

    sqlx::query("UPDATE plans SET max_tokens_month = NULL WHERE id = 'p_small'")
        .execute(&pool)
        .await
        .unwrap();
    parse().await.expect("unlimited now");
    assert_eq!(RECEIPT_CALLS.load(Ordering::SeqCst), 1);
    assert_eq!(ledger_rows(&pool).await, 1);
}
