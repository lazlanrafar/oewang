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
