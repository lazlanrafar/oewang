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
