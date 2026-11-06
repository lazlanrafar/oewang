//! Monthly budgets and what they have used (BUD-1, BUD-2).
//!
//! See docs/features/budgets.md.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::PgExecutor;

/// `Serialize` is for the audit snapshot, as in `wallets`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct BudgetRow {
    pub id: String,
    pub category_id: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A budget with what its category spent in one month.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct BudgetUsageRow {
    pub id: String,
    pub category_id: String,
    pub category_name: String,
    pub amount: Decimal,
    /// In the workspace currency: a sum of `base_amount` (TXN-19).
    pub spent: Decimal,
}

pub async fn find(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<BudgetRow>, sqlx::Error> {
    sqlx::query_as!(
        BudgetRow,
        r#"SELECT id, category_id, amount, created_at, updated_at
           FROM budgets
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// The live budget on a category, if it has one.
pub async fn find_for_category(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    category_id: &str,
) -> Result<Option<BudgetRow>, sqlx::Error> {
    sqlx::query_as!(
        BudgetRow,
        r#"SELECT id, category_id, amount, created_at, updated_at
           FROM budgets
           WHERE workspace_id = $1 AND category_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        category_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn insert(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    category_id: &str,
    amount: Decimal,
) -> Result<BudgetRow, sqlx::Error> {
    sqlx::query_as!(
        BudgetRow,
        r#"INSERT INTO budgets (id, workspace_id, category_id, amount)
           VALUES ($1, $2, $3, $4)
           RETURNING id, category_id, amount, created_at, updated_at"#,
        id,
        workspace_id,
        category_id,
        amount
    )
    .fetch_one(executor)
    .await
}

pub async fn update_amount(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    amount: Decimal,
) -> Result<Option<BudgetRow>, sqlx::Error> {
    sqlx::query_as!(
        BudgetRow,
        r#"UPDATE budgets SET amount = $3, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, category_id, amount, created_at, updated_at"#,
        workspace_id,
        id,
        amount
    )
    .fetch_optional(executor)
    .await
}

pub async fn soft_delete(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE budgets SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Every live budget with what its category spent in `[start, end)`.
///
/// Expenses only, live transactions only, summed in the workspace currency.
/// Ordered as the category list is, so an unsorted page reads the way the
/// settings page orders categories.
pub async fn usage(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    start: DateTime<Utc>,
    end: DateTime<Utc>,
) -> Result<Vec<BudgetUsageRow>, sqlx::Error> {
    sqlx::query_as!(
        BudgetUsageRow,
        r#"SELECT b.id, b.category_id, c.name AS category_name, b.amount,
                  COALESCE((
                      SELECT sum(t.base_amount)
                      FROM transactions t
                      WHERE t.workspace_id = b.workspace_id
                        AND t.category_id = b.category_id
                        AND t.type = 'expense'
                        AND t.deleted_at IS NULL
                        AND t.date >= $2 AND t.date < $3
                  ), 0) AS "spent!"
           FROM budgets b
           JOIN categories c
             ON c.id = b.category_id AND c.workspace_id = b.workspace_id
            AND c.deleted_at IS NULL
           WHERE b.workspace_id = $1 AND b.deleted_at IS NULL
           ORDER BY c.sort_order, c.name"#,
        workspace_id,
        start,
        end
    )
    .fetch_all(executor)
    .await
}
