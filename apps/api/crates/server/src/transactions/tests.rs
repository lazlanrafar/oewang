//! Service tests for the ledger.
//!
//! The balance arithmetic itself is unit-tested in `oewang_domain::ledger`
//! without a database. What is tested here is the part that only a database
//! can answer: that the row, the balances and the audit entry commit
//! together, that a reversal is exact, and that two concurrent writes
//! against one wallet produce the exact final balance.

use chrono::{DateTime, TimeZone, Utc};
use oewang_clients::RatesClient;
use oewang_domain::{ledger::TransactionType, AppError};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{
    audit::Actor,
    transactions::service::{self, Page, TransactionInput},
};

const WORKSPACE: &str = "ws_test";
const USER: &str = "usr_test";

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

/// A client with nowhere to call. Every lookup is a `None`, which is what
/// the ladder's cache steps exist for, and what keeps these tests off the
/// network.
fn offline_rates() -> RatesClient {
    RatesClient::new("http://rates.invalid".into(), None)
}

fn decimal(value: &str) -> Decimal {
    value.parse().unwrap()
}

fn day(day: u32) -> DateTime<Utc> {
    Utc.with_ymd_and_hms(2026, 11, day, 9, 0, 0).unwrap()
}

async fn fixture(pool: &PgPool, currency: &str) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'test@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, 'Test', 'test', $2)",
    )
    .bind(WORKSPACE)
    .bind(currency)
    .execute(pool)
    .await
    .unwrap();
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

async fn wallet(pool: &PgPool, id: &str, currency: &str) -> String {
    sqlx::query(
        "INSERT INTO wallets (id, workspace_id, name, currency_code) VALUES ($1, $2, $1, $3)",
    )
    .bind(id)
    .bind(WORKSPACE)
    .bind(currency)
    .execute(pool)
    .await
    .unwrap();
    id.to_string()
}

async fn category(pool: &PgPool, id: &str, kind: &str) -> String {
    sqlx::query("INSERT INTO categories (id, workspace_id, name, type) VALUES ($1, $2, $1, $3)")
        .bind(id)
        .bind(WORKSPACE)
        .bind(kind)
        .execute(pool)
        .await
        .unwrap();
    id.to_string()
}

async fn cache_rate(pool: &PgPool, base: &str, quote: &str, date: &str, rate: &str) {
    sqlx::query(
        "INSERT INTO exchange_rates (id, base_code, quote_code, date, rate)
         VALUES ($1, $2, $3, $4::date, $5::numeric)",
    )
    .bind(cuid2::create_id())
    .bind(base)
    .bind(quote)
    .bind(date)
    .bind(rate)
    .execute(pool)
    .await
    .unwrap();
}

async fn balance(pool: &PgPool, wallet_id: &str) -> Decimal {
    sqlx::query_scalar::<_, Decimal>("SELECT balance FROM wallets WHERE id = $1")
        .bind(wallet_id)
        .fetch_one(pool)
        .await
        .unwrap()
}

async fn audit_actions(pool: &PgPool, entity_id: &str) -> Vec<String> {
    sqlx::query_scalar::<_, String>(
        "SELECT action FROM audit_logs WHERE workspace_id = $1 AND entity_id = $2
         ORDER BY created_at, id",
    )
    .bind(WORKSPACE)
    .bind(entity_id)
    .fetch_all(pool)
    .await
    .unwrap()
}

fn expense<'a>(wallet_id: &'a str, amount: &str) -> TransactionInput<'a> {
    TransactionInput {
        kind: TransactionType::Expense,
        wallet_id,
        to_wallet_id: None,
        category_id: None,
        amount: decimal(amount),
        to_amount: None,
        original_amount: None,
        original_currency_code: None,
        exchange_rate: None,
        requested_base_rate: None,
        date: day(2),
        name: Some("Lunch"),
        description: None,
        is_ready: false,
    }
}

// ------------------------------------------------------------------ create

#[sqlx::test(migrations = "../../migrations")]
async fn should_move_the_balance_for_each_type(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let bank = wallet(&pool, "w_bank", "IDR").await;
    let rates = offline_rates();

    service::create(&pool, &rates, actor(), expense(&cash, "50000")).await.unwrap();
    assert_eq!(balance(&pool, &cash).await, decimal("-50000"));

    service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { kind: TransactionType::Income, amount: decimal("9500000"), ..expense(&bank, "0") },
    )
    .await
    .unwrap();
    assert_eq!(balance(&pool, &bank).await, decimal("9500000"));

    service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput {
            kind: TransactionType::Transfer,
            to_wallet_id: Some(&cash),
            to_amount: Some(decimal("100000")),
            amount: decimal("100000"),
            ..expense(&bank, "0")
        },
    )
    .await
    .unwrap();

    assert_eq!(balance(&pool, &bank).await, decimal("9400000"));
    assert_eq!(balance(&pool, &cash).await, decimal("50000"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_write_the_audit_row_in_the_same_transaction(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    let row = service::create(&pool, &offline_rates(), actor(), expense(&cash, "50000"))
        .await
        .unwrap();

    assert_eq!(audit_actions(&pool, &row.id).await, vec!["transaction.created"]);
    assert_eq!(row.source, "web", "the surface is recorded, not assumed");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_no_trace_when_a_create_is_refused(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    // A wallet from nowhere: the row is refused before anything is written.
    let error = service::create(&pool, &offline_rates(), actor(), expense("w_ghost", "50000"))
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::WalletNotFound), "{error:?}");

    assert_eq!(balance(&pool, &cash).await, Decimal::ZERO);
    let total: i64 = sqlx::query_scalar("SELECT count(*) FROM audit_logs")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(total, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_category_from_another_workspace(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code)
         VALUES ('ws_other', 'Other', 'other', 'IDR')",
    )
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO categories (id, workspace_id, name, type)
         VALUES ('c_theirs', 'ws_other', 'Food', 'expense')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let error = service::create(
        &pool,
        &offline_rates(),
        actor(),
        TransactionInput { category_id: Some("c_theirs"), ..expense(&cash, "1000") },
    )
    .await
    .unwrap_err();

    assert!(matches!(error, AppError::CategoryNotFound), "{error:?}");
}

// ----------------------------------------------------------- multicurrency

/// The worked example from docs/data-model.md: USD 50 from the USD wallet in
/// an IDR workspace, converted once at write time.
#[sqlx::test(migrations = "../../migrations")]
async fn should_store_the_base_amount_in_the_workspace_currency(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wise = wallet(&pool, "w_wise", "USD").await;
    cache_rate(&pool, "USD", "IDR", "2026-11-02", "16250").await;

    let row = service::create(&pool, &offline_rates(), actor(), expense(&wise, "50"))
        .await
        .unwrap();

    assert_eq!(row.amount, decimal("50.0000"), "the wallet's own currency");
    assert_eq!(row.base_amount, decimal("812500.0000"), "for reporting");
    assert_eq!(row.base_rate, decimal("16250.00000000"));
    assert_eq!(row.base_rate_source, "live");
    assert_eq!(balance(&pool, &wise).await, decimal("-50"), "the balance moves in USD");
}

/// The other worked example: USD 50 paid from the IDR wallet. The entry
/// currency differed, so the three foreign columns are filled.
#[sqlx::test(migrations = "../../migrations")]
async fn should_keep_what_the_user_typed_when_the_entry_currency_differed(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let bca = wallet(&pool, "w_bca", "IDR").await;

    let row = service::create(
        &pool,
        &offline_rates(),
        actor(),
        TransactionInput {
            amount: decimal("812500"),
            original_amount: Some(decimal("50")),
            original_currency_code: Some("usd"),
            exchange_rate: Some(decimal("16250")),
            ..expense(&bca, "0")
        },
    )
    .await
    .unwrap();

    assert_eq!(row.amount, decimal("812500.0000"));
    assert_eq!(row.original_amount, Some(decimal("50.0000")));
    assert_eq!(row.original_currency_code.as_deref(), Some("USD"));
    assert_eq!(row.base_rate_source, "same", "the wallet is already the workspace currency");
    assert_eq!(row.base_amount, decimal("812500.0000"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_foreign_entry_whose_arithmetic_does_not_hold(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let bca = wallet(&pool, "w_bca", "IDR").await;

    let error = service::create(
        &pool,
        &offline_rates(),
        actor(),
        TransactionInput {
            amount: decimal("800000"),
            original_amount: Some(decimal("50")),
            original_currency_code: Some("USD"),
            exchange_rate: Some(decimal("16250")),
            ..expense(&bca, "0")
        },
    )
    .await
    .unwrap_err();

    assert!(matches!(error, AppError::Validation(_)), "{error:?}");
}

/// Every step of the resolution ladder, in order (TXN-22, D43).
#[sqlx::test(migrations = "../../migrations")]
async fn should_walk_every_step_of_the_rate_ladder(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let idr = wallet(&pool, "w_idr", "IDR").await;
    let usd = wallet(&pool, "w_usd", "USD").await;
    let rates = offline_rates();

    // 1. Same currency: rate one, nothing looked up.
    let same = service::create(&pool, &rates, actor(), expense(&idr, "1000")).await.unwrap();
    assert_eq!(same.base_rate_source, "same");
    assert_eq!(same.base_rate, decimal("1.00000000"));

    // 5. Nothing at all: refused, and the form asks for a rate.
    let nothing = service::create(&pool, &rates, actor(), expense(&usd, "50"))
        .await
        .unwrap_err();
    assert!(matches!(nothing, AppError::FxRateUnavailable), "{nothing:?}");

    // 2. The request: the rate the user confirmed wins over any lookup.
    let requested = service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { requested_base_rate: Some(decimal("16000")), ..expense(&usd, "50") },
    )
    .await
    .unwrap();
    assert_eq!(requested.base_rate_source, "user");
    assert_eq!(requested.base_amount, decimal("800000.0000"));

    // 3. The source's rate for the day, read from where it was cached.
    cache_rate(&pool, "USD", "IDR", "2026-11-02", "16250").await;
    let live = service::create(&pool, &rates, actor(), expense(&usd, "50")).await.unwrap();
    assert_eq!(live.base_rate_source, "live");
    assert_eq!(live.base_amount, decimal("812500.0000"));

    // 4. The source is down and the day has no rate: the newest one, marked.
    let stale = service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { date: day(5), ..expense(&usd, "50") },
    )
    .await
    .unwrap();
    assert_eq!(stale.base_rate_source, "cache");
    assert_eq!(
        stale.base_rate_date.to_string(),
        "2026-11-02",
        "the row records how old the rate it used was"
    );
}

/// What the PRD promises about history: today's rate moving does not move
/// yesterday's total, because the conversion already happened (TXN-19).
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_move_a_historical_total_when_todays_rate_changes(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let usd = wallet(&pool, "w_usd", "USD").await;
    cache_rate(&pool, "USD", "IDR", "2026-11-02", "16250").await;

    service::create(&pool, &offline_rates(), actor(), expense(&usd, "50")).await.unwrap();

    let before = total_expense(&pool).await;

    // The rate doubles overnight.
    sqlx::query("UPDATE exchange_rates SET rate = 32500 WHERE date = '2026-11-02'")
        .execute(&pool)
        .await
        .unwrap();

    assert_eq!(total_expense(&pool).await, before, "a report is a plain sum of base_amount");
}

async fn total_expense(pool: &PgPool) -> Decimal {
    let (by_type, _) = service::summary(pool, WORKSPACE, &Default::default()).await.unwrap();
    by_type
        .into_iter()
        .find(|row| row.r#type == "expense")
        .map(|row| row.total)
        .unwrap_or_default()
}

// ------------------------------------------------------------------ update

#[sqlx::test(migrations = "../../migrations")]
async fn should_reverse_the_old_effect_and_apply_the_new_one(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let rates = offline_rates();

    let row = service::create(&pool, &rates, actor(), expense(&cash, "50000")).await.unwrap();
    assert_eq!(balance(&pool, &cash).await, decimal("-50000"));

    service::update(&pool, &rates, actor(), &row.id, expense(&cash, "87500"))
        .await
        .unwrap();

    assert_eq!(
        balance(&pool, &cash).await,
        decimal("-87500"),
        "not -137500: the old effect was reversed, not stacked on"
    );
}

/// All nine transitions, plus a changed wallet, against a real database.
#[sqlx::test(migrations = "../../migrations")]
async fn should_recompute_every_type_transition(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let a = wallet(&pool, "w_a", "IDR").await;
    let b = wallet(&pool, "w_b", "IDR").await;
    let rates = offline_rates();

    let types = [TransactionType::Expense, TransactionType::Income, TransactionType::Transfer];

    for from in types {
        for to in types {
            // A fresh pair of balances per case, so each one is read alone.
            sqlx::query("UPDATE wallets SET balance = 0").execute(&pool).await.unwrap();

            let make = |kind: TransactionType, amount: &str| TransactionInput {
                kind,
                to_wallet_id: matches!(kind, TransactionType::Transfer).then_some(b.as_str()),
                to_amount: matches!(kind, TransactionType::Transfer)
                    .then(|| decimal(amount)),
                amount: decimal(amount),
                ..expense(&a, "0")
            };

            let row = service::create(&pool, &rates, actor(), make(from, "50000"))
                .await
                .unwrap();
            service::update(&pool, &rates, actor(), &row.id, make(to, "87500"))
                .await
                .unwrap();

            let (expected_a, expected_b) = match to {
                TransactionType::Expense => (decimal("-87500"), Decimal::ZERO),
                TransactionType::Income => (decimal("87500"), Decimal::ZERO),
                TransactionType::Transfer => (decimal("-87500"), decimal("87500")),
            };

            assert_eq!(balance(&pool, &a).await, expected_a, "{from:?} -> {to:?} on the source");
            assert_eq!(balance(&pool, &b).await, expected_b, "{from:?} -> {to:?} on the target");

            service::delete(&pool, actor(), &row.id).await.unwrap();
        }
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_follow_a_transaction_that_moves_to_another_wallet(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let a = wallet(&pool, "w_a", "IDR").await;
    let b = wallet(&pool, "w_b", "IDR").await;
    let rates = offline_rates();

    let row = service::create(&pool, &rates, actor(), expense(&a, "50000")).await.unwrap();
    service::update(&pool, &rates, actor(), &row.id, expense(&b, "50000")).await.unwrap();

    assert_eq!(balance(&pool, &a).await, Decimal::ZERO, "the first wallet is made whole");
    assert_eq!(balance(&pool, &b).await, decimal("-50000"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_record_before_and_after_on_an_update(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let rates = offline_rates();

    let row = service::create(&pool, &rates, actor(), expense(&cash, "50000")).await.unwrap();
    service::update(&pool, &rates, actor(), &row.id, expense(&cash, "87500")).await.unwrap();

    let entry: (Option<serde_json::Value>, Option<serde_json::Value>) = sqlx::query_as(
        "SELECT before, after FROM audit_logs WHERE entity_id = $1 AND action = 'transaction.updated'",
    )
    .bind(&row.id)
    .fetch_one(&pool)
    .await
    .unwrap();

    assert_eq!(entry.0.unwrap()["amount"], serde_json::json!("50000.0000"));
    assert_eq!(entry.1.unwrap()["amount"], serde_json::json!("87500.0000"));
}

// ------------------------------------------------------------------ delete

#[sqlx::test(migrations = "../../migrations")]
async fn should_reverse_the_balance_when_a_transaction_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let a = wallet(&pool, "w_a", "IDR").await;
    let b = wallet(&pool, "w_b", "IDR").await;
    let rates = offline_rates();

    let transfer = service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput {
            kind: TransactionType::Transfer,
            to_wallet_id: Some(&b),
            to_amount: Some(decimal("50000")),
            amount: decimal("50000"),
            ..expense(&a, "0")
        },
    )
    .await
    .unwrap();

    service::delete(&pool, actor(), &transfer.id).await.unwrap();

    assert_eq!(balance(&pool, &a).await, Decimal::ZERO);
    assert_eq!(balance(&pool, &b).await, Decimal::ZERO);
    assert!(matches!(
        service::find(&pool, WORKSPACE, &transfer.id).await.unwrap_err(),
        AppError::TransactionNotFound
    ));
    assert_eq!(
        audit_actions(&pool, &transfer.id).await,
        vec!["transaction.created", "transaction.deleted"]
    );
}

// ------------------------------------------------------------- concurrency

/// Two parallel creates against one wallet give the exact final balance.
///
/// The balance moves by a bound delta on a locked row, never by writing a
/// total that was read a moment ago, which is the shape that loses a write
/// under concurrency.
#[sqlx::test(migrations = "../../migrations")]
async fn should_give_the_exact_balance_when_two_writes_race(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    let mut handles = Vec::new();
    for _ in 0..8 {
        let pool = pool.clone();
        let cash = cash.clone();
        handles.push(tokio::spawn(async move {
            service::create(&pool, &offline_rates(), actor(), expense(&cash, "1000"))
                .await
                .unwrap();
        }));
    }
    for handle in handles {
        handle.await.unwrap();
    }

    assert_eq!(balance(&pool, &cash).await, decimal("-8000"));
}

/// Two transfers in opposite directions cannot deadlock, because both lock
/// their wallets in ascending ID order (D13).
#[sqlx::test(migrations = "../../migrations")]
async fn should_not_deadlock_on_opposite_transfers(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let a = wallet(&pool, "w_a", "IDR").await;
    let b = wallet(&pool, "w_b", "IDR").await;

    let transfer = |from: String, to: String| {
        let pool = pool.clone();
        tokio::spawn(async move {
            for _ in 0..10 {
                service::create(
                    &pool,
                    &offline_rates(),
                    actor(),
                    TransactionInput {
                        kind: TransactionType::Transfer,
                        wallet_id: Box::leak(from.clone().into_boxed_str()),
                        to_wallet_id: Some(Box::leak(to.clone().into_boxed_str())),
                        to_amount: Some(decimal("100")),
                        amount: decimal("100"),
                        ..expense("", "0")
                    },
                )
                .await
                .unwrap();
            }
        })
    };

    let one = transfer(a.clone(), b.clone());
    let other = transfer(b.clone(), a.clone());
    one.await.unwrap();
    other.await.unwrap();

    assert_eq!(balance(&pool, &a).await, Decimal::ZERO, "ten each way nets to nothing");
    assert_eq!(balance(&pool, &b).await, Decimal::ZERO);
}

// -------------------------------------------------------------------- bulk

#[sqlx::test(migrations = "../../migrations")]
async fn should_skip_a_duplicate_rather_than_fail_the_import(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    let rows = vec![
        expense(&cash, "50000"),
        // Identical to the first, which is what a re-imported statement
        // looks like.
        expense(&cash, "50000"),
        expense(&cash, "87500"),
    ];

    let outcome = service::bulk_create(&pool, actor(), rows).await.unwrap();

    assert_eq!(outcome.created, 2);
    assert_eq!(outcome.duplicates, 1);
    assert!(outcome.skipped.is_empty());
    assert_eq!(balance(&pool, &cash).await, decimal("-137500"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_report_a_bad_row_and_commit_the_rest(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    let outcome = service::bulk_create(
        &pool,
        actor(),
        vec![
            expense(&cash, "50000"),
            TransactionInput { amount: Decimal::ZERO, ..expense(&cash, "0") },
            expense(&cash, "87500"),
        ],
    )
    .await
    .unwrap();

    assert_eq!(outcome.created, 2);
    assert_eq!(outcome.skipped.len(), 1);
    assert_eq!(outcome.skipped[0].index, 1);
    assert_eq!(outcome.skipped[0].code, "AMOUNT_NOT_POSITIVE");
    assert_eq!(balance(&pool, &cash).await, decimal("-137500"));
}

/// An imported row converts at the rate for its own date, not today's, and
/// a row with no rate for its date is skipped and reported (TXN-23, D45).
#[sqlx::test(migrations = "../../migrations")]
async fn should_convert_each_imported_row_at_its_own_dates_rate(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let usd = wallet(&pool, "w_usd", "USD").await;
    cache_rate(&pool, "USD", "IDR", "2026-11-02", "16250").await;
    cache_rate(&pool, "USD", "IDR", "2026-11-03", "16500").await;

    let outcome = service::bulk_create(
        &pool,
        actor(),
        vec![
            TransactionInput { date: day(2), ..expense(&usd, "10") },
            TransactionInput { date: day(3), ..expense(&usd, "10") },
            // No rate was ever cached for this day.
            TransactionInput { date: day(4), ..expense(&usd, "10") },
        ],
    )
    .await
    .unwrap();

    assert_eq!(outcome.created, 2);
    assert_eq!(outcome.skipped.len(), 1);
    assert_eq!(
        outcome.skipped[0].code, "FX_RATE_UNAVAILABLE",
        "reported apart from an invalid row, because the fix is a rate backfill"
    );

    let totals: Vec<Decimal> = sqlx::query_scalar(
        "SELECT base_amount FROM transactions ORDER BY date",
    )
    .fetch_all(&pool)
    .await
    .unwrap();
    assert_eq!(totals, vec![decimal("162500.0000"), decimal("165000.0000")]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_apply_a_bulk_category_change_in_one_transaction(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let food = category(&pool, "c_food", "expense").await;
    let rates = offline_rates();

    let mut ids = Vec::new();
    for amount in ["1000", "2000", "3000"] {
        ids.push(service::create(&pool, &rates, actor(), expense(&cash, amount)).await.unwrap().id);
    }

    let affected = service::bulk_update(&pool, actor(), &ids, Some(Some(&food)), Some(true))
        .await
        .unwrap();
    assert_eq!(affected, 3);

    let (rows, _) = service::list(
        &pool,
        WORKSPACE,
        &Default::default(),
        Default::default(),
        Default::default(),
        Page::new(None, None),
    )
    .await
    .unwrap();

    assert!(rows.iter().all(|row| row.category_id.as_deref() == Some(food.as_str())));
    assert!(rows.iter().all(|row| row.is_ready));
    assert_eq!(balance(&pool, &cash).await, decimal("-6000"), "a label change moves no money");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_reverse_every_balance_on_a_bulk_delete(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let rates = offline_rates();

    let mut ids = Vec::new();
    for amount in ["1000", "2000", "3000"] {
        ids.push(service::create(&pool, &rates, actor(), expense(&cash, amount)).await.unwrap().id);
    }
    assert_eq!(balance(&pool, &cash).await, decimal("-6000"));

    assert_eq!(service::bulk_delete(&pool, actor(), &ids).await.unwrap(), 3);
    assert_eq!(balance(&pool, &cash).await, Decimal::ZERO);

    for id in &ids {
        assert_eq!(audit_actions(&pool, id).await.last().unwrap(), "transaction.deleted");
    }
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_cap_a_bulk_action(pool: PgPool) {
    fixture(&pool, "IDR").await;

    let ids: Vec<String> = (0..501).map(|n| format!("t_{n}")).collect();
    assert!(service::bulk_delete(&pool, actor(), &ids).await.is_err());
    assert!(service::bulk_delete(&pool, actor(), &[]).await.is_err());
}

// -------------------------------------------------------------- list, read

#[sqlx::test(migrations = "../../migrations")]
async fn should_filter_search_and_page_the_list(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let bank = wallet(&pool, "w_bank", "IDR").await;
    let food = category(&pool, "c_food", "expense").await;
    let rates = offline_rates();

    service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { name: Some("Warung Tekko"), category_id: Some(&food), ..expense(&cash, "50000") },
    )
    .await
    .unwrap();
    service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { name: Some("Gojek"), date: day(3), ..expense(&cash, "24000") },
    )
    .await
    .unwrap();
    service::create(
        &pool,
        &rates,
        actor(),
        TransactionInput { name: Some("Electricity"), date: day(4), ..expense(&bank, "412000") },
    )
    .await
    .unwrap();

    let page = Page::new(None, None);
    async fn matching(pool: &PgPool, filters: service::TransactionFilters<'_>) -> (usize, i64) {
        let (rows, total) = service::list(
            pool,
            WORKSPACE,
            &filters,
            Default::default(),
            Default::default(),
            Page::new(None, None),
        )
        .await
        .unwrap();
        (rows.len(), total)
    }

    assert_eq!(
        matching(&pool, service::TransactionFilters { wallet_id: Some(&cash), ..Default::default() }).await,
        (2, 2)
    );
    assert_eq!(
        matching(&pool, service::TransactionFilters { category_id: Some(&food), ..Default::default() }).await.0,
        1
    );

    // Case-insensitive, and the pattern is bound, never formatted in.
    assert_eq!(
        matching(&pool, service::TransactionFilters { search: Some("tekko"), ..Default::default() }).await.0,
        1
    );
    assert_eq!(
        matching(&pool, service::TransactionFilters { search: Some("%"), ..Default::default() }).await.0,
        0,
        "a wildcard typed by a user is a literal percent sign"
    );
    assert_eq!(
        matching(
            &pool,
            service::TransactionFilters {
                start_date: Some(day(3)),
                end_date: Some(day(3)),
                ..Default::default()
            }
        )
        .await
        .0,
        1,
        "an end date is inclusive of its whole day"
    );

    let (rows, total) = service::list(
        &pool,
        WORKSPACE,
        &Default::default(),
        Default::default(),
        Default::default(),
        Page::new(Some(2), Some(2)),
    )
    .await
    .unwrap();
    assert_eq!((rows.len(), total), (1, 3), "page two of three rows");
    let _ = page;
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_join_the_names_the_table_renders(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let bank = wallet(&pool, "w_bank", "IDR").await;
    let food = category(&pool, "c_food", "expense").await;

    let row = service::create(
        &pool,
        &offline_rates(),
        actor(),
        TransactionInput {
            kind: TransactionType::Transfer,
            to_wallet_id: Some(&bank),
            to_amount: Some(decimal("1000")),
            amount: decimal("1000"),
            category_id: Some(&food),
            ..expense(&cash, "0")
        },
    )
    .await
    .unwrap();

    let detail = service::find(&pool, WORKSPACE, &row.id).await.unwrap();
    assert_eq!(detail.wallet_name, "w_cash");
    assert_eq!(detail.to_wallet_name.as_deref(), Some("w_bank"));
    assert_eq!(detail.category_name.as_deref(), Some("c_food"));
    assert_eq!(detail.wallet_currency_code, "IDR");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_list_a_soft_deleted_row(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    let row = service::create(&pool, &offline_rates(), actor(), expense(&cash, "1000"))
        .await
        .unwrap();
    service::delete(&pool, actor(), &row.id).await.unwrap();

    let (rows, total) = service::list(
        &pool,
        WORKSPACE,
        &Default::default(),
        Default::default(),
        Default::default(),
        Page::new(None, None),
    )
    .await
    .unwrap();
    assert!(rows.is_empty());
    assert_eq!(total, 0);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_return_the_history_of_one_transaction(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let rates = offline_rates();

    let row = service::create(&pool, &rates, actor(), expense(&cash, "50000")).await.unwrap();
    service::update(&pool, &rates, actor(), &row.id, expense(&cash, "87500")).await.unwrap();

    let history = service::history(&pool, WORKSPACE, &row.id).await.unwrap();

    assert_eq!(history.len(), 2);
    assert_eq!(history[0].action, "transaction.updated", "newest first");
    assert_eq!(history[0].user_email, "test@example.com");
    assert_eq!(history[0].source, "web");
}

// ------------------------------------------------------------------ export

#[sqlx::test(migrations = "../../migrations")]
async fn should_export_unformatted_decimals_and_mark_the_rows(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;

    service::create(
        &pool,
        &offline_rates(),
        actor(),
        TransactionInput {
            name: Some("Lunch"),
            // A comma in free text must not shift the columns after it.
            description: Some("Lunch, with the team"),
            ..expense(&cash, "50000")
        },
    )
    .await
    .unwrap();

    let csv = service::export(
        &pool,
        actor(),
        &Default::default(),
        Default::default(),
        Default::default(),
    )
    .await
    .unwrap();

    let lines: Vec<&str> = csv.lines().collect();
    assert!(lines[0].starts_with("Date,Type,Amount,Category,Wallet,To Wallet,Description"));
    assert!(lines[1].starts_with("2026-11-02,expense,50000.0000,"));
    assert!(lines[1].contains("\"Lunch, with the team\""));

    let exported: bool = sqlx::query_scalar("SELECT is_exported FROM transactions LIMIT 1")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert!(exported, "an export marks what it covered (TXN-10)");
}

// --------------------------------------------------------------- isolation

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_reach_another_workspaces_transaction(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code)
         VALUES ('ws_other', 'Other', 'other', 'IDR')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let row = service::create(&pool, &offline_rates(), actor(), expense(&cash, "1000"))
        .await
        .unwrap();

    let intruder = Actor::web("ws_other", USER);
    assert!(matches!(
        service::find(&pool, "ws_other", &row.id).await.unwrap_err(),
        AppError::TransactionNotFound
    ));
    assert!(matches!(
        service::delete(&pool, intruder, &row.id).await.unwrap_err(),
        AppError::TransactionNotFound
    ));
    assert_eq!(balance(&pool, &cash).await, decimal("-1000"), "untouched");
}

// ------------------------------------------------------------- csv import

/// The shape an Indonesian bank export has, end to end (TXN-11, D28).
#[sqlx::test(migrations = "../../migrations")]
async fn should_import_a_statement_and_report_what_it_could_not_read(pool: PgPool) {
    use oewang_domain::csv_import::ColumnMapping;

    fixture(&pool, "IDR").await;
    let cash = wallet(&pool, "w_cash", "IDR").await;
    let food = category(&pool, "c_food", "expense").await;

    let mapping = ColumnMapping {
        date: Some("Tanggal".into()),
        name: Some("Keterangan".into()),
        amount_out: Some("Debet".into()),
        amount_in: Some("Kredit".into()),
        category: Some("Kategori".into()),
        ..Default::default()
    };

    let row = |date: &str, name: &str, out: &str, incoming: &str, kind: &str| {
        [
            ("Tanggal", date),
            ("Keterangan", name),
            ("Debet", out),
            ("Kredit", incoming),
            ("Kategori", kind),
        ]
        .into_iter()
        .map(|(k, v)| (k.to_string(), v.to_string()))
        .collect::<std::collections::BTreeMap<_, _>>()
    };

    let rows = vec![
        row("02/11/2026", "WARUNG TEKKO", "50.000", "", "Food"),
        row("01/11/2026", "GAJI", "", "9.500.000", ""),
        // Unreadable: reported, not fatal.
        row("whenever", "BROKEN", "1.000", "", ""),
        // A duplicate of the first, which is what a re-upload looks like.
        row("02/11/2026", "WARUNG TEKKO", "50.000", "", "Food"),
    ];

    let categories = [("food".to_string(), food.clone())].into_iter().collect();

    let outcome = service::import_rows(
        &pool,
        actor().with_source(crate::audit::SOURCE_IMPORT),
        &cash,
        &mapping,
        &rows,
        &categories,
    )
    .await
    .unwrap();

    assert_eq!(outcome.created, 2);
    assert_eq!(outcome.duplicates, 1, "the same row twice is counted, not failed");
    assert_eq!(outcome.skipped.len(), 1);
    assert_eq!(outcome.skipped[0].index, 2, "the index is the file's line, not the batch's");

    // The debit became an expense and the credit an income, and the sign
    // rule is in code rather than in the model (D28).
    assert_eq!(balance(&pool, &cash).await, decimal("9450000"));

    let categorised: Option<String> =
        sqlx::query_scalar("SELECT category_id FROM transactions WHERE name = 'WARUNG TEKKO'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(categorised.as_deref(), Some(food.as_str()));

    // Every imported row says where it came from (D14).
    let sources: Vec<String> = sqlx::query_scalar("SELECT DISTINCT source FROM transactions")
        .fetch_all(&pool)
        .await
        .unwrap();
    assert_eq!(sources, vec!["import"]);
}

/// The guarantee the whole design rests on: the model maps column names and
/// never sees a figure (D28, AI-9).
#[test]
fn should_keep_every_amount_out_of_what_the_model_is_shown() {
    use oewang_domain::csv_import::ColumnMapping;

    let mapping = ColumnMapping {
        date: Some("Tanggal".into()),
        amount_out: Some("Debet".into()),
        ..Default::default()
    };

    // A mapping is column names and nothing else. Serializing it is the
    // only thing that crosses to the AI service, so a figure appearing in
    // this string would be a figure the model could read.
    let wire = serde_json::to_string(&mapping).unwrap();

    assert!(wire.contains("Debet"));
    assert!(
        !wire.chars().any(|c| c.is_ascii_digit()),
        "a mapping carries no figures: {wire}"
    );
}
