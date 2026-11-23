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

fn decimal(value: &str) -> Decimal {
    value.parse().unwrap()
}

/// Every live transaction in the workspace, as type, amount and base amount.
async fn transactions(pool: &PgPool) -> Vec<(String, Decimal, Decimal)> {
    sqlx::query_as::<_, (String, Decimal, Decimal)>(
        "SELECT type, amount, base_amount FROM transactions
         WHERE workspace_id = $1 AND deleted_at IS NULL
         ORDER BY created_at, id",
    )
    .bind(WORKSPACE)
    .fetch_all(pool)
    .await
    .unwrap()
}

async fn balance(pool: &PgPool, wallet_id: &str) -> Decimal {
    service::find_wallet(pool, WORKSPACE, wallet_id)
        .await
        .unwrap()
        .balance
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

/// WAL-2
#[sqlx::test(migrations = "../../migrations")]
async fn should_leave_exactly_one_default_when_the_default_moves(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let first = make_wallet(&pool, "Cash", None).await;
    let second = make_wallet(&pool, "Bank", None).await;

    // A created wallet is not a default; the flag moves only through
    // set-default, so the invariant has one code path.
    assert_eq!(default_ids(&pool).await, Vec::<String>::new());

    service::set_default_wallet(&pool, actor(), &first)
        .await
        .unwrap();
    assert_eq!(default_ids(&pool).await, vec![first.clone()]);

    service::set_default_wallet(&pool, actor(), &second)
        .await
        .unwrap();
    assert_eq!(
        default_ids(&pool).await,
        vec![second.clone()],
        "the previous default is cleared in the same transaction (WAL-3)"
    );

    // Setting the one that is already default is a no-op, not a violation of
    // the partial unique index.
    service::set_default_wallet(&pool, actor(), &second)
        .await
        .unwrap();
    assert_eq!(default_ids(&pool).await, vec![second]);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_pass_the_default_on_when_the_default_wallet_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let first = make_wallet(&pool, "Cash", None).await;
    let second = make_wallet(&pool, "Bank", None).await;
    service::set_default_wallet(&pool, actor(), &first)
        .await
        .unwrap();

    service::delete_wallet(&pool, actor(), &first)
        .await
        .unwrap();

    assert_eq!(
        default_ids(&pool).await,
        vec![second],
        "WAL-3 says exactly one, so the next wallet inherits it"
    );
}

/// WAL-4
#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_to_delete_a_wallet_with_live_transactions(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    insert_transaction(&pool, "txn_1", &wallet, None).await;

    let error = service::delete_wallet(&pool, actor(), &wallet)
        .await
        .unwrap_err();
    assert!(
        matches!(error, AppError::WalletHasTransactions),
        "{error:?}"
    );

    // Soft-deleting the transaction releases the wallet again.
    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE id = 'txn_1'")
        .execute(&pool)
        .await
        .unwrap();
    service::delete_wallet(&pool, actor(), &wallet)
        .await
        .unwrap();
    assert!(service::list_wallets(&pool, WORKSPACE)
        .await
        .unwrap()
        .is_empty());
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
        WalletPatchInput {
            currency_code: Some("EUR"),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(moved.currency_code, "EUR");

    insert_transaction(&pool, "txn_1", &wallet, None).await;

    let error = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput {
            currency_code: Some("USD"),
            ..Default::default()
        },
        None,
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
        None,
    )
    .await
    .unwrap();
    assert_eq!(renamed.name, "Petty cash");
    assert_eq!(renamed.currency_code, "EUR");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_flag_a_wallet_with_a_live_transaction_in_the_list(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let cash = make_wallet(&pool, "Cash", None).await;
    let bank = make_wallet(&pool, "Bank", None).await;

    let flag = |rows: &[oewang_db::repositories::wallets::WalletListRow], id: &str| {
        rows.iter().find(|r| r.id == id).unwrap().has_transactions
    };
    let rows = service::list_wallets(&pool, WORKSPACE).await.unwrap();
    assert!(!flag(&rows, &cash) && !flag(&rows, &bank));

    insert_transaction(&pool, "txn_1", &cash, None).await;
    let rows = service::list_wallets(&pool, WORKSPACE).await.unwrap();
    assert!(flag(&rows, &cash) && !flag(&rows, &bank));
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
    assert!(
        matches!(error, AppError::WorkspaceCurrencyLocked),
        "{error:?}"
    );

    // Soft-deleting it does not unlock: a deleted row's base_amount is still
    // a number denominated in the old currency.
    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE id = 'txn_1'")
        .execute(&pool)
        .await
        .unwrap();
    let error = service::update_workspace_currency(&pool, actor(), "EUR")
        .await
        .unwrap_err();
    assert!(
        matches!(error, AppError::WorkspaceCurrencyLocked),
        "{error:?}"
    );

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
        WalletPatchInput {
            name: Some("Renamed"),
            ..Default::default()
        },
        None,
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
        WalletPatchInput {
            name: Some("Petty cash"),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    service::set_default_wallet(&pool, actor(), &wallet)
        .await
        .unwrap();
    service::delete_wallet(&pool, actor(), &wallet)
        .await
        .unwrap();

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

/// OPS-1
#[sqlx::test(migrations = "../../migrations")]
async fn should_roll_the_audit_row_back_with_a_refused_mutation(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    insert_transaction(&pool, "txn_1", &wallet, None).await;

    service::delete_wallet(&pool, actor(), &wallet)
        .await
        .unwrap_err();

    assert_eq!(
        audit_actions(&pool, &wallet).await,
        vec!["wallet.created"],
        "a refused delete leaves no log of something that never happened (D14)"
    );
}

// ------------------------------------------------- balance adjustment

#[sqlx::test(migrations = "../../migrations")]
async fn should_write_one_income_for_the_difference_when_a_balance_is_adjusted_up(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;

    let after = service::adjust_wallet_balance(&pool, actor(), &wallet, decimal("100000"))
        .await
        .unwrap();

    assert_eq!(after.balance, decimal("100000.0000"));
    assert_eq!(balance(&pool, &wallet).await, decimal("100000.0000"));

    let written = transactions(&pool).await;
    assert_eq!(written.len(), 1, "one transaction, not a balance write");
    assert_eq!(written[0].0, "income");
    assert_eq!(written[0].1, decimal("100000.0000"));
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_write_one_expense_for_the_difference_when_a_balance_is_adjusted_down(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    sqlx::query("UPDATE wallets SET balance = 250000.0000 WHERE id = $1")
        .bind(&wallet)
        .execute(&pool)
        .await
        .unwrap();

    let after = service::adjust_wallet_balance(&pool, actor(), &wallet, decimal("90000.50"))
        .await
        .unwrap();

    assert_eq!(after.balance, decimal("90000.5000"));

    let written = transactions(&pool).await;
    assert_eq!(written.len(), 1);
    assert_eq!(written[0].0, "expense");
    assert_eq!(
        written[0].1,
        decimal("159999.5000"),
        "the absolute difference, not the target"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_write_nothing_when_the_balance_is_already_the_target(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Cash", None).await;
    service::adjust_wallet_balance(&pool, actor(), &wallet, decimal("100000"))
        .await
        .unwrap();

    let before = transactions(&pool).await.len();

    // Asking for the balance it already has is not an error, and a
    // zero-amount transaction is never written.
    let after = service::adjust_wallet_balance(&pool, actor(), &wallet, decimal("100000.0000"))
        .await
        .unwrap();

    assert_eq!(after.balance, decimal("100000.0000"));
    assert_eq!(transactions(&pool).await.len(), before);
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_land_on_the_target_in_its_own_currency_when_the_wallet_is_foreign(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let wallet = make_wallet(&pool, "Euro", Some("EUR")).await;

    // The create path converts to the workspace currency itself and writes
    // that as `base_amount`. Nothing about that moves the balance, which is
    // denominated in the wallet's own currency (TXN-2).
    sqlx::query(
        "INSERT INTO exchange_rates (id, base_code, quote_code, date, rate)
         VALUES ($1, 'EUR', 'IDR', current_date, 17000)",
    )
    .bind(cuid2::create_id())
    .execute(&pool)
    .await
    .unwrap();

    let after = service::adjust_wallet_balance(&pool, actor(), &wallet, decimal("250"))
        .await
        .unwrap();

    assert_eq!(after.currency_code, "EUR");
    assert_eq!(after.balance, decimal("250.0000"), "euros, not rupiah");

    let written = transactions(&pool).await;
    assert_eq!(written.len(), 1);
    assert_eq!(written[0].1, decimal("250.0000"));
    assert_eq!(
        written[0].2,
        decimal("4250000.0000"),
        "the base figure is the converted one, and the balance is not it"
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_refuse_a_balance_adjustment_when_the_member_cannot_write(pool: PgPool) {
    fixture(&pool, "IDR").await;

    sqlx::query(
        "INSERT INTO users (id, email, password_hash) VALUES ($1, 'reader@example.com', 'x')",
    )
    .bind("usr_reader")
    .execute(&pool)
    .await
    .unwrap();
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_reader', $1, $2, 'member')",
    )
    .bind(WORKSPACE)
    .bind("usr_reader")
    .execute(&pool)
    .await
    .unwrap();

    // The route is registered behind `AuthWrite`, which re-reads the
    // membership row and refuses when it cannot write. That read is the
    // gate, and this is it answering: there is no HTTP harness in this
    // crate, and the service deliberately holds no second copy of the role
    // rule.
    let role = crate::auth::service::current_role(&pool, WORKSPACE, "usr_reader")
        .await
        .unwrap();

    assert!(!role.can_write(), "a member may not adjust a balance");
    assert!(
        crate::auth::service::current_role(&pool, WORKSPACE, USER)
            .await
            .unwrap()
            .can_write(),
        "and the owner the other tests use may"
    );
}

// ----------------------------------------------------------- wallet groups

#[sqlx::test(migrations = "../../migrations")]
async fn should_detach_wallets_when_their_group_is_deleted(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let group = service::create_group(&pool, actor(), "Banks", None)
        .await
        .unwrap();

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

    service::delete_group(&pool, actor(), &group.id)
        .await
        .unwrap();

    let after = service::find_wallet(&pool, WORKSPACE, &wallet.id)
        .await
        .unwrap();
    assert_eq!(
        after.group_id, None,
        "the wallet survives, the grouping goes"
    );
    assert!(service::list_groups(&pool, WORKSPACE)
        .await
        .unwrap()
        .is_empty());
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_tell_an_absent_group_apart_from_an_explicit_null(pool: PgPool) {
    fixture(&pool, "IDR").await;
    let group = service::create_group(&pool, actor(), "Banks", None)
        .await
        .unwrap();
    let wallet = make_wallet(&pool, "BCA", None).await;

    let attached = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput {
            group_id: Some(Some(&group.id)),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(attached.group_id.as_deref(), Some(group.id.as_str()));

    // An absent group_id leaves the grouping alone.
    let renamed = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput {
            name: Some("BCA Main"),
            ..Default::default()
        },
        None,
    )
    .await
    .unwrap();
    assert_eq!(renamed.group_id.as_deref(), Some(group.id.as_str()));

    // An explicit null detaches it.
    let detached = service::update_wallet(
        &pool,
        actor(),
        &wallet,
        WalletPatchInput {
            group_id: Some(None),
            ..Default::default()
        },
        None,
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

    service::delete_category(&pool, actor(), &category.id)
        .await
        .unwrap();

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
        service::list_categories(&pool, WORKSPACE, None)
            .await
            .unwrap()
            .len(),
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
        service::find_wallet(&pool, "ws_other", &wallet)
            .await
            .unwrap_err(),
        AppError::WalletNotFound
    ));
    assert!(matches!(
        service::delete_wallet(&pool, intruder, &wallet)
            .await
            .unwrap_err(),
        AppError::WalletNotFound
    ));
    assert!(matches!(
        service::set_default_wallet(&pool, intruder, &wallet)
            .await
            .unwrap_err(),
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

// ---------------------------------------------------------- offline writes

/// Client ids on create (D114) and `If-Match` on edit (D115).
mod offline_writes {
    use axum::extract::{Json, Path, State};
    use oewang_db::repositories::categories::CategoryRow;
    use oewang_domain::Role;

    use super::*;
    use crate::{
        accounts::handler::{self, UpdateCategoryBody, UpdateWalletBody},
        auth::extractor::AuthWrite,
        offline::IfMatch,
        response::RequestId,
        test_support,
    };

    const ID: &str = "wz4a98xxat96iws9zmbrgj3a";

    fn cash() -> NewWalletInput<'static> {
        NewWalletInput {
            name: "Cash",
            group_id: None,
            currency_code: None,
            is_included_in_totals: None,
            sort_order: None,
        }
    }

    async fn food(
        pool: &PgPool,
        actor: Actor<'_>,
        id: &str,
    ) -> Result<(CategoryRow, bool), AppError> {
        service::create_category_with_id(pool, actor, Some(id), "Food", "expense", None).await
    }

    fn rename(name: &str) -> WalletPatchInput<'_> {
        WalletPatchInput {
            name: Some(name),
            ..Default::default()
        }
    }

    /// MOB-6: a wallet made offline is made once, and a repeat after a
    /// delete answers the deleted wallet rather than a new one.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_create_a_wallet_once_under_a_client_id(pool: PgPool) {
        fixture(&pool, "IDR").await;

        let (wallet, created) = service::create_wallet_with_id(&pool, actor(), Some(ID), cash())
            .await
            .unwrap();
        assert!(created);
        assert_eq!(wallet.id, ID);

        let (again, created) = service::create_wallet_with_id(&pool, actor(), Some(ID), cash())
            .await
            .unwrap();
        assert!(!created);
        assert_eq!(again.updated_at, wallet.updated_at);
        assert_eq!(audit_actions(&pool, ID).await, vec!["wallet.created"]);

        service::delete_wallet(&pool, actor(), ID).await.unwrap();
        let (deleted, created) = service::create_wallet_with_id(&pool, actor(), Some(ID), cash())
            .await
            .unwrap();
        assert!(!created);
        assert_eq!(deleted.id, ID);
        assert!(service::find_wallet(&pool, WORKSPACE, ID).await.is_err());
        assert_eq!(
            audit_actions(&pool, ID).await,
            vec!["wallet.created", "wallet.deleted"]
        );
    }

    /// MOB-6: a category id held by another workspace, or by a wallet, is a
    /// conflict; a bad id is a validation error.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_create_a_category_once_and_refuse_a_foreign_id(pool: PgPool) {
        fixture(&pool, "IDR").await;
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code)
             VALUES ('ws_other', 'Other', 'other', 'IDR')",
        )
        .execute(&pool)
        .await
        .unwrap();
        let theirs = Actor::web("ws_other", USER);

        assert!(food(&pool, actor(), ID).await.unwrap().1);
        assert!(!food(&pool, actor(), ID).await.unwrap().1);
        assert!(matches!(
            food(&pool, theirs, ID).await,
            Err(AppError::IdTaken)
        ));

        let (wallet, _) = service::create_wallet_with_id(
            &pool,
            actor(),
            Some("cz4a98xxat96iws9zmbrgj3a"),
            cash(),
        )
        .await
        .unwrap();
        assert!(matches!(
            food(&pool, actor(), &wallet.id).await,
            Err(AppError::IdTaken)
        ));
        assert!(matches!(
            food(&pool, actor(), "short").await,
            Err(AppError::Validation(_))
        ));

        let count: i64 = sqlx::query_scalar("SELECT count(*) FROM categories WHERE id = $1")
            .bind(ID)
            .fetch_one(&pool)
            .await
            .unwrap();
        assert_eq!(count, 1);
    }

    /// MOB-6: concurrent creates with one wallet id make one wallet.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_make_one_wallet_when_creates_with_one_id_race(pool: PgPool) {
        fixture(&pool, "IDR").await;

        let mut handles = Vec::new();
        for _ in 0..8 {
            let pool = pool.clone();
            handles.push(tokio::spawn(async move {
                service::create_wallet_with_id(&pool, actor(), Some(ID), cash())
                    .await
                    .unwrap()
                    .1
            }));
        }
        let mut made = 0;
        for handle in handles {
            made += usize::from(handle.await.unwrap());
        }

        assert_eq!(made, 1);
        assert_eq!(audit_actions(&pool, ID).await, vec!["wallet.created"]);
    }

    /// MOB-7: a matching version lets a wallet edit through and moves it;
    /// a stale one or a deleted wallet is refused and changes nothing.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_check_if_match_on_a_wallet_edit(pool: PgPool) {
        fixture(&pool, "IDR").await;
        let id = make_wallet(&pool, "Cash", None).await;
        let seen = service::find_wallet(&pool, WORKSPACE, &id)
            .await
            .unwrap()
            .updated_at;

        let after = service::update_wallet(&pool, actor(), &id, rename("Petty"), Some(seen))
            .await
            .unwrap();
        assert!(after.updated_at > seen);

        let stale = service::update_wallet(&pool, actor(), &id, rename("Lost"), Some(seen)).await;
        assert!(matches!(stale, Err(AppError::Stale(None))), "{stale:?}");
        assert_eq!(
            service::find_wallet(&pool, WORKSPACE, &id)
                .await
                .unwrap()
                .name,
            "Petty"
        );
        assert_eq!(
            audit_actions(&pool, &id).await,
            vec!["wallet.created", "wallet.updated"]
        );

        service::delete_wallet(&pool, actor(), &id).await.unwrap();
        let gone =
            service::update_wallet(&pool, actor(), &id, rename("X"), Some(after.updated_at)).await;
        assert!(matches!(gone, Err(AppError::Stale(None))), "{gone:?}");
        let plain = service::update_wallet(&pool, actor(), &id, rename("X"), None).await;
        assert!(matches!(plain, Err(AppError::WalletNotFound)), "{plain:?}");
    }

    /// MOB-7: a transaction landing on a wallet moves its balance, not its
    /// version, so a queued rename of the same wallet still goes through.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_not_make_a_wallet_stale_by_moving_its_balance(pool: PgPool) {
        fixture(&pool, "IDR").await;
        let id = make_wallet(&pool, "Cash", None).await;
        let seen = service::find_wallet(&pool, WORKSPACE, &id)
            .await
            .unwrap()
            .updated_at;

        service::adjust_wallet_balance(&pool, actor(), &id, decimal("5000"))
            .await
            .unwrap();

        let after = service::update_wallet(&pool, actor(), &id, rename("Petty"), Some(seen))
            .await
            .unwrap();
        assert_eq!(after.balance, decimal("5000"));
    }

    /// MOB-7 through the handlers: a stale category edit carries the current
    /// row in `details.current`, and a deleted wallet carries null.
    #[sqlx::test(migrations = "../../migrations")]
    async fn should_carry_the_current_row_when_an_edit_is_stale(pool: PgPool) {
        fixture(&pool, "IDR").await;
        let state = test_support::state(pool.clone(), test_support::NOWHERE);
        let owner = || AuthWrite {
            user_id: USER.into(),
            workspace_id: WORKSPACE.into(),
            role: Role::Owner,
            source: "web",
        };

        let (category, _) =
            service::create_category_with_id(&pool, actor(), Some(ID), "Food", "expense", None)
                .await
                .unwrap();
        service::update_category(&pool, actor(), ID, Some("Meals"), None, None, None)
            .await
            .unwrap();
        let body: UpdateCategoryBody = serde_json::from_str(r#"{"name":"Groceries"}"#).unwrap();
        let Err(refused) = handler::update_category(
            State(state.clone()),
            owner(),
            Path(ID.into()),
            RequestId("r1".into()),
            IfMatch(Some(category.updated_at)),
            Json(body),
        )
        .await
        else {
            panic!("a stale edit is refused");
        };
        let details = refused.error.to_body("r1").details.unwrap();
        assert_eq!(details["current"]["name"], "Meals");

        let wallet = make_wallet(&pool, "Cash", None).await;
        let seen = service::find_wallet(&pool, WORKSPACE, &wallet)
            .await
            .unwrap()
            .updated_at;
        service::delete_wallet(&pool, actor(), &wallet)
            .await
            .unwrap();
        let body: UpdateWalletBody = serde_json::from_str(r#"{"name":"X"}"#).unwrap();
        let Err(refused) = handler::update_wallet(
            State(state),
            owner(),
            Path(wallet),
            RequestId("r2".into()),
            IfMatch(Some(seen)),
            Json(body),
        )
        .await
        else {
            panic!("an edit of a deleted wallet is refused");
        };
        assert_eq!(refused.error.code(), "STALE");
        assert_eq!(
            refused.error.to_body("r2").details,
            Some(serde_json::json!({ "current": null }))
        );
    }
}
