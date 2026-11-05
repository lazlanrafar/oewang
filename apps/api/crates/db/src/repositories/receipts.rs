//! Receipts waiting for the reader (D95). The rows are the queue: a
//! process restart loses nothing, and two API replicas never take the same
//! row, because claiming uses `FOR UPDATE SKIP LOCKED`.
//!
//! See docs/data-model.md#receipt-jobs.

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::PgExecutor;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReceiptJobRow {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub vault_file_id: String,
    pub channel: String,
    pub chat_id: Option<i64>,
    pub status: String,
    pub attempts: i32,
    pub next_attempt_at: DateTime<Utc>,
    pub last_error: Option<String>,
    pub transaction_id: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Queue a receipt. A file already queued keeps its job: the second request
/// is the same request, and its row is returned unchanged.
#[derive(Debug, Clone, Copy)]
pub struct NewReceiptJob<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub user_id: &'a str,
    pub vault_file_id: &'a str,
    pub channel: &'a str,
    pub chat_id: Option<i64>,
    pub first_attempt_at: DateTime<Utc>,
}

pub async fn enqueue(
    executor: impl PgExecutor<'_>,
    job: NewReceiptJob<'_>,
) -> Result<ReceiptJobRow, sqlx::Error> {
    sqlx::query_as!(
        ReceiptJobRow,
        r#"INSERT INTO receipt_jobs
             (id, workspace_id, user_id, vault_file_id, channel, chat_id, next_attempt_at)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (vault_file_id) DO UPDATE SET updated_at = receipt_jobs.updated_at
           RETURNING id, workspace_id, user_id, vault_file_id, channel, chat_id, status,
                     attempts, next_attempt_at, last_error, transaction_id, created_at"#,
        job.id,
        job.workspace_id,
        job.user_id,
        job.vault_file_id,
        job.channel,
        job.chat_id,
        job.first_attempt_at
    )
    .fetch_one(executor)
    .await
}

/// Take up to `limit` due jobs and mark them processing, in one statement.
pub async fn claim_due(
    executor: impl PgExecutor<'_>,
    limit: i64,
) -> Result<Vec<ReceiptJobRow>, sqlx::Error> {
    sqlx::query_as!(
        ReceiptJobRow,
        r#"UPDATE receipt_jobs SET status = 'processing', attempts = attempts + 1, updated_at = now()
           WHERE id IN (
             SELECT id FROM receipt_jobs
             WHERE status = 'pending' AND next_attempt_at <= now()
             ORDER BY next_attempt_at
             LIMIT $1
             FOR UPDATE SKIP LOCKED
           )
           RETURNING id, workspace_id, user_id, vault_file_id, channel, chat_id, status,
                     attempts, next_attempt_at, last_error, transaction_id, created_at"#,
        limit
    )
    .fetch_all(executor)
    .await
}

/// A process that died mid-read leaves rows in `processing`. After this
/// long they are pending again; the read is idempotent up to the save, and
/// the save and the `done` mark share one transaction.
pub async fn release_stale(
    executor: impl PgExecutor<'_>,
    older_than: DateTime<Utc>,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE receipt_jobs SET status = 'pending', updated_at = now()
           WHERE status = 'processing' AND updated_at < $1"#,
        older_than
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn reschedule(
    executor: impl PgExecutor<'_>,
    id: &str,
    next_attempt_at: DateTime<Utc>,
    code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE receipt_jobs
           SET status = 'pending', next_attempt_at = $2, last_error = $3, updated_at = now()
           WHERE id = $1"#,
        id,
        next_attempt_at,
        code
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn mark_done(
    executor: impl PgExecutor<'_>,
    id: &str,
    transaction_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE receipt_jobs
           SET status = 'done', transaction_id = $2, last_error = NULL, updated_at = now()
           WHERE id = $1"#,
        id,
        transaction_id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn mark_failed(
    executor: impl PgExecutor<'_>,
    id: &str,
    code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE receipt_jobs SET status = 'failed', last_error = $2, updated_at = now()
           WHERE id = $1"#,
        id,
        code
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// A web job that ended and has not been told yet, with what it made.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct NoticeRow {
    pub id: String,
    pub status: String,
    pub last_error: Option<String>,
    pub file_name: String,
    pub transaction_id: Option<String>,
    pub transaction_name: Option<String>,
    pub amount: Option<rust_decimal::Decimal>,
    pub currency_code: Option<String>,
}

pub async fn unseen_notices(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<Vec<NoticeRow>, sqlx::Error> {
    sqlx::query_as!(
        NoticeRow,
        r#"SELECT j.id, j.status, j.last_error, f.name AS file_name, j.transaction_id,
                  t.name AS "transaction_name?", t.amount AS "amount?",
                  w.currency_code AS "currency_code?"
           FROM receipt_jobs j
           JOIN vault_files f ON f.id = j.vault_file_id
           LEFT JOIN transactions t ON t.id = j.transaction_id AND t.deleted_at IS NULL
           LEFT JOIN wallets w ON w.id = t.wallet_id
           WHERE j.workspace_id = $1 AND j.user_id = $2 AND j.channel = 'web'
             AND j.status IN ('done', 'failed') AND j.seen_at IS NULL
           ORDER BY j.updated_at"#,
        workspace_id,
        user_id
    )
    .fetch_all(executor)
    .await
}

pub async fn mark_seen(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
    ids: &[String],
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE receipt_jobs SET seen_at = now()
           WHERE workspace_id = $1 AND user_id = $2 AND id = ANY($3) AND seen_at IS NULL"#,
        workspace_id,
        user_id,
        ids
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// The live transaction a file is already attached to, if any.
pub async fn transaction_for_file(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    vault_file_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT t.id
           FROM transaction_attachments a
           JOIN transactions t ON t.id = a.transaction_id
           WHERE a.workspace_id = $1 AND a.vault_file_id = $2
             AND a.deleted_at IS NULL AND t.deleted_at IS NULL
           ORDER BY t.created_at
           LIMIT 1"#,
        workspace_id,
        vault_file_id
    )
    .fetch_optional(executor)
    .await
}
