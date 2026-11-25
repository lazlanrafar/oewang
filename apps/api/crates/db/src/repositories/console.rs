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
    /// Set while an operator has disabled the account (CSL-7).
    pub disabled_at: Option<DateTime<Utc>>,
    /// The console role's name, when the user is an operator.
    pub console_role: Option<String>,
    /// Live memberships of live workspaces.
    pub workspaces: i64,
    /// The last time a session was opened or refreshed.
    pub last_active_at: Option<DateTime<Utc>>,
}

const USER_SELECT: &str =
    "SELECT u.id, u.email, u.name, u.created_at, u.disabled_at, r.name AS console_role,
        (SELECT count(*) FROM user_workspaces m
           JOIN workspaces w ON w.id = m.workspace_id AND w.deleted_at IS NULL
          WHERE m.user_id = u.id AND m.deleted_at IS NULL) AS workspaces,
        (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id) AS last_active_at
   FROM users u
   LEFT JOIN console_roles r ON r.id = u.console_role_id AND r.deleted_at IS NULL
  WHERE true";

/// What a user list is narrowed to.
#[derive(Debug, Clone, Copy, Default)]
pub struct UserFilter<'a> {
    pub search: Option<&'a str>,
    /// `Some(true)` only disabled accounts, `Some(false)` only enabled ones.
    pub disabled: Option<bool>,
    /// `Some(true)` only operators, `Some(false)` only everyone else.
    pub operator: Option<bool>,
}

fn push_user_search(builder: &mut QueryBuilder<sqlx::Postgres>, filter: UserFilter<'_>) {
    match filter.disabled {
        Some(true) => {
            builder.push(" AND u.disabled_at IS NOT NULL");
        }
        Some(false) => {
            builder.push(" AND u.disabled_at IS NULL");
        }
        None => {}
    }
    match filter.operator {
        Some(true) => {
            builder.push(" AND u.console_role_id IS NOT NULL");
        }
        Some(false) => {
            builder.push(" AND u.console_role_id IS NULL");
        }
        None => {}
    }
    if let Some(search) = filter.search {
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
    filter: UserFilter<'_>,
    sort: UserSort,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConsoleUserRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(USER_SELECT);
    push_user_search(&mut builder, filter);
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
    filter: UserFilter<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM users u WHERE true");
    push_user_search(&mut builder, filter);
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
    /// Neither deleted nor suspended.
    Active,
    Suspended,
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
    /// Set while an operator has suspended the workspace (CSL-5).
    pub suspended_at: Option<DateTime<Utc>>,
    pub members: i64,
    /// The earliest live owner, the person a support question goes to.
    pub owner_email: Option<String>,
    pub last_activity_at: Option<DateTime<Utc>>,
}

// shortcut: last activity is a max over the workspace's audit rows, once
// per listed row; fine at today's scale, keep a column if the list slows.
const WORKSPACE_SELECT: &str =
    "SELECT w.id, w.name, w.slug, w.currency_code, w.created_at, w.deleted_at, w.suspended_at,
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
            builder.push(" AND w.deleted_at IS NULL AND w.suspended_at IS NULL");
        }
        Some(WorkspaceStatus::Suspended) => {
            builder.push(" AND w.deleted_at IS NULL AND w.suspended_at IS NOT NULL");
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

// ---------------------------------------------------------------- actions

/// Lock the workspace row for an operator action:
/// `(deleted_at, suspended_at)`, none when it does not exist.
pub async fn lock_workspace(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<(Option<DateTime<Utc>>, Option<DateTime<Utc>>)>, sqlx::Error> {
    sqlx::query_as("SELECT deleted_at, suspended_at FROM workspaces WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(executor)
        .await
}

pub async fn set_workspace_suspended(
    executor: impl PgExecutor<'_>,
    id: &str,
    suspended: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE workspaces
            SET suspended_at = CASE WHEN $2 THEN now() END, updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(suspended)
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn restore_workspace(executor: impl PgExecutor<'_>, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE workspaces SET deleted_at = NULL, updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(executor)
        .await
        .map(|_| ())
}

/// Lock the user row: `(disabled_at, console_role_id)`, none when unknown.
pub async fn lock_user(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<(Option<DateTime<Utc>>, Option<String>)>, sqlx::Error> {
    sqlx::query_as("SELECT disabled_at, console_role_id FROM users WHERE id = $1 FOR UPDATE")
        .bind(id)
        .fetch_optional(executor)
        .await
}

pub async fn set_user_disabled(
    executor: impl PgExecutor<'_>,
    id: &str,
    disabled: bool,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE users
            SET disabled_at = CASE WHEN $2 THEN now() END, updated_at = now()
          WHERE id = $1",
    )
    .bind(id)
    .bind(disabled)
    .execute(executor)
    .await
    .map(|_| ())
}

pub struct OperatorAuditEntry<'a> {
    pub operator_id: &'a str,
    pub action: &'a str,
    pub entity: &'a str,
    pub entity_id: &'a str,
    pub before: Option<serde_json::Value>,
    pub after: Option<serde_json::Value>,
}

/// One row of the console's own audit trail (CSL-14).
pub async fn insert_operator_audit(
    executor: impl PgExecutor<'_>,
    entry: OperatorAuditEntry<'_>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "INSERT INTO operator_audit (id, operator_id, action, entity, entity_id, before, after)
         VALUES ($1, $2, $3, $4, $5, $6, $7)",
    )
    .bind(cuid2::create_id())
    .bind(entry.operator_id)
    .bind(entry.action)
    .bind(entry.entity)
    .bind(entry.entity_id)
    .bind(entry.before)
    .bind(entry.after)
    .execute(executor)
    .await
    .map(|_| ())
}

// --------------------------------------------------------------- feedback

/// Feedback as the console lists it (CSL-8). The message is what the person
/// chose to send to oewang, so it is shown in full.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ConsoleFeedbackRow {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub message: String,
    pub status: String,
    pub operator_note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub resolved_at: Option<DateTime<Utc>>,
    pub user_id: String,
    pub user_email: String,
    pub workspace_id: String,
    pub workspace_name: String,
}

const FEEDBACK_SELECT: &str = "SELECT f.id, f.type AS kind, f.message, f.status, f.operator_note,
        f.created_at, f.resolved_at, f.user_id, u.email AS user_email,
        f.workspace_id, w.name AS workspace_name
   FROM feedback f
   JOIN users u ON u.id = f.user_id
   JOIN workspaces w ON w.id = f.workspace_id
  WHERE f.deleted_at IS NULL";

pub struct FeedbackFilter<'a> {
    pub search: Option<&'a str>,
    pub status: Option<&'a str>,
    pub kind: Option<&'a str>,
}

fn push_feedback_filters(builder: &mut QueryBuilder<sqlx::Postgres>, filter: &FeedbackFilter<'_>) {
    if let Some(search) = filter.search {
        let pattern = super::contains_pattern(search);
        builder
            .push(" AND (f.message ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR u.email ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR w.name ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(status) = filter.status {
        builder
            .push(" AND f.status = ")
            .push_bind(status.to_string());
    }
    if let Some(kind) = filter.kind {
        builder.push(" AND f.type = ").push_bind(kind.to_string());
    }
}

pub async fn list_feedback(
    executor: impl PgExecutor<'_>,
    filter: &FeedbackFilter<'_>,
    limit: i64,
    offset: i64,
) -> Result<Vec<ConsoleFeedbackRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(FEEDBACK_SELECT);
    push_feedback_filters(&mut builder, filter);
    builder.push(" ORDER BY f.created_at DESC, f.id");
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);
    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_feedback(
    executor: impl PgExecutor<'_>,
    filter: &FeedbackFilter<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "SELECT count(*) FROM feedback f
           JOIN users u ON u.id = f.user_id
           JOIN workspaces w ON w.id = f.workspace_id
          WHERE f.deleted_at IS NULL",
    );
    push_feedback_filters(&mut builder, filter);
    builder.build_query_scalar().fetch_one(executor).await
}

pub async fn find_feedback(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<ConsoleFeedbackRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(FEEDBACK_SELECT);
    builder.push(" AND f.id = ").push_bind(id.to_string());
    builder.build_query_as().fetch_optional(executor).await
}

/// Lock a live feedback row; false when there is none.
pub async fn lock_feedback(executor: impl PgExecutor<'_>, id: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT id FROM feedback WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(executor)
    .await
    .map(|row| row.is_some())
}

/// Set the status and note. `resolved_at` is when it first became done, and
/// clears when it is reopened.
pub async fn update_feedback(
    executor: impl PgExecutor<'_>,
    id: &str,
    status: &str,
    note: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE feedback
            SET status = $2,
                operator_note = $3,
                resolved_at = CASE WHEN $2 = 'done' THEN COALESCE(resolved_at, now()) END
          WHERE id = $1",
    )
    .bind(id)
    .bind(status)
    .bind(note)
    .execute(executor)
    .await
    .map(|_| ())
}

// ---------------------------------------------------- overview and usage

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OverviewCounts {
    pub users_total: i64,
    pub users_new_7d: i64,
    pub workspaces_total: i64,
    pub workspaces_active: i64,
    pub workspaces_suspended: i64,
    pub workspaces_deleted: i64,
    pub feedback_open: i64,
    pub tokens_month_input: i64,
    pub tokens_month_output: i64,
}

pub async fn overview_counts(executor: impl PgExecutor<'_>) -> Result<OverviewCounts, sqlx::Error> {
    sqlx::query_as(
        "SELECT
           (SELECT count(*) FROM users) AS users_total,
           (SELECT count(*) FROM users WHERE created_at >= now() - interval '7 days') AS users_new_7d,
           (SELECT count(*) FROM workspaces) AS workspaces_total,
           (SELECT count(*) FROM workspaces
             WHERE deleted_at IS NULL AND suspended_at IS NULL) AS workspaces_active,
           (SELECT count(*) FROM workspaces
             WHERE deleted_at IS NULL AND suspended_at IS NOT NULL) AS workspaces_suspended,
           (SELECT count(*) FROM workspaces WHERE deleted_at IS NOT NULL) AS workspaces_deleted,
           (SELECT count(*) FROM feedback
             WHERE deleted_at IS NULL AND status = 'open') AS feedback_open,
           (SELECT COALESCE(sum(input_tokens), 0)::bigint FROM ai_usage
             WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
             AS tokens_month_input,
           (SELECT COALESCE(sum(output_tokens), 0)::bigint FROM ai_usage
             WHERE created_at >= date_trunc('month', now() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC')
             AS tokens_month_output",
    )
    .fetch_one(executor)
    .await
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct WeekCount {
    pub week_start: chrono::NaiveDate,
    pub count: i64,
}

/// Sign-ups per ISO week (UTC), the last twelve, empty weeks included.
pub async fn signups_by_week(executor: impl PgExecutor<'_>) -> Result<Vec<WeekCount>, sqlx::Error> {
    sqlx::query_as(
        "SELECT week::date AS week_start, count(u.id) AS count
           FROM generate_series(
                  date_trunc('week', now() AT TIME ZONE 'UTC') - interval '11 weeks',
                  date_trunc('week', now() AT TIME ZONE 'UTC'),
                  interval '1 week') AS week
           LEFT JOIN users u
             ON u.created_at AT TIME ZONE 'UTC' >= week
            AND u.created_at AT TIME ZONE 'UTC' < week + interval '1 week'
          GROUP BY week
          ORDER BY week",
    )
    .fetch_all(executor)
    .await
}

/// Token use grouped one way, within `[from, to)`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct UsageGroup {
    pub key: Option<String>,
    pub label: Option<String>,
    pub input: i64,
    pub output: i64,
    pub calls: i64,
}

#[derive(Debug, Clone, Copy)]
pub enum UsageBy {
    Workspace,
    Model,
    Feature,
}

pub async fn usage_grouped(
    executor: impl PgExecutor<'_>,
    by: UsageBy,
    from: DateTime<Utc>,
    to: DateTime<Utc>,
) -> Result<Vec<UsageGroup>, sqlx::Error> {
    let (key, label, join, limit) = match by {
        UsageBy::Workspace => (
            "a.workspace_id",
            "w.name",
            " JOIN workspaces w ON w.id = a.workspace_id",
            " LIMIT 50",
        ),
        UsageBy::Model => ("a.model", "a.model", "", ""),
        UsageBy::Feature => ("a.feature", "a.feature", "", ""),
    };
    let sql = format!(
        "SELECT {key} AS key, {label} AS label,
                COALESCE(sum(a.input_tokens), 0)::bigint AS input,
                COALESCE(sum(a.output_tokens), 0)::bigint AS output,
                count(*) AS calls
           FROM ai_usage a{join}
          WHERE a.created_at >= $1 AND a.created_at < $2
          GROUP BY {key}, {label}
          ORDER BY sum(a.input_tokens) + sum(a.output_tokens) DESC, {key}{limit}"
    );
    // Safe: every piece formatted in comes from the `match` above, static
    // strings chosen by an enum; the dates are bound.
    sqlx::query_as(sqlx::AssertSqlSafe(sql))
        .bind(from)
        .bind(to)
        .fetch_all(executor)
        .await
}

// ---------------------------------------------------------------- health

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ReceiptJobCounts {
    pub pending: i64,
    pub failed_24h: i64,
    pub failed_7d: i64,
}

pub async fn receipt_job_counts(
    executor: impl PgExecutor<'_>,
) -> Result<ReceiptJobCounts, sqlx::Error> {
    sqlx::query_as(
        "SELECT
           count(*) FILTER (WHERE status IN ('pending', 'processing')) AS pending,
           count(*) FILTER (WHERE status = 'failed'
                              AND updated_at >= now() - interval '24 hours') AS failed_24h,
           count(*) FILTER (WHERE status = 'failed'
                              AND updated_at >= now() - interval '7 days') AS failed_7d
           FROM receipt_jobs",
    )
    .fetch_one(executor)
    .await
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DayUsage {
    pub day: chrono::NaiveDate,
    pub calls: i64,
    pub input: i64,
    pub output: i64,
}

/// Model calls per UTC day, the last fourteen, empty days included.
pub async fn ai_calls_by_day(executor: impl PgExecutor<'_>) -> Result<Vec<DayUsage>, sqlx::Error> {
    sqlx::query_as(
        "SELECT day::date AS day, count(a.id) AS calls,
                COALESCE(sum(a.input_tokens), 0)::bigint AS input,
                COALESCE(sum(a.output_tokens), 0)::bigint AS output
           FROM generate_series(
                  date_trunc('day', now() AT TIME ZONE 'UTC') - interval '13 days',
                  date_trunc('day', now() AT TIME ZONE 'UTC'),
                  interval '1 day') AS day
           LEFT JOIN ai_usage a
             ON a.created_at AT TIME ZONE 'UTC' >= day
            AND a.created_at AT TIME ZONE 'UTC' < day + interval '1 day'
          GROUP BY day
          ORDER BY day",
    )
    .fetch_all(executor)
    .await
}

// ------------------------------------------------------ roles, operators

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct RoleRow {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub is_system: bool,
    pub permissions: Vec<String>,
    /// How many people hold it.
    pub operators: i64,
    pub created_at: DateTime<Utc>,
}

const ROLE_SELECT: &str = "SELECT r.id, r.name, r.description, r.is_system,
        COALESCE((SELECT array_agg(p.permission ORDER BY p.permission)
                    FROM console_role_permissions p WHERE p.role_id = r.id), '{}') AS permissions,
        (SELECT count(*) FROM users u WHERE u.console_role_id = r.id) AS operators,
        r.created_at
   FROM console_roles r
  WHERE r.deleted_at IS NULL";

pub async fn list_roles(executor: impl PgExecutor<'_>) -> Result<Vec<RoleRow>, sqlx::Error> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!(
        "{ROLE_SELECT} ORDER BY r.is_system DESC, lower(r.name)"
    )))
    .fetch_all(executor)
    .await
}

pub async fn find_role(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<RoleRow>, sqlx::Error> {
    sqlx::query_as(sqlx::AssertSqlSafe(format!("{ROLE_SELECT} AND r.id = $1")))
        .bind(id)
        .fetch_optional(executor)
        .await
}

/// Lock a live role: `is_system`, none when it does not exist.
pub async fn lock_role(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<bool>, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT is_system FROM console_roles WHERE id = $1 AND deleted_at IS NULL FOR UPDATE",
    )
    .bind(id)
    .fetch_optional(executor)
    .await
}

/// True when a live role already has this name (case-insensitive).
pub async fn role_name_taken(
    executor: impl PgExecutor<'_>,
    name: &str,
    except_id: Option<&str>,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar(
        "SELECT EXISTS (SELECT 1 FROM console_roles
                         WHERE lower(name) = lower($1) AND deleted_at IS NULL
                           AND ($2::text IS NULL OR id <> $2))",
    )
    .bind(name)
    .bind(except_id)
    .fetch_one(executor)
    .await
}

pub async fn insert_role(
    executor: impl PgExecutor<'_>,
    id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("INSERT INTO console_roles (id, name, description) VALUES ($1, $2, $3)")
        .bind(id)
        .bind(name)
        .bind(description)
        .execute(executor)
        .await
        .map(|_| ())
}

pub async fn update_role(
    executor: impl PgExecutor<'_>,
    id: &str,
    name: &str,
    description: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query(
        "UPDATE console_roles SET name = $2, description = $3, updated_at = now() WHERE id = $1",
    )
    .bind(id)
    .bind(name)
    .bind(description)
    .execute(executor)
    .await
    .map(|_| ())
}

/// Replace a role's permissions with this set.
pub async fn set_role_permissions(
    executor: &mut sqlx::PgConnection,
    id: &str,
    permissions: &[String],
) -> Result<(), sqlx::Error> {
    sqlx::query("DELETE FROM console_role_permissions WHERE role_id = $1")
        .bind(id)
        .execute(&mut *executor)
        .await?;
    sqlx::query(
        "INSERT INTO console_role_permissions (role_id, permission)
         SELECT $1, unnest($2::text[])",
    )
    .bind(id)
    .bind(permissions)
    .execute(&mut *executor)
    .await
    .map(|_| ())
}

pub async fn soft_delete_role(executor: impl PgExecutor<'_>, id: &str) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE console_roles SET deleted_at = now(), updated_at = now() WHERE id = $1")
        .bind(id)
        .execute(executor)
        .await
        .map(|_| ())
}

pub async fn role_holders(
    executor: impl PgExecutor<'_>,
    role_id: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM users WHERE console_role_id = $1")
        .bind(role_id)
        .fetch_one(executor)
        .await
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct OperatorListRow {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role_id: String,
    pub role_name: String,
    pub last_active_at: Option<DateTime<Utc>>,
}

pub async fn list_operators(
    executor: impl PgExecutor<'_>,
) -> Result<Vec<OperatorListRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT u.id AS user_id, u.email, u.name, r.id AS role_id, r.name AS role_name,
                (SELECT max(t.created_at) FROM refresh_tokens t WHERE t.user_id = u.id)
                  AS last_active_at
           FROM users u
           JOIN console_roles r ON r.id = u.console_role_id
          ORDER BY lower(u.email)",
    )
    .fetch_all(executor)
    .await
}

/// Lock a user for a role change: `(console_role_id, disabled)`.
pub async fn lock_operator(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Option<(Option<String>, bool)>, sqlx::Error> {
    sqlx::query_as(
        "SELECT console_role_id, disabled_at IS NOT NULL FROM users WHERE id = $1 FOR UPDATE",
    )
    .bind(user_id)
    .fetch_optional(executor)
    .await
}

pub async fn set_console_role(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    role_id: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query("UPDATE users SET console_role_id = $2, updated_at = now() WHERE id = $1")
        .bind(user_id)
        .bind(role_id)
        .execute(executor)
        .await
        .map(|_| ())
}

/// How many people hold the system owner role, the rows locked so two
/// revocations cannot both see a second owner.
pub async fn lock_owners(executor: impl PgExecutor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar::<_, String>(
        "SELECT id FROM users WHERE console_role_id = 'owner' ORDER BY id FOR UPDATE",
    )
    .fetch_all(executor)
    .await
    .map(|rows| rows.len() as i64)
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct OperatorAuditRow {
    pub id: String,
    pub operator_id: String,
    pub operator_email: String,
    pub action: String,
    pub entity: String,
    pub entity_id: String,
    pub before: Option<serde_json::Value>,
    pub after: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
}

pub async fn list_operator_audit(
    executor: impl PgExecutor<'_>,
    limit: i64,
    offset: i64,
) -> Result<Vec<OperatorAuditRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT a.id, a.operator_id, u.email AS operator_email, a.action, a.entity,
                a.entity_id, a.before, a.after, a.created_at
           FROM operator_audit a
           JOIN users u ON u.id = a.operator_id
          ORDER BY a.created_at DESC, a.id
          LIMIT $1 OFFSET $2",
    )
    .bind(limit)
    .bind(offset)
    .fetch_all(executor)
    .await
}

pub async fn count_operator_audit(executor: impl PgExecutor<'_>) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar("SELECT count(*) FROM operator_audit")
        .fetch_one(executor)
        .await
}

pub async fn find_operator_audit(
    executor: impl PgExecutor<'_>,
    id: &str,
) -> Result<Option<OperatorAuditRow>, sqlx::Error> {
    sqlx::query_as(
        "SELECT a.id, a.operator_id, u.email AS operator_email, a.action, a.entity,
                a.entity_id, a.before, a.after, a.created_at
           FROM operator_audit a
           JOIN users u ON u.id = a.operator_id
          WHERE a.id = $1",
    )
    .bind(id)
    .fetch_optional(executor)
    .await
}
