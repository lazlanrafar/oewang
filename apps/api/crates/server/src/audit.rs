//! Who a write is for, and the audit row it leaves behind.
//!
//! One owner for both, because every service writes the same row the same
//! way: inside the mutation's own transaction, never after the commit
//! (D14, OPS-1).

use oewang_db::repositories::audit::{self, AuditEntry};
use oewang_domain::{AppError, Result};
use serde_json::Value;
use sqlx::{PgConnection, Postgres, Transaction};

/// The surface a write arrived from. Matches `transactions.source`.
pub const SOURCE_WEB: &str = "web";
#[allow(dead_code)]
pub const SOURCE_CHAT: &str = "chat";
pub const SOURCE_IMPORT: &str = "import";
pub const SOURCE_RECEIPT: &str = "receipt";
/// A write that arrived as a Telegram message or a tapped button (D86).
pub const SOURCE_TELEGRAM: &str = "telegram";

/// Who the write is for, and where it came from.
///
/// `workspace_id` and `user_id` come from the token, never from a body
/// (AUTH-4). `source` is the surface: a chat tool call carries the real
/// user here and says `chat`, which is the distinction the old app could
/// not make.
#[derive(Debug, Clone, Copy)]
pub struct Actor<'a> {
    pub workspace_id: &'a str,
    pub user_id: &'a str,
    pub source: &'a str,
}

impl<'a> Actor<'a> {
    pub fn web(workspace_id: &'a str, user_id: &'a str) -> Self {
        Self {
            workspace_id,
            user_id,
            source: SOURCE_WEB,
        }
    }

    pub fn with_source(self, source: &'a str) -> Self {
        Self { source, ..self }
    }
}

/// Write the audit row on the caller's open transaction.
pub async fn log(
    tx: &mut Transaction<'_, Postgres>,
    actor: Actor<'_>,
    action: &str,
    entity: &str,
    entity_id: &str,
    before: Option<Value>,
    after: Option<Value>,
) -> Result<()> {
    let connection: &mut PgConnection = tx;

    audit::insert(
        connection,
        AuditEntry {
            workspace_id: actor.workspace_id,
            user_id: actor.user_id,
            action,
            entity,
            entity_id,
            before,
            after,
            source: actor.source,
        },
    )
    .await
    .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))
}

/// A row as the audit trail records it.
pub fn snapshot<T: serde::Serialize>(row: &T) -> Result<Option<Value>> {
    serde_json::to_value(row)
        .map(Some)
        .map_err(|error| AppError::Internal(anyhow::anyhow!(error)))
}
