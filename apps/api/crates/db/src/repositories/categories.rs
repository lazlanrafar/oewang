//! Categories.
//!
//! See docs/best-practices/rust-api.md#database.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgExecutor;

/// `Serialize` is for the audit snapshot, as in `wallets`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct CategoryRow {
    pub id: String,
    pub name: String,
    /// `income` or `expense` (CAT-1).
    pub r#type: String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// `None` lists both types.
pub async fn list_categories(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: Option<&str>,
) -> Result<Vec<CategoryRow>, sqlx::Error> {
    sqlx::query_as!(
        CategoryRow,
        r#"SELECT id, name, type AS "type!", sort_order, created_at, updated_at
           FROM categories
           WHERE workspace_id = $1
             AND deleted_at IS NULL
             AND ($2::text IS NULL OR type = $2)
           ORDER BY type, sort_order, name"#,
        workspace_id,
        kind
    )
    .fetch_all(executor)
    .await
}

pub async fn find_category(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<CategoryRow>, sqlx::Error> {
    sqlx::query_as!(
        CategoryRow,
        r#"SELECT id, name, type AS "type!", sort_order, created_at, updated_at
           FROM categories
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

pub async fn insert_category(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    name: &str,
    kind: &str,
    sort_order: i32,
) -> Result<CategoryRow, sqlx::Error> {
    sqlx::query_as!(
        CategoryRow,
        r#"INSERT INTO categories (id, workspace_id, name, type, sort_order)
           VALUES ($1, $2, $3, $4, $5)
           RETURNING id, name, type AS "type!", sort_order, created_at, updated_at"#,
        id,
        workspace_id,
        name,
        kind,
        sort_order
    )
    .fetch_one(executor)
    .await
}

pub async fn update_category(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    name: Option<&str>,
    kind: Option<&str>,
    sort_order: Option<i32>,
) -> Result<Option<CategoryRow>, sqlx::Error> {
    sqlx::query_as!(
        CategoryRow,
        r#"UPDATE categories
           SET name = COALESCE($3, name),
               type = COALESCE($4, type),
               sort_order = COALESCE($5, sort_order),
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, name, type AS "type!", sort_order, created_at, updated_at"#,
        workspace_id,
        id,
        name,
        kind,
        sort_order
    )
    .fetch_optional(executor)
    .await
}

pub async fn soft_delete_category(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE categories SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Detach the category from its transactions (CAT-2).
///
/// Deleting a category must not block the ledger, and must not leave a row
/// pointing at something a list can no longer resolve.
pub async fn clear_category_on_transactions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    category_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE transactions SET category_id = NULL, updated_at = now()
           WHERE workspace_id = $1 AND category_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        category_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// The same detach for line items, which carry their own `category_id`.
pub async fn clear_category_on_items(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    category_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE transaction_items SET category_id = NULL, updated_at = now()
           WHERE workspace_id = $1 AND category_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        category_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
