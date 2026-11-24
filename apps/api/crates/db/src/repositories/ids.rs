//! Who holds an id, across the tables a client may name ids in (D114).

use sqlx::PgExecutor;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct IdHolder {
    /// `transaction`, `wallet`, `category`, `contact`, `debt` or `debt_payment`.
    pub kind: String,
    pub workspace_id: String,
}

/// The row an id already names, in any workspace, live or deleted.
///
/// The one read that deliberately filters neither `workspace_id` nor
/// `deleted_at`: a client-made id must not collide with a row anywhere. The
/// service answers a foreign holder with `ID_TAKEN` and never returns it.
pub async fn holder(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<IdHolder>, sqlx::Error> {
    sqlx::query_as!(
        IdHolder,
        r#"SELECT 'transaction' AS "kind!", workspace_id AS "workspace_id!"
             FROM transactions WHERE id = $1
           UNION ALL
           SELECT 'wallet', workspace_id FROM wallets WHERE id = $1
           UNION ALL
           SELECT 'category', workspace_id FROM categories WHERE id = $1
           UNION ALL
           SELECT 'contact', workspace_id FROM contacts WHERE id = $1
           UNION ALL
           SELECT 'debt', workspace_id FROM debts WHERE id = $1
           UNION ALL
           SELECT 'debt_payment', workspace_id FROM debt_payments WHERE id = $1
           LIMIT 1"#,
        id
    )
    .fetch_optional(executor)
    .await
}
