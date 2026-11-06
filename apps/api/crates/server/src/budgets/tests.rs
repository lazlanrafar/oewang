//! Budgets against a real database: what counts as spent is SQL, and the
//! one-per-category rule is an index.

use oewang_domain::{budget::Month, AppError};
use rust_decimal::Decimal;
use sqlx::PgPool;

use crate::{
    accounts,
    audit::Actor,
    budgets::service::{self, Sort},
};

const WORKSPACE: &str = "ws_budget";
const OTHER: &str = "ws_budget_other";
const USER: &str = "usr_budget";

fn actor() -> Actor<'static> {
    Actor::web(WORKSPACE, USER)
}

fn decimal(value: &str) -> Decimal {
    value.parse().unwrap()
}

fn november() -> Month {
    Month::parse("2026-11").unwrap()
}

async fn fixture(pool: &PgPool) {
    sqlx::query("INSERT INTO users (id, email, password_hash) VALUES ($1, 'b@example.com', 'x')")
        .bind(USER)
        .execute(pool)
        .await
        .unwrap();
    for workspace in [WORKSPACE, OTHER] {
        sqlx::query(
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $1, $1, 'IDR')",
        )
        .bind(workspace)
        .execute(pool)
        .await
        .unwrap();
        sqlx::query(
            "INSERT INTO wallets (id, workspace_id, name, currency_code)
             VALUES ($1 || '_w', $1, 'Cash', 'IDR')",
        )
        .bind(workspace)
        .execute(pool)
        .await
        .unwrap();
    }
    sqlx::query(
        "INSERT INTO user_workspaces (id, workspace_id, user_id, role)
         VALUES ('m_budget', $1, $2, 'owner')",
    )
    .bind(WORKSPACE)
    .bind(USER)
    .execute(pool)
    .await
    .unwrap();

    for (id, workspace, name, kind, order) in [
        ("c_food", WORKSPACE, "Food", "expense", 0),
        ("c_rent", WORKSPACE, "Rent", "expense", 1),
        ("c_salary", WORKSPACE, "Salary", "income", 0),
        ("c_other_food", OTHER, "Food", "expense", 0),
    ] {
        sqlx::query(
            "INSERT INTO categories (id, workspace_id, name, type, sort_order)
             VALUES ($1, $2, $3, $4, $5)",
        )
        .bind(id)
        .bind(workspace)
        .bind(name)
        .bind(kind)
        .bind(order)
        .execute(pool)
        .await
        .unwrap();
    }
}

/// A transaction written straight to the table. `amount` is in the wallet's
/// currency and `base` in the workspace's; the budget must read `base`.
async fn spend(
    pool: &PgPool,
    workspace: &str,
    category: &str,
    kind: &str,
    amount: &str,
    base: &str,
    date: &str,
) -> String {
    let id = cuid2::create_id();
    sqlx::query(
        "INSERT INTO transactions
           (id, workspace_id, wallet_id, category_id, amount, base_amount, base_rate,
            base_rate_source, base_rate_date, date, type)
         VALUES ($1, $2, $2 || '_w', $3, $4::numeric, $5::numeric, 1, 'same',
                 current_date, $6::timestamptz, $7)",
    )
    .bind(&id)
    .bind(workspace)
    .bind(category)
    .bind(amount)
    .bind(base)
    .bind(date)
    .bind(kind)
    .execute(pool)
    .await
    .unwrap();
    id
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

#[sqlx::test(migrations = "../../migrations")]
async fn should_count_only_this_months_live_expenses_in_the_workspace_currency(pool: PgPool) {
    fixture(&pool).await;
    service::create(&pool, actor(), "c_food", decimal("1000"))
        .await
        .unwrap();

    // Counted: the base amount, not the wallet amount; the month's first
    // instant and its last second.
    spend(
        &pool,
        WORKSPACE,
        "c_food",
        "expense",
        "10",
        "300",
        "2026-11-01T00:00:00Z",
    )
    .await;
    spend(
        &pool,
        WORKSPACE,
        "c_food",
        "expense",
        "500",
        "500",
        "2026-11-30T23:59:59.5Z",
    )
    .await;
    // Not counted: next month, last month, income, another category,
    // another workspace, a deleted transaction.
    spend(
        &pool,
        WORKSPACE,
        "c_food",
        "expense",
        "99",
        "99",
        "2026-12-01T00:00:00Z",
    )
    .await;
    spend(
        &pool,
        WORKSPACE,
        "c_food",
        "expense",
        "99",
        "99",
        "2026-10-31T23:59:59Z",
    )
    .await;
    spend(
        &pool,
        WORKSPACE,
        "c_food",
        "income",
        "99",
        "99",
        "2026-11-10T00:00:00Z",
    )
    .await;
    spend(
        &pool,
        WORKSPACE,
        "c_rent",
        "expense",
        "99",
        "99",
        "2026-11-10T00:00:00Z",
    )
    .await;
    spend(
        &pool,
        OTHER,
        "c_other_food",
        "expense",
        "99",
        "99",
        "2026-11-10T00:00:00Z",
    )
    .await;
    let gone = spend(
        &pool,
        WORKSPACE,
        "c_food",
        "expense",
        "99",
        "99",
        "2026-11-10T00:00:00Z",
    )
    .await;
    sqlx::query("UPDATE transactions SET deleted_at = now() WHERE id = $1")
        .bind(gone)
        .execute(&pool)
        .await
        .unwrap();

    let status = service::status(&pool, WORKSPACE, november(), None, Sort::default())
        .await
        .unwrap();

    assert_eq!(status.count, 1);
    let food = &status.budgets[0];
    assert_eq!(food.category_name, "Food");
    assert_eq!(food.spent, decimal("800"));
    assert_eq!(food.remaining, decimal("200"));
    assert_eq!((food.percent, food.state), (80, "warning"));
    assert_eq!(status.spent, decimal("800"));
    assert_eq!(status.currency_code, "IDR");
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_allow_one_budget_per_expense_category(pool: PgPool) {
    fixture(&pool).await;

    let first = service::create(&pool, actor(), "c_food", decimal("1000"))
        .await
        .unwrap();
    let again = service::create(&pool, actor(), "c_food", decimal("5"))
        .await
        .unwrap_err();
    assert!(
        matches!(again, AppError::Validation(ref fields) if fields.contains_key("category_id"))
    );

    for refused in ["c_salary", "c_other_food", "c_missing"] {
        let error = service::create(&pool, actor(), refused, decimal("5"))
            .await
            .unwrap_err();
        assert!(
            matches!(error, AppError::Validation(ref fields) if fields.contains_key("category_id")),
            "{refused}"
        );
    }

    // Deleted, the category is free again.
    service::delete(&pool, actor(), &first.id).await.unwrap();
    service::create(&pool, actor(), "c_food", decimal("700"))
        .await
        .unwrap();
    assert_eq!(
        audit_actions(&pool, &first.id).await,
        ["budget.created", "budget.deleted"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_change_only_the_limit_and_audit_it(pool: PgPool) {
    fixture(&pool).await;
    let budget = service::create(&pool, actor(), "c_rent", decimal("2000"))
        .await
        .unwrap();

    let updated = service::update(&pool, actor(), &budget.id, decimal("2500.50"))
        .await
        .unwrap();
    assert_eq!(updated.amount, decimal("2500.50"));
    assert_eq!(updated.category_id, "c_rent");

    let other = Actor::web(OTHER, USER);
    assert!(matches!(
        service::update(&pool, other, &budget.id, decimal("1")).await,
        Err(AppError::NotFound)
    ));
    assert_eq!(
        audit_actions(&pool, &budget.id).await,
        ["budget.created", "budget.updated"]
    );
}

#[sqlx::test(migrations = "../../migrations")]
async fn should_retire_the_budget_with_its_category(pool: PgPool) {
    fixture(&pool).await;
    let budget = service::create(&pool, actor(), "c_food", decimal("1000"))
        .await
        .unwrap();

    accounts::service::delete_category(&pool, actor(), "c_food")
        .await
        .unwrap();

    let status = service::status(&pool, WORKSPACE, november(), None, Sort::default())
        .await
        .unwrap();
    assert_eq!(status.count, 0);
    assert_eq!(
        audit_actions(&pool, &budget.id).await,
        ["budget.created", "budget.deleted"]
    );
}
