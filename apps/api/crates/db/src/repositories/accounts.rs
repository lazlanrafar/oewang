//! Users, workspaces, memberships and the two token tables.
//!
//! Repositories make no decisions and do not log. Every method takes an
//! `impl PgExecutor`, so the same method works inside a service's
//! transaction and outside one; that is what lets a service compose several
//! writes atomically without a second set of methods.
//!
//! See docs/best-practices/rust-api.md#database.

use chrono::{DateTime, Utc};
use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRow {
    pub id: String,
    pub email: String,
    pub name: Option<String>,
    pub profile_picture: Option<String>,
    /// `#rrggbb`, or `None` for the product's default (D100).
    pub income_color: Option<String>,
    pub expense_color: Option<String>,
    pub created_at: DateTime<Utc>,
}

/// Carries the hash, so it is a separate type from `UserRow`.
///
/// `UserRow` has no password field at all, which means it cannot leak into a
/// response by accident; this one never leaves the auth service.
#[derive(Debug, sqlx::FromRow)]
pub struct UserCredentials {
    pub id: String,
    pub password_hash: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkspaceRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub country: Option<String>,
    pub currency_code: String,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MembershipRow {
    pub workspace_id: String,
    pub user_id: String,
    pub role: String,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MemberRow {
    pub user_id: String,
    pub email: String,
    pub name: Option<String>,
    pub role: String,
    pub joined_at: DateTime<Utc>,
}

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WorkspaceMembershipRow {
    pub id: String,
    pub name: String,
    pub slug: String,
    pub currency_code: String,
    pub role: String,
}

// ------------------------------------------------------------------- users

pub async fn insert_user(
    executor: impl PgExecutor<'_>,
    id: &str,
    email: &str,
    name: Option<&str>,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO users (id, email, name, password_hash) VALUES ($1, $2, $3, $4)"#,
        id,
        email,
        name,
        password_hash
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn email_exists(executor: impl PgExecutor<'_>, email: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(SELECT 1 FROM users WHERE lower(email) = lower($1)) AS "exists!""#,
        email
    )
    .fetch_one(executor)
    .await
}

pub async fn find_credentials_by_email(
    executor: impl PgExecutor<'_>,
    email: &str,
) -> Result<Option<UserCredentials>, sqlx::Error> {
    sqlx::query_as!(
        UserCredentials,
        r#"SELECT id, password_hash FROM users WHERE lower(email) = lower($1)"#,
        email
    )
    .fetch_optional(executor)
    .await
}

pub async fn find_credentials_by_id(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Option<UserCredentials>, sqlx::Error> {
    sqlx::query_as!(
        UserCredentials,
        r#"SELECT id, password_hash FROM users WHERE id = $1"#,
        user_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn find_user_by_id(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        r#"SELECT id, email, name, profile_picture, income_color, expense_color, created_at
           FROM users WHERE id = $1"#,
        user_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn find_user_id_by_email(
    executor: impl PgExecutor<'_>,
    email: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT id FROM users WHERE lower(email) = lower($1)"#,
        email
    )
    .fetch_optional(executor)
    .await
}

pub async fn update_password(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    password_hash: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE users SET password_hash = $2, updated_at = now() WHERE id = $1"#,
        user_id,
        password_hash
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Rename a user. The name is a label; `None` clears it.
pub async fn update_user_name(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    name: Option<&str>,
) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        r#"UPDATE users SET name = $2, updated_at = now() WHERE id = $1
           RETURNING id, email, name, profile_picture, income_color, expense_color, created_at"#,
        user_id,
        name
    )
    .fetch_optional(executor)
    .await
}

/// Set both colours at once; `None` puts one back to the default (D100).
pub async fn update_user_colors(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    income_color: Option<&str>,
    expense_color: Option<&str>,
) -> Result<Option<UserRow>, sqlx::Error> {
    sqlx::query_as!(
        UserRow,
        r#"UPDATE users SET income_color = $2, expense_color = $3, updated_at = now()
           WHERE id = $1
           RETURNING id, email, name, profile_picture, income_color, expense_color, created_at"#,
        user_id,
        income_color,
        expense_color
    )
    .fetch_optional(executor)
    .await
}

/// Record which stored photo is current, or that there is none (D94). The
/// value is a version id, never a path or a URL.
pub async fn set_profile_picture(
    executor: impl PgExecutor<'_>,
    user_id: &str,
    version: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE users SET profile_picture = $2, updated_at = now() WHERE id = $1"#,
        user_id,
        version
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// How many live workspaces this user owns (WS-6).
pub async fn count_owned_workspaces(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!"
           FROM user_workspaces m
           JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.user_id = $1 AND m.role = 'owner'
             AND m.deleted_at IS NULL AND w.deleted_at IS NULL"#,
        user_id
    )
    .fetch_one(executor)
    .await
}

// -------------------------------------------------------------- workspaces

pub async fn insert_workspace(
    executor: impl PgExecutor<'_>,
    id: &str,
    name: &str,
    slug: &str,
    currency_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO workspaces (id, name, slug, currency_code) VALUES ($1, $2, $3, $4)"#,
        id,
        name,
        slug,
        currency_code
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn slug_exists(executor: impl PgExecutor<'_>, slug: &str) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
             SELECT 1 FROM workspaces WHERE slug = $1 AND deleted_at IS NULL
           ) AS "exists!""#,
        slug
    )
    .fetch_one(executor)
    .await
}

/// Is the slug taken by some other live workspace?
///
/// Excludes `except_id` so renaming a workspace to a name that slugifies to
/// its current slug is not a collision with itself.
pub async fn slug_taken_by_other(
    executor: impl PgExecutor<'_>,
    slug: &str,
    except_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
             SELECT 1 FROM workspaces
             WHERE slug = $1 AND id <> $2 AND deleted_at IS NULL
           ) AS "exists!""#,
        slug,
        except_id
    )
    .fetch_one(executor)
    .await
}

pub async fn find_workspace(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Option<WorkspaceRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkspaceRow,
        r#"SELECT id, name, slug, country, currency_code, created_at
           FROM workspaces
           WHERE id = $1 AND deleted_at IS NULL"#,
        workspace_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn update_workspace(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    name: Option<&str>,
    slug: Option<&str>,
    country: Option<&str>,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspaces
           SET name = COALESCE($2, name),
               slug = COALESCE($3, slug),
               country = COALESCE($4, country),
               updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL"#,
        workspace_id,
        name,
        slug,
        country
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Move the workspace currency.
///
/// Separate from `update_workspace` because it is the only field with a lock
/// in front of it (WAL-6): a service checks for transactions first, and a
/// caller that reached this method has already passed that check.
pub async fn update_workspace_currency(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    currency_code: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspaces SET currency_code = $2, updated_at = now()
           WHERE id = $1 AND deleted_at IS NULL"#,
        workspace_id,
        currency_code
    )
    .execute(executor)
    .await
    .map(|_| ())
}

pub async fn soft_delete_workspace(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"UPDATE workspaces SET deleted_at = now() WHERE id = $1 AND deleted_at IS NULL"#,
        workspace_id
    )
    .execute(executor)
    .await
    .map(|_| ())
}

// ------------------------------------------------------------- memberships

pub async fn insert_membership(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), sqlx::Error> {
    // A user removed and re-invited has a soft-deleted row, and the unique
    // index covers deleted rows too, so revive rather than insert a second.
    sqlx::query!(
        r#"INSERT INTO user_workspaces (id, workspace_id, user_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL, joined_at = now()"#,
        id,
        workspace_id,
        user_id,
        role
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Join a workspace through an invitation.
///
/// Unlike `insert_membership`, a live membership is left exactly as it is:
/// accepting a member invite must never demote an owner. Only a row the user
/// left (soft-deleted) is revived, with the invitation's role.
pub async fn join_membership(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO user_workspaces (id, workspace_id, user_id, role)
           VALUES ($1, $2, $3, $4)
           ON CONFLICT (workspace_id, user_id)
           DO UPDATE SET role = EXCLUDED.role, deleted_at = NULL, joined_at = now()
           WHERE user_workspaces.deleted_at IS NOT NULL"#,
        id,
        workspace_id,
        user_id,
        role
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Whether this email already belongs to a live member.
pub async fn email_is_member(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    email: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (
             SELECT 1 FROM user_workspaces m
             JOIN users u ON u.id = m.user_id
             WHERE m.workspace_id = $1 AND m.deleted_at IS NULL
               AND lower(u.email) = lower($2)
           ) AS "exists!""#,
        workspace_id,
        email
    )
    .fetch_one(executor)
    .await
}

/// The lookup every authenticated write performs, which is why the index is
/// led by `user_id` rather than `workspace_id`.
pub async fn find_membership(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<Option<MembershipRow>, sqlx::Error> {
    sqlx::query_as!(
        MembershipRow,
        r#"SELECT workspace_id, user_id, role
           FROM user_workspaces
           WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        user_id
    )
    .fetch_optional(executor)
    .await
}

pub async fn list_workspaces_for_user(
    executor: impl PgExecutor<'_>,
    user_id: &str,
) -> Result<Vec<WorkspaceMembershipRow>, sqlx::Error> {
    sqlx::query_as!(
        WorkspaceMembershipRow,
        r#"SELECT w.id, w.name, w.slug, w.currency_code, m.role
           FROM user_workspaces m
           JOIN workspaces w ON w.id = m.workspace_id
           WHERE m.user_id = $1 AND m.deleted_at IS NULL AND w.deleted_at IS NULL
           ORDER BY m.joined_at"#,
        user_id
    )
    .fetch_all(executor)
    .await
}

pub async fn list_members(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<MemberRow>, sqlx::Error> {
    sqlx::query_as!(
        MemberRow,
        r#"SELECT m.user_id, u.email, u.name, m.role, m.joined_at
           FROM user_workspaces m
           JOIN users u ON u.id = m.user_id
           WHERE m.workspace_id = $1 AND m.deleted_at IS NULL
           ORDER BY m.joined_at"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

/// The live owners of a workspace, with their rows locked.
///
/// Returns ids rather than a count because Postgres refuses `FOR UPDATE`
/// alongside an aggregate, and the lock is the point: two concurrent
/// demotions serialize here, so they cannot each see two owners and both
/// proceed to leave zero (WS-4).
pub async fn lock_owners(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT user_id
           FROM user_workspaces
           WHERE workspace_id = $1 AND role = 'owner' AND deleted_at IS NULL
           FOR UPDATE"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn update_membership_role(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
    role: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE user_workspaces SET role = $3
           WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        user_id,
        role
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn soft_delete_membership(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    user_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE user_workspaces SET deleted_at = now()
           WHERE workspace_id = $1 AND user_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        user_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
