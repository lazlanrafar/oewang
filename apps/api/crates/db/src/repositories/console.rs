//! The operator console (CSL). Reads across workspaces by design, so these
//! queries filter by `deleted_at` but not by `workspace_id`
//! (docs/data-model.md#console_roles).

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgExecutor, QueryBuilder};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OperatorRow {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role_id: String,
    pub role_name: String,
    /// Keys as stored; the service parses them.
    pub permissions: Vec<String>,
}

/// The user's console role and its permissions, or none when they are not
/// an operator or their role was deleted.
pub async fn find_operator(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Option<OperatorRow>, sqlx::Error> {
    sqlx::query_as!(
        OperatorRow,
        r#"SELECT u.id AS user_id, u.email, u.name,
                  r.id AS role_id, r.name AS role_name,
                  COALESCE(
                      array_agg(p.permission ORDER BY p.permission)
                          FILTER (WHERE p.permission IS NOT NULL),
                      '{}'
                  ) AS "permissions!"
           FROM users u
           JOIN console_roles r ON r.id = u.console_role_id AND r.deleted_at IS NULL
           LEFT JOIN console_role_permissions p ON p.role_id = r.id
           WHERE u.id = $1
           GROUP BY u.id, r.id"#,
        user_id
    )
    .fetch_optional(executor)
    .await
}

// ------------------------------------------------------------------ users

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum UserSort {
    CreatedAt,
    Email,
}

/// A user as the console lists them (CSL-3). Metadata only (CSL-13).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ConsoleUserRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub created_at: DateTime<Utc>,
    /// The console role's name, when the user is an operator.
    pub console_role: Option<String>,
    /// Live memberships of live workspaces.
    pub workspaces: i64,
    /// The last time a session was opened or refreshed.
    pub last_active_at: Option<DateTime<Utc>>,
}

const USER_SELECT: &str = "SELECT u.id, u.email, u.name, u.created_at, r.name AS console_role,
        (SELECT count(*) FROM user_workspaces m
           JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
          WHERE m.user_id = u.id AND m.deleted_at IS NULL) AS workspaces,
        (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id) AS last_active_at
   FROM users u
   LEFT JOIN console_roles r ON r.id = u.console_role_id AND r.deleted_at IS NULL
  WHERE true";

fn push_user_search(builder: &mut QueryBuilder<sqlx::Postgres>, search: Option<&str>) {
    if let Some(search) = search {
        let pattern = super::contains_pattern(search);
        builder
            .push(" AND (u.email ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR u.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

pub async fn list_users(
    executor: impl PgExecutor<'_>,
    search: Option<&str>,
    sort: UserSort,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConsoleUserRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(USER_SELECT);
    push_user_search(&mut builder, search);
    let direction = if descending { "DESC" } else { "ASC" };
    builder.push(match sort {
        UserSort::CreatedAt => format!(" ORDER BY u.created_at {direction}, u.id"),
        UserSort::Email => format!(" ORDER BY lower(u.email) {direction}, u.id"),
    });
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);
    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_users(
    executor: impl PgExecutor<'_>,
    search: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM users u WHERE true");
    push_user_search(&mut builder, search);
    builder.build_query_scalar().fetch_one(executor).await
}

pub async fn find_user(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<ConsoleUserRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(USER_SELECT);
    builder.push(" AND u.id = ").push_bind(id.to_string());
    builder.build_query_as().fetch_optional(executor).await
}

/// A user's live memberships, deleted workspaces included so a support
/// question about one can be answered.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MembershipRow {
    pub workspace_id: String,
    pub workspace_name: String,
    pub role: String,
    pub joined_at: DateTime<Utc>,
    pub workspace_deleted_at: Option<DateTime<Utc>>,
}

pub async fn user_memberships(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Vec<MembershipRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT w.id AS workspace_id, w.name AS workspace_name, m.role, m.joined_at,
                w.deleted_at AS workspace_deleted_at
           FROM user_workspaces m
           JOIN workspaces w ON w.id = m.workspace_id
          WHERE m.user_id = $1 AND m.deleted_at IS NULL
          ORDER BY m.joined_at",
    )
    .bind(user_id)
    .fetch_all(executor)
    .await
}

// ------------------------------------------------------------- workspaces

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceSort {
    CreatedAt,
    Name,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum WorkspaceStatus {
    Active,
    Deleted,
}

/// A workspace as the console lists it (CSL-4). Metadata only (CSL-13).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ConsoleWorkspaceRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub currency_code: String,
    pub created_at: DateTime<Utc>,
    pub deleted_at: Option<DateTime<Utc>>,
    pub members: i64,
    /// The earliest live owner, the person a support question goes to.
    pub owner_email: Option<String>,
    pub last_activity_at: Option<DateTime<Utc>>,
}

// shortcut: last activity is a max over the workspace's audit rows, once
// per listed row; fine at today's scale, keep a column if the list slows.
const WORKSPACE_SELECT: &str =
    "SELECT w.id, w.name, w.slug, w.currency_code, w.created_at, w.deleted_at,
        (SELECT count(*) FROM user_workspaces m
          WHERE m.workspace_id = w.id AND m.deleted_at IS NULL) AS members,
        (SELECT u.email FROM user_workspaces m JOIN users u ON u.id = m.user_id
          WHERE m.workspace_id = w.id AND m.deleted_at IS NULL AND m.role = 'owner'
          ORDER BY m.joined_at LIMIT 1) AS owner_email,
        (SELECT max(a.created_at) FROM audit_logs a WHERE a.workspace_id = w.id) AS last_activity_at
   FROM workspaces w
  WHERE true";

fn push_workspace_filters(
    builder: &mut QueryBuilder<sqlx::Postgres>,
    search: Option<&str>,
    status: Option<WorkspaceStatus>,
) {
    if let Some(search) = search {
        let pattern = super::contains_pattern(search);
        builder
            .push(" AND (w.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.slug ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    match status {
        Some(WorkspaceStatus::Active) => {
            builder.push(" AND w.deleted_at IS NULL");
        }
        Some(WorkspaceStatus::Deleted) => {
            builder.push(" AND w.deleted_at IS NOT NULL");
        }
        None => {}
    }
}

pub async fn list_workspaces(
    executor: impl PgExecutor<'_>,
    search: Option<&str>,
    status: Option<WorkspaceStatus>,
    sort: WorkspaceSort,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConsoleWorkspaceRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(WORKSPACE_SELECT);
    push_workspace_filters(&mut builder, search, status);
    let direction = if descending { "DESC" } else { "ASC" };
    builder.push(match sort {
        WorkspaceSort::CreatedAt => format!(" ORDER BY w.created_at {direction}, w.id"),
        WorkspaceSort::Name => format!(" ORDER BY lower(w.name) {direction}, w.id"),
    });
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);
    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_workspaces(
    executor: impl PgExecutor<'_>,
    search: Option<&str>,
    status: Option<WorkspaceStatus>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM workspaces w WHERE true");
    push_workspace_filters(&mut builder, search, status);
    builder.build_query_scalar().fetch_one(executor).await
}

pub async fn find_workspace(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<ConsoleWorkspaceRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(WORKSPACE_SELECT);
    builder.push(" AND w.id = ").push_bind(id.to_string());
    builder.build_query_as().fetch_optional(executor).await
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct MemberRow {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

pub async fn workspace_members(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<MemberRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT u.id AS user_id, u.email, u.name, m.role, m.joined_at
           FROM user_workspaces m
           JOIN users u ON u.id = m.user_id
          WHERE m.workspace_id = $1 AND m.deleted_at IS NULL
          ORDER BY m.joined_at",
    )
    .bind(workspace_id)
    .fetch_all(executor)
    .await
}

/// How much a workspace holds, as counts: never what it holds (CSL-13).
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct WorkspaceCounts {
    pub wallets: i64,
    pub transactions: i64,
}

pub async fn workspace_counts(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<WorkspaceCounts, sqlx::Error> {
    sqlx::query_as(
        "SELECT (SELECT count(*) FROM wallets
                  WHERE workspace_id = $1 AND deleted_at IS NULL) AS wallets,
                (SELECT count(*) FROM transactions
                  WHERE workspace_id = $1 AND deleted_at IS NULL) AS transactions",
    )
    .bind(workspace_id)
    .fetch_one(executor)
    .await
}
