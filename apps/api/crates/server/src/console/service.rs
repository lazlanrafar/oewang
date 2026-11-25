//! Console rules (CSL).

use oewang_db::repositories::{
    console::{
        self, ConsoleUserRow, ConsoleWorkspaceRow, MemberRow, MembershipRow, OperatorRow, UserSort,
        WorkspaceCounts, WorkspaceSort, WorkspaceStatus,
    },
    usage,
    vault::{self, StorageUsage},
};
use oewang_domain::{AppError, Page, Result};
use serde::Serialize;
use sqlx::PgPool;

/// The user's console role, or CONSOLE_FORBIDDEN when they hold none.
pub async fn operator(pool: &PgPool, user_id: &str) -> Result<OperatorRow> {
    console::find_operator(pool, user_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::ConsoleForbidden)
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

/// A page of users and the total that matches (CSL-3).
pub async fn users(
    pool: &PgPool,
    search: Option<&str>,
    sort: UserSort,
    descending: bool,
    page: Page,
) -> Result<(Vec<ConsoleUserRow>, i64)> {
    let rows = console::list_users(
        pool,
        search,
        sort,
        descending,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;
    let total = console::count_users(pool, search).await.map_err(internal)?;
    Ok((rows, total))
}

#[derive(Debug, Serialize)]
pub struct UserDetail {
    #[serde(flatten)]
    pub user: ConsoleUserRow,
    pub memberships: Vec<MembershipRow>,
}

pub async fn user(pool: &PgPool, id: &str) -> Result<UserDetail> {
    let user = console::find_user(pool, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let memberships = console::user_memberships(pool, id)
        .await
        .map_err(internal)?;
    Ok(UserDetail { user, memberships })
}

/// A page of workspaces and the total that matches (CSL-4).
pub async fn workspaces(
    pool: &PgPool,
    search: Option<&str>,
    status: Option<WorkspaceStatus>,
    sort: WorkspaceSort,
    descending: bool,
    page: Page,
) -> Result<(Vec<ConsoleWorkspaceRow>, i64)> {
    let rows = console::list_workspaces(
        pool,
        search,
        status,
        sort,
        descending,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;
    let total = console::count_workspaces(pool, search, status)
        .await
        .map_err(internal)?;
    Ok((rows, total))
}

#[derive(Debug, Default, Serialize)]
pub struct Tokens {
    pub input: i64,
    pub output: i64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceDetail {
    #[serde(flatten)]
    pub workspace: ConsoleWorkspaceRow,
    pub member_list: Vec<MemberRow>,
    pub counts: WorkspaceCounts,
    pub storage: StorageUsage,
    /// Since the first of this month, UTC, as the usage page counts it.
    pub tokens_month: Tokens,
}

pub async fn workspace(pool: &PgPool, id: &str) -> Result<WorkspaceDetail> {
    let workspace = console::find_workspace(pool, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let member_list = console::workspace_members(pool, id)
        .await
        .map_err(internal)?;
    let counts = console::workspace_counts(pool, id)
        .await
        .map_err(internal)?;
    let storage = vault::storage_usage(pool, id).await.map_err(internal)?;
    let tokens_month = usage::totals_by_feature(pool, id)
        .await
        .map_err(internal)?
        .iter()
        .fold(Tokens::default(), |sum, row| Tokens {
            input: sum.input + row.month_input,
            output: sum.output + row.month_output,
        });
    Ok(WorkspaceDetail {
        workspace,
        member_list,
        counts,
        storage,
        tokens_month,
    })
}

// ---------------------------------------------------------------- actions

async fn audit(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    operator_id: &str,
    action: &str,
    entity: &str,
    entity_id: &str,
    before: Option<serde_json::Value>,
    after: Option<serde_json::Value>,
) -> Result<()> {
    console::insert_operator_audit(
        &mut **tx,
        console::OperatorAuditEntry {
            operator_id,
            action,
            entity,
            entity_id,
            before,
            after,
        },
    )
    .await
    .map_err(internal)
}

fn snapshot<T: Serialize>(row: &T) -> Result<Option<serde_json::Value>> {
    crate::audit::snapshot(row)
}

/// Suspend or unsuspend a workspace (CSL-5). Asking for the state it is
/// already in changes nothing and writes no audit row.
pub async fn set_suspended(
    pool: &PgPool,
    operator_id: &str,
    id: &str,
    suspend: bool,
) -> Result<ConsoleWorkspaceRow> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let (deleted_at, suspended_at) = console::lock_workspace(&mut *tx, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    if deleted_at.is_some() {
        return Err(AppError::validation([(
            "workspace",
            "The workspace is deleted. Restore it first.",
        )]));
    }
    if suspended_at.is_some() != suspend {
        let before = console::find_workspace(&mut *tx, id)
            .await
            .map_err(internal)?;
        console::set_workspace_suspended(&mut *tx, id, suspend)
            .await
            .map_err(internal)?;
        let after = console::find_workspace(&mut *tx, id)
            .await
            .map_err(internal)?;
        let action = if suspend {
            "workspace.suspended"
        } else {
            "workspace.unsuspended"
        };
        audit(
            &mut tx,
            operator_id,
            action,
            "workspace",
            id,
            snapshot(&before)?,
            snapshot(&after)?,
        )
        .await?;
    }
    let row = console::find_workspace(&mut *tx, id)
        .await
        .map_err(internal)?;
    tx.commit().await.map_err(internal)?;
    row.ok_or(AppError::NotFound)
}

/// Bring back a workspace its owner deleted (CSL-6). Its data was never
/// removed (OPS-2), so clearing `deleted_at` is the whole restore.
pub async fn restore(pool: &PgPool, operator_id: &str, id: &str) -> Result<ConsoleWorkspaceRow> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let (deleted_at, _) = console::lock_workspace(&mut *tx, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    if deleted_at.is_some() {
        let before = console::find_workspace(&mut *tx, id)
            .await
            .map_err(internal)?;
        console::restore_workspace(&mut *tx, id)
            .await
            .map_err(internal)?;
        let after = console::find_workspace(&mut *tx, id)
            .await
            .map_err(internal)?;
        audit(
            &mut tx,
            operator_id,
            "workspace.restored",
            "workspace",
            id,
            snapshot(&before)?,
            snapshot(&after)?,
        )
        .await?;
    }
    let row = console::find_workspace(&mut *tx, id)
        .await
        .map_err(internal)?;
    tx.commit().await.map_err(internal)?;
    row.ok_or(AppError::NotFound)
}

/// Disable or enable a user (CSL-7). Disabling ends every way they are
/// signed in, as "sign out everywhere" does: sessions, Telegram chats and
/// MCP clients. Nobody disables an operator, themselves included: revoke
/// the console role first, so the console can never lock out its owner.
pub async fn set_disabled(
    pool: &PgPool,
    operator_id: &str,
    id: &str,
    disable: bool,
) -> Result<ConsoleUserRow> {
    let mut tx = pool.begin().await.map_err(internal)?;
    let (disabled_at, console_role) = console::lock_user(&mut *tx, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    if disable && (id == operator_id || console_role.is_some()) {
        return Err(AppError::validation([(
            "user",
            "An operator cannot be disabled. Revoke their console role first.",
        )]));
    }
    if disabled_at.is_some() != disable {
        let before = console::find_user(&mut *tx, id).await.map_err(internal)?;
        console::set_user_disabled(&mut *tx, id, disable)
            .await
            .map_err(internal)?;
        if disable {
            oewang_db::repositories::tokens::revoke_all_for_user(&mut *tx, id)
                .await
                .map_err(internal)?;
            crate::telegram::link::revoke_all_for_user(&mut *tx, id).await?;
            oewang_db::repositories::mcp::revoke_all_for_user(&mut *tx, id)
                .await
                .map_err(internal)?;
        }
        let after = console::find_user(&mut *tx, id).await.map_err(internal)?;
        let action = if disable {
            "user.disabled"
        } else {
            "user.enabled"
        };
        audit(
            &mut tx,
            operator_id,
            action,
            "user",
            id,
            snapshot(&before)?,
            snapshot(&after)?,
        )
        .await?;
    }
    let row = console::find_user(&mut *tx, id).await.map_err(internal)?;
    tx.commit().await.map_err(internal)?;
    row.ok_or(AppError::NotFound)
}

// --------------------------------------------------------------- feedback

pub const FEEDBACK_STATUSES: [&str; 2] = ["open", "done"];
pub const MAX_NOTE_CHARS: usize = 2000;

/// A page of feedback and the total that matches (CSL-8).
pub async fn feedback(
    pool: &PgPool,
    filter: &console::FeedbackFilter<'_>,
    page: Page,
) -> Result<(Vec<console::ConsoleFeedbackRow>, i64)> {
    let rows = console::list_feedback(pool, filter, i64::from(page.limit), page.offset())
        .await
        .map_err(internal)?;
    let total = console::count_feedback(pool, filter)
        .await
        .map_err(internal)?;
    Ok((rows, total))
}

/// Answer feedback: its status, its internal note, or both (CSL-8). An
/// absent field is left alone; an empty note clears it.
pub async fn update_feedback(
    pool: &PgPool,
    operator_id: &str,
    id: &str,
    status: Option<&str>,
    note: Option<Option<&str>>,
) -> Result<console::ConsoleFeedbackRow> {
    if let Some(status) = status {
        if !FEEDBACK_STATUSES.contains(&status) {
            return Err(AppError::validation([("status", "Use open or done.")]));
        }
    }
    let note = note.map(|note| note.map(str::trim).filter(|note| !note.is_empty()));
    if let Some(Some(note)) = note {
        if note.chars().count() > MAX_NOTE_CHARS {
            return Err(AppError::validation([(
                "operator_note",
                "A note can be at most 2000 characters.",
            )]));
        }
    }

    let mut tx = pool.begin().await.map_err(internal)?;
    if !console::lock_feedback(&mut *tx, id)
        .await
        .map_err(internal)?
    {
        return Err(AppError::NotFound);
    }
    let before = console::find_feedback(&mut *tx, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let next_status = status.unwrap_or(&before.status);
    let next_note = match note {
        Some(note) => note,
        None => before.operator_note.as_deref(),
    };
    if next_status != before.status || next_note != before.operator_note.as_deref() {
        console::update_feedback(&mut *tx, id, next_status, next_note)
            .await
            .map_err(internal)?;
        let after = console::find_feedback(&mut *tx, id)
            .await
            .map_err(internal)?;
        audit(
            &mut tx,
            operator_id,
            "feedback.updated",
            "feedback",
            id,
            snapshot(&before)?,
            snapshot(&after)?,
        )
        .await?;
    }
    let row = console::find_feedback(&mut *tx, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    tx.commit().await.map_err(internal)?;
    Ok(row)
}

// ------------------------------------------------- overview, usage, health

#[derive(Debug, Serialize)]
pub struct UserCounts {
    pub total: i64,
    pub new_7d: i64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceStatusCounts {
    pub total: i64,
    pub active: i64,
    pub suspended: i64,
    pub deleted: i64,
}

/// The console's front page (CSL-10).
#[derive(Debug, Serialize)]
pub struct Overview {
    pub users: UserCounts,
    pub workspaces: WorkspaceStatusCounts,
    pub feedback_open: i64,
    pub tokens_month: Tokens,
    pub signups_by_week: Vec<console::WeekCount>,
}

pub async fn overview(pool: &PgPool) -> Result<Overview> {
    let counts = console::overview_counts(pool).await.map_err(internal)?;
    let signups_by_week = console::signups_by_week(pool).await.map_err(internal)?;
    Ok(Overview {
        users: UserCounts {
            total: counts.users_total,
            new_7d: counts.users_new_7d,
        },
        workspaces: WorkspaceStatusCounts {
            total: counts.workspaces_total,
            active: counts.workspaces_active,
            suspended: counts.workspaces_suspended,
            deleted: counts.workspaces_deleted,
        },
        feedback_open: counts.feedback_open,
        tokens_month: Tokens {
            input: counts.tokens_month_input,
            output: counts.tokens_month_output,
        },
        signups_by_week,
    })
}

#[derive(Debug, Default, Serialize)]
pub struct UsageTotals {
    pub input: i64,
    pub output: i64,
    pub calls: i64,
}

#[derive(Debug, Serialize)]
pub struct WorkspaceUsage {
    pub workspace_id: Option<String>,
    pub workspace_name: Option<String>,
    pub input: i64,
    pub output: i64,
    pub calls: i64,
}

#[derive(Debug, Serialize)]
pub struct ModelUsage {
    pub model: Option<String>,
    pub input: i64,
    pub output: i64,
    pub calls: i64,
}

#[derive(Debug, Serialize)]
pub struct FeatureUsage {
    pub feature: Option<String>,
    pub input: i64,
    pub output: i64,
    pub calls: i64,
}

/// Tokens in one calendar month, UTC (CSL-9). Counts, never money.
#[derive(Debug, Serialize)]
pub struct UsageReport {
    pub month: String,
    pub totals: UsageTotals,
    pub by_workspace: Vec<WorkspaceUsage>,
    pub by_model: Vec<ModelUsage>,
    pub by_feature: Vec<FeatureUsage>,
}

/// `month` is the first day of the month, UTC.
pub async fn usage(pool: &PgPool, month: chrono::NaiveDate) -> Result<UsageReport> {
    use console::UsageBy;
    let from = month.and_hms_opt(0, 0, 0).expect("midnight").and_utc();
    let to = month
        .checked_add_months(chrono::Months::new(1))
        .expect("a month after a valid month")
        .and_hms_opt(0, 0, 0)
        .expect("midnight")
        .and_utc();

    let by_feature = console::usage_grouped(pool, UsageBy::Feature, from, to)
        .await
        .map_err(internal)?;
    // Every call has exactly one feature, so these rows sum to the month.
    let totals = by_feature
        .iter()
        .fold(UsageTotals::default(), |sum, row| UsageTotals {
            input: sum.input + row.input,
            output: sum.output + row.output,
            calls: sum.calls + row.calls,
        });
    let by_workspace = console::usage_grouped(pool, UsageBy::Workspace, from, to)
        .await
        .map_err(internal)?;
    let by_model = console::usage_grouped(pool, UsageBy::Model, from, to)
        .await
        .map_err(internal)?;

    Ok(UsageReport {
        month: month.format("%Y-%m").to_string(),
        totals,
        by_workspace: by_workspace
            .into_iter()
            .map(|row| WorkspaceUsage {
                workspace_id: row.key,
                workspace_name: row.label,
                input: row.input,
                output: row.output,
                calls: row.calls,
            })
            .collect(),
        by_model: by_model
            .into_iter()
            .map(|row| ModelUsage {
                model: row.key,
                input: row.input,
                output: row.output,
                calls: row.calls,
            })
            .collect(),
        by_feature: by_feature
            .into_iter()
            .map(|row| FeatureUsage {
                feature: row.key,
                input: row.input,
                output: row.output,
                calls: row.calls,
            })
            .collect(),
    })
}

#[derive(Debug, Serialize)]
pub struct Health {
    pub receipt_jobs: console::ReceiptJobCounts,
    pub ai_calls_by_day: Vec<console::DayUsage>,
}

pub async fn health(pool: &PgPool) -> Result<Health> {
    Ok(Health {
        receipt_jobs: console::receipt_job_counts(pool).await.map_err(internal)?,
        ai_calls_by_day: console::ai_calls_by_day(pool).await.map_err(internal)?,
    })
}
