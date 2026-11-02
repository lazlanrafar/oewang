//! Service tests for wallets, wallet groups and categories.
//!
//! The rules here are transactional, so they are tested against a real
//! database rather than a mock: `#[sqlx::test]` gives each test its own
//! schema and drops it afterwards.

use oewang_domain::AppError;
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::accounts::service::{self, Actor, NewWalletInput, WalletPatchInput};

const WORKSPACE: &str = "ws_test";
const USER: &str = "usr_test";

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

/// A workspace with one owner and no wallets. The seed defaults are left out
/// on purpose: a test that creates its own wallets says what it depends on.
async fn fixture(pool: &PgPool, currency: &str) {
    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, 'test@example.com', 'x')",
    )
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

/// A transaction written straight to the table.
///
/// The transaction service is US-015; these tests only need a row that makes
/// a wallet look used, so they write one rather than wait for it.
async fn insert_transaction(pool: &PgPool, id: &str, wallet_id: &str, category_id: Option<&str>) {
    sqlx::query(
        "INSERT INTO transactions
           (id, workspace_id, wallet_id, category_id, amount, base_amount, base_rate,
            base_rate_source, base_rate_date, date, type)
         VALUES ($1, $2, $3, $4, 100, 100, 1, 'same', current_date, now(), 'expense')",
    )
    .bind(id)
    .bind(WORKSPACE)
    .bind(wallet_id)
    .bind(category_id)
    .execute(pool)
    .await
    .unwrap();
}

async fn make_wallet(pool: &PgPool, name: &str, currency: Option<&str>) -> String {
    service::create_wallet(
        pool,
        actor(),
        NewWalletInput {
            name,
            group_id: None,
            currency_code: currency,
            is_included_in_totals: None,
            sort_order: None,
        },
    )
    .await
    .unwrap()
    .id
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

// ---------------------------------------------------------------- wallets

#[sqlx::test(migrations = "../../migrations")]
async fn should_default_a_new_wallet_to_the_workspace_currency(pool: PgPool) {
    fixture(&pool, "IDR").await;

    let inherited = service::find_wallet(&pool, WORKSPACE, &make_wallet(&pool, "Cash", None).await)
        .await
        .unwrap();
    assert_eq!(inherited.currency_code, "IDR");
    assert_eq!(inherited.balance, Decimal::ZERO);

    let explicit = service::find_wallet(
        &pool,
        WORKSPACE,
        &make_wallet(&pool, "Euro", Some(" eur ")).await,
    )
    .await
    .unwrap();
    assert_eq!(explicit.currency_code, "EUR", "normalized on the way in");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_exactly_one_default_when_the_default_moves(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let first = make_wallet(&pool, "Cash", None).await;
    let second = make_wallet(&pool, "Bank", None).await;

    // A created wallet is not a default; the flag moves only through
    // set-default, so the invariant has one code path.
    assert_eq!(default_ids(&pool).await, Vec::<String>::new());

    service::set_default_wallet(&pool, actor(), &first).await.unwrap();
    assert_eq!(default_ids(&pool).await, vec![first.clone()]);

    service::set_default_wallet(&pool, actor(), &second).await.unwrap();
    assert_eq!(
        default_ids(&pool).await,
        vec![second.clone()],
        "the previous default is cleared in the same transaction (WAL-3)"
    );

    // Setting the one that is already default is a no-op, not a violation of
    // the partial unique index.
    service::set_default_wallet(&pool, actor(), &second).await.unwrap();
    assert_eq!(default_ids(&pool).await, vec![second]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_pass_the_default_on_when_the_default_wallet_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let first = make_wallet(&pool, "Cash", None).await;
    let second = make_wallet(&pool, "Bank", None).await;
    service::set_default_wallet(&pool, actor(), &first).await.unwrap();

    service::delete_wallet(&pool, actor(), &first).await.unwrap();

    assert_eq!(
        default_ids(&pool).await,
        vec![second],
        "WAL-3 says exactly one, so the next wallet inherits it"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_delete_a_wallet_with_live_transactions(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    insert_transaction(&pool, "txn_1", &wallet, None).await;

    let error = service::delete_wallet(&pool, actor(), &wallet)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::WalletHasTransactions), "{error:?}");

    // Soft-deleting the transaction releases the wallet again.
    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE id = 'txn_1'")
        .execute(&pool)
        .await
        .unwrap();
    service::delete_wallet(&pool, actor(), &wallet).await.unwrap();
    assert!(service::list_wallets(&pool, WORKSPACE).await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_lock_a_wallet_currency_once_it_has_a_live_transaction(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;

    // Still free to move.
    let moved = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { currency_code: Some("EUR"), ..Default::default() },
    )
    .await
    .unwrap();
    assert_eq!(moved.currency_code, "EUR");

    insert_transaction(&pool, "txn_1", &wallet, None).await;

    let error = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { currency_code: Some("USD"), ..Default::default() },
    )
    .await
    .unwrap_err();
    assert!(matches!(error, AppError::WalletCurrencyLocked), "{error:?}");

    // A patch that only renames still works, and re-sending the wallet's own
    // currency is not a change.
    let renamed = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput {
            name: Some("Petty cash"),
            currency_code: Some("eur"),
            ..Default::default()
        },
    )
    .await
    .unwrap();
    assert_eq!(renamed.name, "Petty cash");
    assert_eq!(renamed.currency_code, "EUR");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_lock_the_workspace_currency_once_any_transaction_exists(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;

    assert_eq!(
        service::update_workspace_currency(&pool, actor(), "usd")
            .await
            .unwrap(),
        "USD"
    );

    insert_transaction(&pool, "txn_1", &wallet, None).await;

    let error = service::update_workspace_currency(&pool, actor(), "EUR")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::WorkspaceCurrencyLocked), "{error:?}");

    // Soft-deleting it does not unlock: a deleted row's base_amount is still
    // a number denominated in the old currency.
    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE id = 'txn_1'")
        .execute(&pool)
        .await
        .unwrap();
    let error = service::update_workspace_currency(&pool, actor(), "EUR")
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::WorkspaceCurrencyLocked), "{error:?}");

    // Re-sending the current currency is not a change, so it is not refused.
    assert_eq!(
        service::update_workspace_currency(&pool, actor(), "USD")
            .await
            .unwrap(),
        "USD"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_never_move_a_balance_through_a_wallet_patch(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    sqlx::query("UPDATE wallets SET balance = 125.5000 WHERE id = $1")
        .bind(&wallet)
        .execute(&pool)
        .await
        .unwrap();

    let after = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { name: Some("Renamed"), ..Default::default() },
    )
    .await
    .unwrap();

    assert_eq!(after.balance, Decimal::new(1255000, 4));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_write_an_audit_row_for_every_wallet_mutation(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { name: Some("Petty cash"), ..Default::default() },
    )
    .await
    .unwrap();
    service::set_default_wallet(&pool, actor(), &wallet).await.unwrap();
    service::delete_wallet(&pool, actor(), &wallet).await.unwrap();

    assert_eq!(
        audit_actions(&pool, &wallet).await,
        vec![
            "wallet.created",
            "wallet.updated",
            "wallet.set_default",
            "wallet.deleted"
        ]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_roll_the_audit_row_back_with_a_refused_mutation(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    insert_transaction(&pool, "txn_1", &wallet, None).await;

    service::delete_wallet(&pool, actor(), &wallet).await.unwrap_err();

    assert_eq!(
        audit_actions(&pool, &wallet).await,
        vec!["wallet.created"],
        "a refused delete leaves no log of something that never happened (D14)"
    );
}

// ----------------------------------------------------------- wallet groups

#[sqlx::test(migrations = "../../migrations")]
async fn should_detach_wallets_when_their_group_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let group = service::create_group(&pool, actor(), "Banks", None).await.unwrap();

    let wallet = service::create_wallet(
        &pool,
        actor(),
        NewWalletInput {
            name: "BCA",
            group_id: Some(&group.id),
            currency_code: None,
            is_included_in_totals: None,
            sort_order: None,
        },
    )
    .await
    .unwrap();
    assert_eq!(wallet.group_id.as_deref(), Some(group.id.as_str()));

    service::delete_group(&pool, actor(), &group.id).await.unwrap();

    let after = service::find_wallet(&pool, WORKSPACE, &wallet.id).await.unwrap();
    assert_eq!(after.group_id, None, "the wallet survives, the grouping goes");
    assert!(service::list_groups(&pool, WORKSPACE).await.unwrap().is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_tell_an_absent_group_apart_from_an_explicit_null(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let group = service::create_group(&pool, actor(), "Banks", None).await.unwrap();
    let wallet = make_wallet(&pool, "BCA", None).await;

    let attached = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { group_id: Some(Some(&group.id)), ..Default::default() },
    )
    .await
    .unwrap();
    assert_eq!(attached.group_id.as_deref(), Some(group.id.as_str()));

    // An absent group_id leaves the grouping alone.
    let renamed = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { name: Some("BCA Main"), ..Default::default() },
    )
    .await
    .unwrap();
    assert_eq!(renamed.group_id.as_deref(), Some(group.id.as_str()));

    // An explicit null detaches it.
    let detached = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput { group_id: Some(None), ..Default::default() },
    )
    .await
    .unwrap();
    assert_eq!(detached.group_id, None);
}

// -------------------------------------------------------------- categories

#[sqlx::test(migrations = "../../migrations")]
async fn should_null_the_category_on_its_transactions_when_it_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    let category = service::create_category(&pool, actor(), "Food", "expense", None)
        .await
        .unwrap();
    insert_transaction(&pool, "txn_1", &wallet, Some(&category.id)).await;

    sqlx::query(
        "INSERT INTO transaction_items (id, workspace_id, transaction_id, name, amount, category_id)
         VALUES ('item_1', $1, 'txn_1', 'Nasi goreng', 100, $2)",
    )
    .bind(WORKSPACE)
    .bind(&category.id)
    .execute(&pool)
    .await
    .unwrap();

    service::delete_category(&pool, actor(), &category.id).await.unwrap();

    let txn_category: Option<String> =
        sqlx::query_scalar("SELECT category_id FROM transactions WHERE id = 'txn_1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(txn_category, None, "CAT-2: the label goes, the money stays");

    let item_category: Option<String> =
        sqlx::query_scalar("SELECT category_id FROM transaction_items WHERE id = 'item_1'")
            .fetch_one(&pool)
            .await
            .unwrap();
    assert_eq!(item_category, None);

    // The transaction itself is untouched.
    let amount: Decimal = sqlx::query_scalar("SELECT amount FROM transactions WHERE id = 'txn_1'")
        .fetch_one(&pool)
        .await
        .unwrap();
    assert_eq!(amount, Decimal::from(100));

    assert!(service::list_categories(&pool, WORKSPACE, None)
        .await
        .unwrap()
        .is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_restrict_a_category_to_income_or_expense(pool: PgPool) {
    fixture(&pool, "IDR").await;

    let error = service::create_category(&pool, actor(), "Food", "transfer", None)
        .await
        .unwrap_err();
    assert!(matches!(error, AppError::Validation(_)), "{error:?}");

    service::create_category(&pool, actor(), "Food", " Expense ", None)
        .await
        .unwrap();
    service::create_category(&pool, actor(), "Salary", "income", None)
        .await
        .unwrap();

    let expenses = service::list_categories(&pool, WORKSPACE, Some("expense"))
        .await
        .unwrap();
    assert_eq!(expenses.len(), 1);
    assert_eq!(expenses[0].r#type, "expense");
    assert_eq!(
        service::list_categories(&pool, WORKSPACE, None).await.unwrap().len(),
        2
    );
}

// -------------------------------------------------------------- isolation

#[sqlx::test(migrations = "../../migrations")]
async fn should_not_reach_another_workspaces_rows(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;

    sqlx::query(
        "INSERT INTO workspaces (id, name, slug, currency_code)
         VALUES ('ws_other', 'Other', 'other', 'IDR')",
    )
    .execute(&pool)
    .await
    .unwrap();

    let intruder = Actor::web("ws_other", USER);

    assert!(matches!(
        service::find_wallet(&pool, "ws_other", &wallet).await.unwrap_err(),
        AppError::WalletNotFound
    ));
    assert!(matches!(
        service::delete_wallet(&pool, intruder, &wallet).await.unwrap_err(),
        AppError::WalletNotFound
    ));
    assert!(matches!(
        service::set_default_wallet(&pool, intruder, &wallet).await.unwrap_err(),
        AppError::WalletNotFound
    ));
}

async fn default_ids(pool: &PgPool) -> Vec<String> {
    service::list_wallets(pool, WORKSPACE)
        .await
        .unwrap()
        .into_iter()
        .filter(|wallet| wallet.is_default)
        .map(|wallet| wallet.id)
        .collect()
}
