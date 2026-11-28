//! Transaction names and item names as spellings (D129).
//!
//! Two pools, one per kind: a transaction name is matched against
//! transaction names, an item name against item names. The match is the
//! item key of ITM-1, `lower(btrim(name))`, and nothing looser.
//!
//! An item counts only while its transaction is live, as in `items`.
//! Runtime queries rather than the macros: the SQL per kind is fixed here and
//! chosen by the enum, never built from input.

use chrono::{DateTime, Utc};
use sqlx::PgExecutor;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum NameKind {
    Transaction,
    Item,
}

impl NameKind {
    pub fn as_str(self) -> &'static str {
        match self {
            NameKind::Transaction => "transaction",
            NameKind::Item => "item",
        }
    }
}

/// One live name. For a transaction, `transaction_id` is its own id.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct NameRow {
    pub id: String,
    pub transaction_id: String,
    pub name: String,
    pub updated_at: DateTime<Utc>,
}

/// The most recently written live spelling whose key is `name`'s key, other
/// than the row `except_id`: an edit is not matched against its own old name.
pub async fn latest_spelling(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: NameKind,
    name: &str,
    except_id: Option<&str>,
) -> Result<Option<String>, sqlx::Error> {
    let sql = match kind {
        NameKind::Transaction => {
            "SELECT name FROM transactions
             WHERE workspace_id = $1 AND deleted_at IS NULL
               AND lower(btrim(name)) = lower(btrim($2)) AND id IS DISTINCT FROM $3
             ORDER BY updated_at DESC, id DESC LIMIT 1"
        }
        NameKind::Item => {
            "SELECT i.name FROM transaction_items i
             JOIN transactions t ON t.id = i.transaction_id AND t.workspace_id = i.workspace_id
                                AND t.deleted_at IS NULL
             WHERE i.workspace_id = $1 AND i.deleted_at IS NULL
               AND lower(btrim(i.name)) = lower(btrim($2)) AND i.id IS DISTINCT FROM $3
             ORDER BY i.updated_at DESC, i.id DESC LIMIT 1"
        }
    };
    sqlx::query_scalar(sql)
        .bind(workspace_id)
        .bind(name)
        .bind(except_id)
        .fetch_optional(executor)
        .await
}

/// Every live name of `kind`, the most recently written first.
pub async fn list_live(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: NameKind,
) -> Result<Vec<NameRow>, sqlx::Error> {
    let sql = match kind {
        NameKind::Transaction => {
            "SELECT id, id AS transaction_id, name, updated_at FROM transactions
             WHERE workspace_id = $1 AND deleted_at IS NULL AND name IS NOT NULL
             ORDER BY updated_at DESC, id DESC"
        }
        NameKind::Item => {
            "SELECT i.id, i.transaction_id, i.name, i.updated_at FROM transaction_items i
             JOIN transactions t ON t.id = i.transaction_id AND t.workspace_id = i.workspace_id
                                AND t.deleted_at IS NULL
             WHERE i.workspace_id = $1 AND i.deleted_at IS NULL
             ORDER BY i.updated_at DESC, i.id DESC"
        }
    };
    sqlx::query_as(sql)
        .bind(workspace_id)
        .fetch_all(executor)
        .await
}

/// Set the name of one live row, only while it still reads `from`. False
/// when the row is gone or its name changed since.
pub async fn rename(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    kind: NameKind,
    id: &str,
    from: &str,
    to: &str,
) -> Result<bool, sqlx::Error> {
    let sql = match kind {
        NameKind::Transaction => {
            "UPDATE transactions SET name = $4, updated_at = now()
             WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL AND name = $3"
        }
        NameKind::Item => {
            "UPDATE transaction_items SET name = $4, updated_at = now()
             WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL AND name = $3"
        }
    };
    sqlx::query(sql)
        .bind(workspace_id)
        .bind(id)
        .bind(from)
        .bind(to)
        .execute(executor)
        .await
        .map(|result| result.rows_affected() == 1)
}
