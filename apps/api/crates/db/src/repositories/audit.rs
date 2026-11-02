//! The append-only audit trail (D14, OPS-1).
//!
//! Every method takes an executor, and a service always passes its open
//! transaction: the audit row and the mutation it describes commit together
//! or not at all. There is no update and no delete here by design.

use serde_json::Value;
use sqlx::PgExecutor;

/// One entry. `source` names the surface the write came from and matches the
/// `transactions.source` vocabulary: `web`, `chat`, `import` or `receipt`.
#[derive(Debug)]
pub struct AuditEntry<'a> {
    pub workspace_id: &'a str,
    /// The real user, even when the write arrived through a chat tool call.
    pub user_id: &'a str,
    /// `{entity}.{verb}`, for example `wallet.deleted`.
    pub action: &'a str,
    pub entity: &'a str,
    pub entity_id: &'a str,
    pub before: Option<Value>,
    pub after: Option<Value>,
    pub source: &'a str,
}

/// The surface a write arrived from. Only `web` has a caller so far; the
/// other three arrive with chat, import and receipts.
pub const SOURCE_WEB: &str = "web";

pub async fn insert(
    executor: impl PgExecutor<'_>,
    entry: AuditEntry<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO audit_logs
             (id, workspace_id, user_id, action, entity, entity_id, before, after, source)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)"#,
        cuid2::create_id(),
        entry.workspace_id,
        entry.user_id,
        entry.action,
        entry.entity,
        entry.entity_id,
        entry.before,
        entry.after,
        entry.source
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Entries for one row, newest first (OPS-8).
///
/// Workspace-scoped like every read. There is no `deleted_at` here: the
/// table is append-only, and the history of a deleted row is the part a
/// reader most wants.
pub async fn list_for_entity(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    entity: &str,
    entity_id: &str,
) -> Result<Vec<AuditRow>, sqlx::Error> {
    sqlx::query_as!(
        AuditRow,
        r#"SELECT a.id, a.user_id, u.email AS user_email, u.name AS user_name,
                  a.action, a.before, a.after, a.source, a.created_at
           FROM audit_logs a
           JOIN users u ON u.id = a.user_id
           WHERE a.workspace_id = $1 AND a.entity = $2 AND a.entity_id = $3
           ORDER BY a.created_at DESC, a.id DESC"#,
        workspace_id,
        entity,
        entity_id
    )
    .fetch_all(executor)
    .await
}

#[derive(Debug, sqlx::FromRow)]
pub struct AuditRow {
    pub id: String,
    pub user_id: String,
    pub user_email: String,
    pub user_name: Option<String>,
    pub action: String,
    pub before: Option<Value>,
    pub after: Option<Value>,
    pub source: String,
    pub created_at: chrono::DateTime<chrono::Utc>,
}
