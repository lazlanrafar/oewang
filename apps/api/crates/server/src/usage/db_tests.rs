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
