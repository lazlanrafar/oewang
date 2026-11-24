//! Contacts, the other side of a debt (CON-1 to CON-4, D120).

use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::{PgExecutor, QueryBuilder};

/// `Serialize` is for the audit snapshot.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct ContactRow {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A list or detail row with the counts the page and the detail sheet show.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ContactListRow {
    pub id: String,
    pub name: String,
    pub email: Option<String>,
    pub phone: Option<String>,
    pub note: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub debt_count: i64,
    pub open_debt_count: i64,
}

pub struct NewContact<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub name: &'a str,
    pub email: Option<&'a str>,
    pub phone: Option<&'a str>,
    pub note: Option<&'a str>,
}

/// `None` for a field leaves it alone; `Some(None)` clears it.
pub struct ContactPatch<'a> {
    pub name: Option<&'a str>,
    pub email: Option<Option<&'a str>>,
    pub phone: Option<Option<&'a str>>,
    pub note: Option<Option<&'a str>>,
}

const LIST_SELECT: &str = "SELECT c.id, c.name, c.email, c.phone, c.note, c.created_at, c.updated_at,
       (SELECT count(*) FROM debts d
         WHERE d.contact_id = c.id AND d.deleted_at IS NULL) AS debt_count,
       (SELECT count(*) FROM debts d
         WHERE d.contact_id = c.id AND d.deleted_at IS NULL AND d.status <> 'paid') AS open_debt_count
  FROM contacts c";

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ContactSort {
    Name,
    CreatedAt,
}

fn push_filters(
    builder: &mut QueryBuilder<sqlx::Postgres>,
    workspace_id: &str,
    search: Option<&str>,
) {
    builder
        .push(" WHERE c.workspace_id = ")
        .push_bind(workspace_id.to_string())
        .push(" AND c.deleted_at IS NULL");
    if let Some(search) = search {
        let pattern = super::contains_pattern(search);
        builder
            .push(" AND (c.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR c.email ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR c.phone ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
}

pub async fn list(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    search: Option<&str>,
    sort: ContactSort,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<ContactListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(LIST_SELECT);
    push_filters(&mut builder, workspace_id, search);
    let direction = if descending { "DESC" } else { "ASC" };
    builder.push(match sort {
        ContactSort::Name => format!(" ORDER BY lower(c.name) {direction}, c.id"),
        ContactSort::CreatedAt => format!(" ORDER BY c.created_at {direction}, c.id"),
    });
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);
    builder.build_query_as().fetch_all(executor).await
}

pub async fn count(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    search: Option<&str>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM contacts c");
    push_filters(&mut builder, workspace_id, search);
    builder.build_query_scalar().fetch_one(executor).await
}

pub async fn find_detail(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<ContactListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(LIST_SELECT);
    push_filters(&mut builder, workspace_id, None);
    builder.push(" AND c.id = ").push_bind(id.to_string());
    builder.build_query_as().fetch_optional(executor).await
}

pub async fn find(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<ContactRow>, sqlx::Error> {
    sqlx::query_as!(
        ContactRow,
        r#"SELECT id, name, email, phone, note, created_at, updated_at
           FROM contacts
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Live or deleted: what a repeated create answers (D114).
pub async fn find_with_deleted(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<ContactRow>, sqlx::Error> {
    sqlx::query_as!(
        ContactRow,
        r#"SELECT id, name, email, phone, note, created_at, updated_at
           FROM contacts
           WHERE workspace_id = $1 AND id = $2"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// The oldest live contact with this name, compared case-insensitively.
/// `name` arrives trimmed.
pub async fn find_by_name(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    name: &str,
) -> Result<Option<ContactRow>, sqlx::Error> {
    sqlx::query_as!(
        ContactRow,
        r#"SELECT id, name, email, phone, note, created_at, updated_at
           FROM contacts
           WHERE workspace_id = $1 AND lower(name) = lower($2) AND deleted_at IS NULL
           ORDER BY created_at, id
           LIMIT 1"#,
        workspace_id,
        name
    )
    .fetch_optional(executor)
    .await
}

/// `None` when the id is already taken (D114).
pub async fn insert(
    executor: impl PgExecutor<'_>,
    contact: NewContact<'_>,
) -> Result<Option<ContactRow>, sqlx::Error> {
    sqlx::query_as!(
        ContactRow,
        r#"INSERT INTO contacts (id, workspace_id, name, email, phone, note)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING
           RETURNING id, name, email, phone, note, created_at, updated_at"#,
        contact.id,
        contact.workspace_id,
        contact.name,
        contact.email,
        contact.phone,
        contact.note
    )
    .fetch_optional(executor)
    .await
}

/// `if_match` is checked by this statement under its own row lock (D115).
pub async fn update(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    patch: &ContactPatch<'_>,
    if_match: Option<DateTime<Utc>>,
) -> Result<Option<ContactRow>, sqlx::Error> {
    sqlx::query_as!(
        ContactRow,
        r#"UPDATE contacts
           SET name = COALESCE($3, name),
               email = CASE WHEN $4 THEN $5 ELSE email END,
               phone = CASE WHEN $6 THEN $7 ELSE phone END,
               note = CASE WHEN $8 THEN $9 ELSE note END,
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
             AND ($10::timestamptz IS NULL OR updated_at = $10)
           RETURNING id, name, email, phone, note, created_at, updated_at"#,
        workspace_id,
        id,
        patch.name,
        patch.email.is_some(),
        patch.email.flatten(),
        patch.phone.is_some(),
        patch.phone.flatten(),
        patch.note.is_some(),
        patch.note.flatten(),
        if_match
    )
    .fetch_optional(executor)
    .await
}

pub async fn soft_delete(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE contacts SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|done| done.rows_affected())
}
