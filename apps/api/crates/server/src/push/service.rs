//! Devices, and the four pushes (D116).
//!
//! Every entry point below the device routes returns `()`: a push is told
//! nothing and tells nothing back. What fails is logged by device id, code
//! and status, never with the token or the message's subject (OPS-3).

use std::collections::BTreeSet;

use chrono::{DateTime, Utc};
use oewang_clients::{Delivery, PushMessage, PushSender};
use oewang_db::{
    repositories::{
        accounts,
        push::{self as repo, DeviceRow},
        receipts::ReceiptJobRow,
    },
    PgPool,
};
use oewang_domain::{
    budget::{Month, OVER_PERCENT, WARNING_PERCENT},
    AppError, Result,
};

use crate::{
    audit::{log, snapshot, Actor},
    budgets::service::{self as budgets, BudgetLine, Sort},
    receipts::queue::CHANNEL_TELEGRAM,
};

const ENTITY: &str = "device_token";

/// FCM tokens run to a couple of hundred characters. Anything near this is
/// not one.
const MAX_TOKEN_CHARS: usize = 4096;

pub const PLATFORMS: [&str; 2] = ["ios", "android"];

/// The thresholds announced, in order. Reaching the limit is announced at
/// exactly 100%, where the budget page starts calling it spent.
const THRESHOLDS: [i64; 2] = [WARNING_PERCENT, OVER_PERCENT];

// ------------------------------------------------------------------ devices

/// Register the caller's device, or move a live token to them (PUSH-1).
pub async fn register(
    pool: &PgPool,
    actor: Actor<'_>,
    token: &str,
    platform: &str,
) -> Result<DeviceRow> {
    let token = token.trim();
    if token.is_empty() || token.len() > MAX_TOKEN_CHARS {
        return Err(AppError::validation([("token", "Not a device token.")]));
    }
    if !PLATFORMS.contains(&platform) {
        return Err(AppError::validation([("platform", "Use ios or android.")]));
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    let row = repo::upsert_device(
        &mut *tx,
        &cuid2::create_id(),
        actor.user_id,
        platform,
        token,
    )
    .await
    .map_err(internal)?;
    // The row as stored, which never includes the token.
    log(
        &mut tx,
        actor,
        "device_token.registered",
        ENTITY,
        &row.id,
        None,
        snapshot(&row)?,
    )
    .await?;
    tx.commit().await.map_err(internal)?;
    Ok(row)
}

/// Remove one of the caller's own devices, on sign-out (PUSH-1). A token
/// that is already gone, or is someone else's, is not an error: signing out
/// must not fail because FCM retired the token first.
pub async fn remove(pool: &PgPool, actor: Actor<'_>, token: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;
    if let Some(row) = repo::soft_delete_for_user(&mut *tx, actor.user_id, token.trim())
        .await
        .map_err(internal)?
    {
        log(
            &mut tx,
            actor,
            "device_token.removed",
            ENTITY,
            &row.id,
            snapshot(&row)?,
            None,
        )
        .await?;
    }
    tx.commit().await.map_err(internal)?;
    Ok(())
}

// ----------------------------------------------------------------- sending

/// Push to every live device of one person, after the caller's commit.
pub async fn notify_user(pool: &PgPool, user_id: &str, message: PushMessage) {
    let Some(sender) = super::sender() else {
        return;
    };
    let (pool, user_id) = (pool.clone(), user_id.to_string());
    super::dispatch(async move { to_user(&pool, sender.as_ref(), &user_id, &message).await }).await;
}

/// Push to every live device of every member of a workspace.
pub async fn notify_workspace_members(pool: &PgPool, workspace_id: &str, message: PushMessage) {
    let Some(sender) = super::sender() else {
        return;
    };
    let (pool, workspace_id) = (pool.clone(), workspace_id.to_string());
    super::dispatch(async move {
        match repo::targets_for_workspace(&pool, &workspace_id).await {
            Ok(devices) => deliver(&pool, sender.as_ref(), devices, &message).await,
            Err(error) => tracing::warn!(%error, "push devices not read"),
        }
    })
    .await;
}

async fn to_user(pool: &PgPool, sender: &dyn PushSender, user_id: &str, message: &PushMessage) {
    match repo::targets_for_user(pool, user_id).await {
        Ok(devices) => deliver(pool, sender, devices, message).await,
        Err(error) => tracing::warn!(%error, "push devices not read"),
    }
}

/// One send per device. A token FCM reports dead is retired here, so the
/// next push does not try it again (PUSH-1).
pub(crate) async fn deliver(
    pool: &PgPool,
    sender: &dyn PushSender,
    devices: Vec<repo::DeviceTarget>,
    message: &PushMessage,
) {
    for device in devices {
        match sender.send(&device.token, message).await {
            Delivery::Sent => tracing::info!(device = %device.id, "push sent"),
            Delivery::Dead => {
                tracing::info!(device = %device.id, "push token rejected; device retired");
                if let Err(error) = repo::soft_delete_device(pool, &device.id).await {
                    tracing::warn!(device = %device.id, %error, "dead device not retired");
                }
            }
            Delivery::Failed(status) => {
                tracing::warn!(device = %device.id, ?status, "push not delivered");
            }
        }
    }
}

// ---------------------------------------------------------------- the four

/// A queued receipt has been saved or given up on (PUSH-2). One sent from
/// Telegram is answered in Telegram, where it was sent, and not pushed.
pub async fn receipt_finished(pool: &PgPool, job: &ReceiptJobRow, transaction_id: Option<&str>) {
    if job.channel == CHANNEL_TELEGRAM {
        return;
    }
    let message = match transaction_id {
        Some(id) => PushMessage {
            title: "Receipt saved".into(),
            body: "A receipt you sent for later has been read and saved.".into(),
            route: format!("/transactions?detail={id}"),
        },
        None => PushMessage {
            title: "Receipt not read".into(),
            body: "A receipt you sent for later could not be read. It is still in the Vault."
                .into(),
            route: format!("/vault?file={}", job.vault_file_id),
        },
    };
    notify_user(pool, &job.user_id, message).await;
}

/// A statement import has finished (PUSH-2). `imported` is `None` when it
/// failed.
pub async fn import_finished(pool: &PgPool, user_id: &str, imported: Option<i32>) {
    let message = match imported {
        Some(count) => PushMessage {
            title: "Statement imported".into(),
            body: match count {
                1 => "1 transaction was imported.".into(),
                count => format!("{count} transactions were imported."),
            },
            route: "/transactions".into(),
        },
        None => PushMessage {
            title: "Statement not imported".into(),
            body: "The statement could not be imported. Open it to try again.".into(),
            route: "/transactions".into(),
        },
    };
    notify_user(pool, user_id, message).await;
}

/// After transactions dated `dates` were written: announce each budget in
/// those months that has newly reached a threshold (PUSH-3).
///
/// Months rather than categories, because a budget's month is cheap to read
/// whole and the check is idempotent: a month that did not change finds its
/// thresholds already recorded and announces nothing. The unique key on
/// `budget_alerts` is what makes "once" hold when two writes race past the
/// same threshold; only the writer whose insert lands pushes.
pub async fn budgets_after_write(
    pool: &PgPool,
    workspace_id: &str,
    dates: impl IntoIterator<Item = DateTime<Utc>>,
) {
    if super::sender().is_none() {
        return;
    }
    let months: BTreeSet<Month> = dates.into_iter().map(Month::containing).collect();
    let (pool, workspace_id) = (pool.clone(), workspace_id.to_string());
    super::dispatch(async move {
        for month in months {
            if let Err(error) = check_month(&pool, &workspace_id, month).await {
                tracing::warn!(%workspace_id, code = error.code(), "budget alert check failed");
            }
        }
    })
    .await;
}

async fn check_month(pool: &PgPool, workspace_id: &str, month: Month) -> Result<()> {
    // The budget page's own figures (D27): the percent, and the amounts
    // already formatted in the workspace currency.
    let status = budgets::status(pool, workspace_id, month, None, Sort::default()).await?;

    for line in &status.budgets {
        // Every crossed threshold is recorded, so a jump past both does not
        // announce 80% on the next write; only the highest new one is sent.
        let mut announce = None;
        for threshold in THRESHOLDS
            .into_iter()
            .filter(|threshold| line.percent >= *threshold)
        {
            let inserted = repo::insert_budget_alert(
                pool,
                &cuid2::create_id(),
                workspace_id,
                &line.id,
                month.first_day(),
                threshold as i16,
            )
            .await
            .map_err(internal)?;
            if inserted {
                announce = Some(threshold);
            }
        }

        if let Some(threshold) = announce {
            notify_workspace_members(pool, workspace_id, budget_message(line, month, threshold))
                .await;
        }
    }
    Ok(())
}

pub(crate) fn budget_message(line: &BudgetLine, month: Month, threshold: i64) -> PushMessage {
    let title = if threshold >= OVER_PERCENT {
        format!("{}: budget reached", line.category_name)
    } else {
        format!("{}: {threshold}% of the budget used", line.category_name)
    };
    PushMessage {
        title,
        body: format!(
            "{} of {} spent in {} ({}%).",
            line.spent_formatted,
            line.amount_formatted,
            month.first_day().format("%B %Y"),
            line.percent,
        ),
        route: format!("/budgets?month={month}"),
    }
}

/// An invitation was made to an address that may have an account (PUSH-4).
///
/// The route names no invitation: its token is a credential, and a push is
/// read on a lock screen. The app opens its workspace list; the email,
/// which is sent either way, carries the link that accepts.
pub async fn invited(pool: &PgPool, workspace_id: &str, email: &str) {
    let Some(sender) = super::sender() else {
        return;
    };
    let (pool, workspace_id, email) = (pool.clone(), workspace_id.to_string(), email.to_string());
    super::dispatch(async move {
        let found = async {
            let user_id = accounts::find_user_id_by_email(&pool, &email).await?;
            let workspace = accounts::find_workspace(&pool, &workspace_id).await?;
            Ok::<_, sqlx::Error>(user_id.zip(workspace))
        };
        match found.await {
            Ok(Some((user_id, workspace))) => {
                let message = PushMessage {
                    title: "Workspace invitation".into(),
                    body: format!(
                        "You have been invited to {}. Open the invitation email to join.",
                        workspace.name
                    ),
                    route: "/workspaces".into(),
                };
                to_user(&pool, sender.as_ref(), &user_id, &message).await;
            }
            // No account at that address: the email is the whole invitation.
            Ok(None) => {}
            Err(error) => tracing::warn!(%error, "invitation push not prepared"),
        }
    })
    .await;
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
