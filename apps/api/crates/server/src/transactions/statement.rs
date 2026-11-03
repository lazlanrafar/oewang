//! Importing a bank statement that is a picture rather than a table
//! (AI-4, AI-5, AI-6).
//!
//! A file with columns goes through the CSV wizard, because deterministic
//! beats model-driven whenever structure exists (D28). This path is for
//! what is left: a photograph or a scanned PDF.
//!
//! It is asynchronous, and that is the only thing that makes it different
//! from the CSV path. A statement can hold a thousand rows and the ladder
//! can spend forty-five seconds on the document before the first row
//! exists, so the request answers `202` with a job id and the work
//! continues in a task. The modal polls the job row.
//!
//! What it deliberately does not do is a second implementation of importing.
//! The extracted rows are shaped into the same `RawRow` the wizard produces
//! and handed to `service::import_rows`, so fingerprinting, duplicate
//! counting, rate resolution per row date, wallet locking and the audit row
//! are the ones already proven by the CSV path (TXN-16, TXN-23, D14). The
//! only thing written here is the job row.

use std::{collections::BTreeMap, sync::Arc};

use chrono::{Duration, Utc};
use oewang_clients::{FileStore, Owe1Client};
use oewang_db::{
    repositories::{accounts, transactions as repo, wallets},
    PgPool,
};
use oewang_domain::{csv_import::ColumnMapping, AppError, Result};

use crate::{
    audit::{Actor, SOURCE_IMPORT},
    transactions::service,
};

pub use oewang_db::repositories::transactions::ImportJobRow;

/// A `pending` job older than this is not running any more. Nothing
/// cancels it, because nothing can: the task that owned it died with the
/// process. The modal offers a retry instead of a spinner that never ends
/// (AI-6).
pub const STALE_AFTER_MINUTES: i64 = 10;

/// How many rows the review list carries.
///
/// A statement is capped at 5,000 rows and the modal polls every two
/// seconds; sending all of them back on every poll would be the largest
/// response in the product, repeatedly, to render a list nobody scrolls to
/// the end of. The three counts stay exact for the whole file however long
/// it is, and the list says when it was cut.
pub const REVIEW_ROWS: usize = 200;

/// The synthetic column names the extracted rows are shaped into.
///
/// They exist so the statement path can reuse the wizard's transform
/// unchanged. Splitting the amount across an "out" and an "in" column means
/// the sign rule stays in `csv_import::read_amount` and is written once.
const COLUMN_DATE: &str = "date";
const COLUMN_DESCRIPTION: &str = "description";
const COLUMN_OUT: &str = "expense";
const COLUMN_IN: &str = "income";

/// What one import is for: who it acts as, which document, which wallet,
/// and how many rows it may carry. Grouped because four of these are
/// strings and a transposed pair would be a wallet id read as a file id.
pub struct StatementImport<'a> {
    pub actor: Actor<'a>,
    pub request_id: &'a str,
    pub wallet_id: &'a str,
    pub vault_file_id: &'a str,
    pub row_limit: usize,
}

/// Start a job and answer immediately (AI-4).
///
/// The wallet and the file are both checked before the job row exists, so a
/// bad request is a 404 now rather than a job that fails in a minute.
pub async fn start(
    pool: &PgPool,
    store: &FileStore,
    ai: &Arc<Owe1Client>,
    request: StatementImport<'_>,
) -> Result<ImportJobRow> {
    let StatementImport {
        actor,
        request_id,
        wallet_id,
        vault_file_id,
        row_limit,
    } = request;

    // A wallet from another workspace is a wallet that does not exist
    // (AUTH-4).
    wallets::find_wallet(pool, actor.workspace_id, wallet_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;

    let document =
        crate::ai::extraction::document(pool, store, actor.workspace_id, vault_file_id).await?;

    let job = repo::insert_import_job(
        pool,
        &cuid2::create_id(),
        actor.workspace_id,
        actor.user_id,
        vault_file_id,
    )
    .await
    .map_err(internal)?;

    // Owned, because the task outlives the request that started it.
    let task = Run {
        pool: pool.clone(),
        ai: Arc::clone(ai),
        job_id: job.id.clone(),
        workspace_id: actor.workspace_id.to_string(),
        user_id: actor.user_id.to_string(),
        wallet_id: wallet_id.to_string(),
        request_id: request_id.to_string(),
        row_limit,
    };

    tokio::spawn(async move { task.run(document).await });

    Ok(job)
}

/// Read a job. Any member: a statement is the workspace's, and a viewer
/// watching an import finish is not a privileged question.
pub async fn find(pool: &PgPool, workspace_id: &str, job_id: &str) -> Result<ImportJobRow> {
    repo::find_import_job(pool, workspace_id, job_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ImportJobNotFound)
}

/// Whether a job has stopped reporting without finishing.
pub fn is_stale(job: &ImportJobRow) -> bool {
    job.status == "pending" && Utc::now() - job.created_at > Duration::minutes(STALE_AFTER_MINUTES)
}

struct Run {
    pool: PgPool,
    ai: Arc<Owe1Client>,
    job_id: String,
    workspace_id: String,
    user_id: String,
    wallet_id: String,
    request_id: String,
    row_limit: usize,
}

impl Run {
    /// Extract, write, record. Every failure ends in a finished job row:
    /// a job that stays `pending` because its task gave up quietly is the
    /// one outcome the modal cannot explain to anyone.
    async fn run(self, document: crate::ai::extraction::Document) {
        let outcome = self.work(document).await;

        let mut review = None;
        let (status, counts, code) = match outcome {
            Ok((outcome, rows)) => {
                review = Some(review_of(&rows, &outcome.outcomes));
                (
                    "succeeded",
                    (
                        outcome.created as i32,
                        outcome.skipped.len() as i32,
                        outcome.duplicates as i32,
                    ),
                    None,
                )
            }
            Err(error) => {
                // The code, never the message. A row-level message can
                // quote the statement back (OPS-3).
                tracing::warn!(
                    job_id = %self.job_id,
                    workspace_id = %self.workspace_id,
                    code = error.code(),
                    "statement import failed"
                );
                ("failed", (0, 0, 0), Some(error.code()))
            }
        };

        if let Err(error) = repo::finish_import_job(
            &self.pool,
            &self.job_id,
            repo::JobOutcome {
                status,
                imported: counts.0,
                skipped: counts.1,
                duplicates: counts.2,
                error: code,
                review: review.as_ref(),
            },
        )
        .await
        {
            tracing::error!(job_id = %self.job_id, %error, "the import job outcome was lost");
        }
    }

    /// The outcome and the rows it describes, so the caller can pair them
    /// into a review list.
    async fn work(
        &self,
        document: crate::ai::extraction::Document,
    ) -> Result<(
        service::BulkOutcome,
        Vec<crate::ai::extraction::StatementRow>,
    )> {
        let workspace = accounts::find_workspace(&self.pool, &self.workspace_id)
            .await
            .map_err(internal)?
            .ok_or(AppError::NotFound)?;

        let answer = crate::ai::extraction::extract_statement(
            &self.ai,
            &self.request_id,
            &self.workspace_id,
            &workspace.currency_code,
            document,
        )
        .await?;

        // Counts and a score, never a row. This is the line that says
        // whether the ladder's threshold is set right for statements
        // (docs/ai/service.md#observability, OPS-3).
        tracing::info!(
            job_id = %self.job_id,
            workspace_id = %self.workspace_id,
            rows = answer.rows.len(),
            score = answer.quality.score,
            "statement extracted"
        );

        let rows: Vec<BTreeMap<String, String>> = answer.rows.iter().map(shape).collect();

        let outcome = service::import_rows(
            &self.pool,
            Actor {
                workspace_id: &self.workspace_id,
                user_id: &self.user_id,
                source: SOURCE_IMPORT,
            },
            &self.wallet_id,
            &mapping(),
            &rows,
            // A statement carries no category column. The review step and
            // the bulk-update path are where rows get one.
            &BTreeMap::new(),
            self.row_limit,
        )
        .await?;

        Ok((outcome, answer.rows))
    }
}

/// Pair each extracted row with what became of it (AI-6).
///
/// The figures stay exactly the strings the model read. Nothing here
/// re-parses them: the row that was written already went through
/// `csv_import::transform`, and this list is a report of what the user
/// uploaded, not a second reading of it.
fn review_of(
    rows: &[crate::ai::extraction::StatementRow],
    outcomes: &[service::RowOutcome],
) -> serde_json::Value {
    let listed: Vec<serde_json::Value> = rows
        .iter()
        .zip(outcomes)
        .take(REVIEW_ROWS)
        .map(|(row, outcome)| {
            serde_json::json!({
                "date": row.date,
                "name": row.description,
                "amount": row.amount,
                "direction": row.direction,
                "status": outcome.as_str(),
            })
        })
        .collect();

    serde_json::json!({
        "rows": listed,
        // The counts beside it are for the whole file; this says whether
        // the list is (docs/api/endpoints.md#transactions).
        "truncated": rows.len() > REVIEW_ROWS,
    })
}

fn mapping() -> ColumnMapping {
    ColumnMapping {
        date: Some(COLUMN_DATE.into()),
        name: Some(COLUMN_DESCRIPTION.into()),
        description: None,
        amount: None,
        amount_out: Some(COLUMN_OUT.into()),
        amount_in: Some(COLUMN_IN.into()),
        currency: None,
        category: None,
    }
}

/// One extracted row as the transform expects to find it.
///
/// The direction decides which column the figure lands in, and nothing
/// else about the figure is touched here: it stays the string the model
/// produced until `csv_import::parse_amount` reads it (D12, D28).
fn shape(row: &crate::ai::extraction::StatementRow) -> BTreeMap<String, String> {
    let mut shaped = BTreeMap::new();
    shaped.insert(
        COLUMN_DATE.to_string(),
        row.date.clone().unwrap_or_default(),
    );
    shaped.insert(
        COLUMN_DESCRIPTION.to_string(),
        row.description.clone().unwrap_or_default(),
    );

    let amount = row.amount.clone().unwrap_or_default();
    let column = match row.direction.as_deref() {
        Some("income") => COLUMN_IN,
        _ => COLUMN_OUT,
    };
    shaped.insert(column.to_string(), amount);

    shaped
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}

#[cfg(test)]
mod tests {
    use super::*;
    use oewang_domain::{csv_import::transform, ledger::TransactionType};

    fn row(
        date: &str,
        description: &str,
        amount: &str,
        direction: &str,
    ) -> crate::ai::extraction::StatementRow {
        crate::ai::extraction::StatementRow {
            date: Some(date.into()),
            description: Some(description.into()),
            amount: Some(amount.into()),
            direction: Some(direction.into()),
        }
    }

    #[test]
    fn should_read_an_outgoing_row_as_an_expense() {
        let shaped = shape(&row("2026-11-02", "WARUNG TEKKO", "87500", "expense"));
        let read = transform(&mapping(), &shaped).unwrap();

        assert_eq!(read.kind, TransactionType::Expense);
        assert_eq!(
            read.amount,
            "87500".parse::<rust_decimal::Decimal>().unwrap()
        );
        assert_eq!(read.name.as_deref(), Some("WARUNG TEKKO"));
    }

    #[test]
    fn should_read_an_incoming_row_as_income() {
        let shaped = shape(&row("2026-11-02", "SALARY", "12000000", "income"));

        assert_eq!(
            transform(&mapping(), &shaped).unwrap().kind,
            TransactionType::Income
        );
    }

    #[test]
    fn should_read_an_unstated_direction_as_an_expense() {
        let mut raw = row("2026-11-02", "ATM", "500000", "expense");
        raw.direction = None;

        assert_eq!(
            transform(&mapping(), &shape(&raw)).unwrap().kind,
            TransactionType::Expense
        );
    }

    #[test]
    fn should_leave_a_row_with_no_date_to_be_skipped() {
        let mut raw = row("2026-11-02", "ATM", "500000", "expense");
        raw.date = None;

        // Not an error here: `import_rows` reports it with its index and
        // the file still imports (AI-5).
        assert!(transform(&mapping(), &shape(&raw)).is_err());
    }

    #[test]
    fn should_call_a_pending_job_stale_only_after_the_window() {
        let base = ImportJobRow {
            id: "j1".into(),
            workspace_id: "w1".into(),
            user_id: "u1".into(),
            status: "pending".into(),
            vault_file_id: Some("f1".into()),
            imported: None,
            skipped: None,
            duplicates: None,
            error: None,
            review: None,
            created_at: Utc::now(),
            updated_at: Utc::now(),
        };

        assert!(!is_stale(&base));

        let old = ImportJobRow {
            created_at: Utc::now() - Duration::minutes(STALE_AFTER_MINUTES + 1),
            ..base.clone()
        };
        assert!(is_stale(&old));

        let finished = ImportJobRow {
            status: "failed".into(),
            ..old
        };
        assert!(!is_stale(&finished), "a finished job is never stale");
    }
}
