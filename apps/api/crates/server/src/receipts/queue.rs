//! Receipts waiting for the reader, and the loop that keeps asking (D95).
//!
//! In-process, like the rate refresher and the statement import (D10): a
//! tokio task on a fixed tick, its state in `receipt_jobs`, so a restart
//! loses nothing and two replicas never take the same row. Not a worker
//! service, which stays a non-goal.
//!
//! The schedule backs off, 1, 2, 5, 10 and 30 minutes and then hourly, and
//! gives up a day after the receipt arrived (AI-12). A refusal that a retry
//! cannot fix (no total, no account, the wrong currency) ends the job at
//! once.

use std::time::Duration;

use chrono::{DateTime, Duration as ChronoDuration, Utc};
use oewang_db::repositories::receipts::{self as jobs, ReceiptJobRow};
use oewang_domain::{AppError, Result};

use crate::{
    audit::{Actor, SOURCE_RECEIPT, SOURCE_TELEGRAM},
    receipts::service::{read_and_save, Read},
    state::AppState,
    telegram::{render, reply},
};

pub const CHANNEL_WEB: &str = "web";
pub const CHANNEL_TELEGRAM: &str = "telegram";

/// How often the loop looks for due jobs.
const TICK: Duration = Duration::from_secs(30);

/// How many receipts one tick reads. The reader is the bottleneck, and a
/// reader that has just come back should not be handed a day's backlog at
/// once.
const BATCH: i64 = 3;

/// A job stuck in `processing` this long belonged to a process that died.
const STALE_AFTER_MINUTES: i64 = 10;

/// How long a receipt is retried before it is given up on.
pub const GIVE_UP_AFTER_HOURS: i64 = 24;

/// The wait before the next attempt, by attempts already made.
pub fn backoff(attempts: i32) -> ChronoDuration {
    let minutes = match attempts {
        ..=1 => 1,
        2 => 2,
        3 => 5,
        4 => 10,
        5 => 30,
        _ => 60,
    };
    ChronoDuration::minutes(minutes)
}

/// What to do with a job after one attempt.
#[derive(Debug, PartialEq, Eq)]
pub enum Next {
    Done(String),
    Retry(DateTime<Utc>, &'static str),
    Fail(String),
}

/// The decision, apart from the database, so the schedule is testable.
pub fn decide(read: &Read, attempts: i32, created_at: DateTime<Utc>, now: DateTime<Utc>) -> Next {
    match read {
        Read::Saved { transaction_id, .. } => Next::Done(transaction_id.clone()),
        Read::Busy(code) => {
            let next = now + backoff(attempts);
            if next > created_at + ChronoDuration::hours(GIVE_UP_AFTER_HOURS) {
                Next::Fail((*code).to_string())
            } else {
                Next::Retry(next, code)
            }
        }
        Read::Unreadable => Next::Fail(AppError::ReceiptUnreadable.code().to_string()),
        Read::NoAccount => Next::Fail("NO_ACCOUNT".into()),
        Read::CurrencyMismatch(_) => Next::Fail("CURRENCY_MISMATCH".into()),
    }
}

/// Queue a receipt the reader could not answer for. The first retry is a
/// minute away: the reader just failed, and asking again at once would
/// only fail again.
pub async fn enqueue(
    state: &AppState,
    workspace_id: &str,
    user_id: &str,
    vault_file_id: &str,
    channel: &str,
    chat_id: Option<i64>,
) -> Result<ReceiptJobRow> {
    jobs::enqueue(
        &state.db,
        jobs::NewReceiptJob {
            id: &cuid2::create_id(),
            workspace_id,
            user_id,
            vault_file_id,
            channel,
            chat_id,
            first_attempt_at: Utc::now() + backoff(1),
        },
    )
    .await
    .map_err(internal)
}

pub fn spawn(state: AppState) {
    tokio::spawn(async move {
        let mut ticker = tokio::time::interval(TICK);
        loop {
            ticker.tick().await;
            if let Err(error) = tick(&state).await {
                tracing::warn!(%error, "receipt queue tick failed");
            }
        }
    });
}

/// One pass: free what a dead process held, then read what is due.
pub async fn tick(state: &AppState) -> Result<usize> {
    let stale = Utc::now() - ChronoDuration::minutes(STALE_AFTER_MINUTES);
    jobs::release_stale(&state.db, stale)
        .await
        .map_err(internal)?;

    let due = jobs::claim_due(&state.db, BATCH).await.map_err(internal)?;
    let count = due.len();
    for job in due {
        if let Err(error) = run(state, &job).await {
            // Logged by id and code only; never the receipt (OPS-3). The
            // job goes back to pending so the next tick can try again.
            tracing::warn!(job = %job.id, code = error.code(), "receipt job attempt failed");
            jobs::reschedule(
                &state.db,
                &job.id,
                Utc::now() + backoff(job.attempts),
                error.code(),
            )
            .await
            .map_err(internal)?;
        }
    }
    Ok(count)
}

async fn run(state: &AppState, job: &ReceiptJobRow) -> Result<()> {
    let actor = Actor {
        workspace_id: &job.workspace_id,
        user_id: &job.user_id,
        source: if job.channel == CHANNEL_TELEGRAM {
            SOURCE_TELEGRAM
        } else {
            SOURCE_RECEIPT
        },
    };

    let read = read_and_save(state, actor, &job.vault_file_id).await?;
    let next = decide(&read, job.attempts, job.created_at, Utc::now());

    match &next {
        Next::Done(transaction_id) => {
            jobs::mark_done(&state.db, &job.id, transaction_id)
                .await
                .map_err(internal)?;
            tracing::info!(job = %job.id, attempts = job.attempts, "queued receipt saved");
        }
        Next::Retry(at, code) => {
            jobs::reschedule(&state.db, &job.id, *at, code)
                .await
                .map_err(internal)?;
            return Ok(());
        }
        Next::Fail(code) => {
            jobs::mark_failed(&state.db, &job.id, code)
                .await
                .map_err(internal)?;
            tracing::info!(job = %job.id, %code, "queued receipt given up");
        }
    }

    tell(state, job, &read).await;
    Ok(())
}

/// Tell the person how it ended, where they sent it. The web is told on its
/// next page load (`GET /v1/receipts/notices`), so only Telegram is sent
/// anything here. A message that does not arrive does not undo the save.
async fn tell(state: &AppState, job: &ReceiptJobRow, read: &Read) {
    if job.channel != CHANNEL_TELEGRAM {
        return;
    }
    let (Some(bot), Some(chat_id)) = (&state.telegram, job.chat_id) else {
        return;
    };

    let sent = match read {
        Read::Saved {
            transaction_id,
            check,
        } => match reply::saved(&state.db, &job.workspace_id, transaction_id, check).await {
            Ok(message) => bot
                .client
                .send_message(chat_id, &message.text, Some(&message.keyboard))
                .await
                .map(|_| ()),
            Err(error) => {
                tracing::warn!(job = %job.id, code = error.code(), "saved receipt reply failed");
                return;
            }
        },
        Read::Busy(_) => bot
            .client
            .send_message(chat_id, render::QUEUE_GAVE_UP, None)
            .await
            .map(|_| ()),
        Read::Unreadable => bot
            .client
            .send_message(chat_id, render::RECEIPT_UNREADABLE, None)
            .await
            .map(|_| ()),
        Read::NoAccount => bot
            .client
            .send_message(chat_id, render::NO_ACCOUNT, None)
            .await
            .map(|_| ()),
        Read::CurrencyMismatch(currency) => bot
            .client
            .send_message(chat_id, &render::currency_mismatch(currency), None)
            .await
            .map(|_| ()),
    };

    if let Err(error) = sent {
        tracing::warn!(job = %job.id, %error, "receipt queue reply not delivered");
    }
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn at(hours: i64) -> DateTime<Utc> {
        Utc.with_ymd_and_hms(2026, 11, 5, 12, 0, 0).unwrap() + ChronoDuration::hours(hours)
    }

    use chrono::TimeZone;

    #[test]
    fn should_back_off_then_settle_at_an_hour() {
        let minutes: Vec<i64> = (1..=8).map(|n| backoff(n).num_minutes()).collect();
        assert_eq!(minutes, vec![1, 2, 5, 10, 30, 60, 60, 60]);
    }

    #[test]
    fn should_retry_a_busy_reader_within_the_day() {
        let next = decide(&Read::Busy("EXTRACTION_NO_ANSWER"), 2, at(0), at(1));
        assert_eq!(
            next,
            Next::Retry(at(1) + ChronoDuration::minutes(2), "EXTRACTION_NO_ANSWER")
        );
    }

    #[test]
    fn should_give_up_a_day_after_the_receipt_arrived() {
        let next = decide(&Read::Busy("AI_UNAVAILABLE"), 30, at(0), at(24));
        assert_eq!(next, Next::Fail("AI_UNAVAILABLE".into()));
    }

    #[test]
    fn should_end_at_once_on_what_a_retry_cannot_fix() {
        assert_eq!(
            decide(&Read::Unreadable, 1, at(0), at(0)),
            Next::Fail("RECEIPT_UNREADABLE".into())
        );
        assert_eq!(
            decide(&Read::CurrencyMismatch("USD".into()), 1, at(0), at(0)),
            Next::Fail("CURRENCY_MISMATCH".into())
        );
    }

    #[test]
    fn should_finish_with_the_saved_transaction() {
        let read = Read::Saved {
            transaction_id: "t1".into(),
            check: vec![],
        };
        assert_eq!(decide(&read, 3, at(0), at(2)), Next::Done("t1".into()));
    }
}

#[cfg(test)]
mod db_tests {
    use chrono::{Duration as ChronoDuration, Utc};
    use oewang_db::repositories::receipts as jobs;
    use sqlx::PgPool;

    const WORKSPACE: &str = "ws_rq";
    const USER: &str = "usr_rq";

    async fn fixture(pool: &PgPool) {
        for sql in [
            "INSERT INTO users (id, email, password_hash) VALUES ('usr_rq', 'rq@example.com', 'x')",
            "INSERT INTO workspaces (id, name, slug, currency_code) VALUES ('ws_rq', 'R', 'r', 'IDR')",
            "INSERT INTO vault_files (id, workspace_id, name, key, size, type, status)
             VALUES ('f1', 'ws_rq', 'a.jpg', 'wsp/ws_rq/f1', 10, 'image/jpeg', 'ready'),
                    ('f2', 'ws_rq', 'b.jpg', 'wsp/ws_rq/f2', 10, 'image/jpeg', 'ready')",
        ] {
            sqlx::query(sql).execute(pool).await.unwrap();
        }
    }

    fn job<'a>(id: &'a str, file: &'a str, at: chrono::DateTime<Utc>) -> jobs::NewReceiptJob<'a> {
        jobs::NewReceiptJob {
            id,
            workspace_id: WORKSPACE,
            user_id: USER,
            vault_file_id: file,
            channel: "web",
            chat_id: None,
            first_attempt_at: at,
        }
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_keep_one_job_per_file(pool: PgPool) {
        fixture(&pool).await;
        let first = jobs::enqueue(&pool, job("j1", "f1", Utc::now()))
            .await
            .unwrap();
        let again = jobs::enqueue(&pool, job("j2", "f1", Utc::now()))
            .await
            .unwrap();
        assert_eq!(
            first.id, again.id,
            "queuing the same receipt twice is one request"
        );
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_claim_only_what_is_due_and_count_the_attempt(pool: PgPool) {
        fixture(&pool).await;
        jobs::enqueue(
            &pool,
            job("due", "f1", Utc::now() - ChronoDuration::minutes(1)),
        )
        .await
        .unwrap();
        jobs::enqueue(
            &pool,
            job("later", "f2", Utc::now() + ChronoDuration::hours(1)),
        )
        .await
        .unwrap();

        let claimed = jobs::claim_due(&pool, 10).await.unwrap();
        assert_eq!(claimed.len(), 1);
        assert_eq!(claimed[0].id, "due");
        assert_eq!(claimed[0].status, "processing");
        assert_eq!(claimed[0].attempts, 1);

        assert!(
            jobs::claim_due(&pool, 10).await.unwrap().is_empty(),
            "a claimed job is not claimed twice"
        );
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_release_a_job_a_dead_process_held(pool: PgPool) {
        fixture(&pool).await;
        jobs::enqueue(
            &pool,
            job("j1", "f1", Utc::now() - ChronoDuration::minutes(1)),
        )
        .await
        .unwrap();
        jobs::claim_due(&pool, 10).await.unwrap();

        let released = jobs::release_stale(&pool, Utc::now() + ChronoDuration::minutes(1))
            .await
            .unwrap();
        assert_eq!(released, 1);
        assert_eq!(jobs::claim_due(&pool, 10).await.unwrap().len(), 1);
    }

    #[sqlx::test(migrations = "../../migrations")]
    async fn should_tell_the_web_once(pool: PgPool) {
        fixture(&pool).await;
        jobs::enqueue(&pool, job("j1", "f1", Utc::now()))
            .await
            .unwrap();
        jobs::mark_failed(&pool, "j1", "AI_UNAVAILABLE")
            .await
            .unwrap();

        let notices = jobs::unseen_notices(&pool, WORKSPACE, USER).await.unwrap();
        assert_eq!(notices.len(), 1);
        assert_eq!(notices[0].last_error.as_deref(), Some("AI_UNAVAILABLE"));

        jobs::mark_seen(&pool, WORKSPACE, USER, &["j1".to_string()])
            .await
            .unwrap();
        assert!(jobs::unseen_notices(&pool, WORKSPACE, USER)
            .await
            .unwrap()
            .is_empty());

        let other = jobs::unseen_notices(&pool, "ws_other", USER).await.unwrap();
        assert!(other.is_empty(), "scoped by workspace");
    }
}
