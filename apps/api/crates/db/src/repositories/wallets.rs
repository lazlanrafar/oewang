//! Wallets and wallet groups.
//!
//! Repositories make no decisions and do not log. Every method takes
//! `workspace_id` and filters on it together with `deleted_at IS NULL`; the
//! two exceptions are marked and explained where they occur.
//!
//! See docs/best-practices/rust-api.md#database.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::PgExecutor;

/// `Serialize` is here for the audit snapshot a service writes beside every
/// mutation (D14). Responses are mapped to a view struct in the handler, so
/// the row shape is never the wire shape.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct WalletRow {
    pub id: String,
    pub group_id: Option<String>,
    pub name: String,
    pub currency_code: String,
    /// In this wallet's own currency (WAL-2). Never writable through a
    /// route: it moves only as a consequence of a transaction (TXN-3).
    pub balance: Decimal,
    pub is_included_in_totals: bool,
    pub is_default: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct WalletGroupRow {
    pub id: String,
    pub name: String,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A wallet with its group's name joined, which is what the list renders.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct WalletListRow {
    pub id: String,
    pub group_id: Option<String>,
    pub group_name: Option<String>,
    pub name: String,
    pub currency_code: String,
    pub balance: Decimal,
    pub is_included_in_totals: bool,
    pub is_default: bool,
    pub sort_order: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// What a create needs. A struct rather than nine positional arguments,
/// because two of them are strings that would transpose silently.
#[derive(Debug)]
pub struct NewWallet<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub group_id: Option<&'a str>,
    pub name: &'a str,
    pub currency_code: &'a str,
    pub is_included_in_totals: bool,
    pub sort_order: i32,
}

/// The fields a `PATCH` may move. `None` leaves a field alone; the nested
/// option on `group_id` is how "set it to null" is told apart from "do not
/// touch it".
#[derive(Debug, Default)]
pub struct WalletPatch<'a> {
    pub name: Option<&'a str>,
    pub group_id: Option<Option<&'a str>>,
    pub currency_code: Option<&'a str>,
    pub is_included_in_totals: Option<bool>,
    pub sort_order: Option<i32>,
}

// ---------------------------------------------------------- wallet groups

pub async fn list_groups(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<WalletGroupRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletGroupRow,
        r#"SELECT id, name, sort_order, created_at, updated_at
           FROM wallet_groups
           WHERE workspace_id = $1 AND deleted_at IS NULL
           ORDER BY sort_order, name"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn find_group(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<WalletGroupRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletGroupRow,
        r#"SELECT id, name, sort_order, created_at, updated_at
           FROM wallet_groups
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

pub async fn insert_group(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    name: &str,
    sort_order: i32,
) -> Result<WalletGroupRow, sqlx::Error> {
    sqlx::query_as!(
        WalletGroupRow,
        r#"INSERT INTO wallet_groups (id, workspace_id, name, sort_order)
           VALUES ($1, $2, $3, $4)
           RETURNING id, name, sort_order, created_at, updated_at"#,
        id,
        workspace_id,
        name,
        sort_order
    )
    .fetch_one(executor)
    .await
}

pub async fn update_group(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    name: Option<&str>,
    sort_order: Option<i32>,
) -> Result<Option<WalletGroupRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletGroupRow,
        r#"UPDATE wallet_groups
           SET name = COALESCE($3, name),
               sort_order = COALESCE($4, sort_order),
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, name, sort_order, created_at, updated_at"#,
        workspace_id,
        id,
        name,
        sort_order
    )
    .fetch_optional(executor)
    .await
}

pub async fn soft_delete_group(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE wallet_groups SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Detach the group's wallets. The wallets survive; only the grouping goes.
pub async fn clear_group_on_wallets(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    group_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE wallets SET group_id = NULL, updated_at = now()
           WHERE workspace_id = $1 AND group_id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        group_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

// ----------------------------------------------------------------- wallets

/// Ordered so a group's wallets are contiguous and ungrouped wallets come
/// last, which is the order the settings screen renders.
pub async fn list_wallets(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<WalletListRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletListRow,
        r#"SELECT w.id, w.group_id, g.name AS "group_name?", w.name, w.currency_code,
                  w.balance, w.is_included_in_totals, w.is_default, w.sort_order,
                  w.created_at, w.updated_at
           FROM wallets w
           LEFT JOIN wallet_groups g
             ON g.id = w.group_id AND g.deleted_at IS NULL
           WHERE w.workspace_id = $1 AND w.deleted_at IS NULL
           ORDER BY g.sort_order NULLS LAST, g.name NULLS LAST,
                    w.sort_order, w.name"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn find_wallet(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<WalletRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletRow,
        r#"SELECT id, group_id, name, currency_code, balance, is_included_in_totals,
                  is_default, sort_order, created_at, updated_at
           FROM wallets
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// The same read with the row locked.
///
/// A currency change and a transaction write both have to agree on whether
/// the wallet has transactions yet; locking the wallet row is what makes
/// them agree instead of racing (WAL-6, D13).
pub async fn lock_wallet(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<WalletRow>, sqlx::Error> {
    sqlx::query_as!(
        WalletRow,
        r#"SELECT id, group_id, name, currency_code, balance, is_included_in_totals,
                  is_default, sort_order, created_at, updated_at
           FROM wallets
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           FOR UPDATE"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Lock every live wallet in the workspace, in ascending ID order (D13).
///
/// Taken before moving the default flag, so two concurrent set-default calls
/// serialize here rather than both writing a default and tripping the
/// partial unique index.
pub async fn lock_wallets(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT id FROM wallets
           WHERE workspace_id = $1 AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn insert_wallet(
    executor: impl PgExecutor<'_>,
    wallet: NewWallet<'_>,
) -> Result<WalletRow, sqlx::Error> {
    sqlx::query_as!(
        WalletRow,
        r#"INSERT INTO wallets
             (id, workspace_id, group_id, name, currency_code, is_included_in_totals, sort_order)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           RETURNING id, group_id, name, currency_code, balance, is_included_in_totals,
                     is_default, sort_order, created_at, updated_at"#,
        wallet.id,
        wallet.workspace_id,
        wallet.group_id,
        wallet.name,
        wallet.currency_code,
        wallet.is_included_in_totals,
        wallet.sort_order
    )
    .fetch_one(executor)
    .await
}

/// `balance` and `is_default` are absent on purpose. Balance is never
/// writable through a route (TXN-3), and the default flag moves only through
/// `set_default`, so the invariant has one code path.
pub async fn update_wallet(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    patch: WalletPatch<'_>,
) -> Result<Option<WalletRow>, sqlx::Error> {
    let (set_group, group_id) = match patch.group_id {
        Some(value) => (true, value),
        None => (false, None),
    };

    sqlx::query_as!(
        WalletRow,
        r#"UPDATE wallets
           SET name = COALESCE($3, name),
               group_id = CASE WHEN $4 THEN $5 ELSE group_id END,
               currency_code = COALESCE($6, currency_code),
               is_included_in_totals = COALESCE($7, is_included_in_totals),
               sort_order = COALESCE($8, sort_order),
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, group_id, name, currency_code, balance, is_included_in_totals,
                     is_default, sort_order, created_at, updated_at"#,
        workspace_id,
        id,
        patch.name,
        set_group,
        group_id,
        patch.currency_code,
        patch.is_included_in_totals,
        patch.sort_order
    )
    .fetch_optional(executor)
    .await
}

/// Clear whichever wallet is currently the default.
///
/// Half of the default swap, and it always runs first. The partial unique
/// index is checked per row as the statement writes, so a single statement
/// that both sets and clears trips it the moment it writes the new default
/// before reaching the old one. Two statements in this order never do.
pub async fn clear_default_wallet(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE wallets SET is_default = false, updated_at = now()
           WHERE workspace_id = $1 AND deleted_at IS NULL AND is_default"#,
        workspace_id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// The other half. Runs after `clear_default_wallet`, inside the same
/// transaction (WAL-3).
pub async fn mark_wallet_default(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE wallets SET is_default = true, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

pub async fn soft_delete_wallet(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    // `is_default` is cleared with the same statement: the partial unique
    // index ignores deleted rows, but leaving a deleted wallet flagged would
    // make "which wallet is the default" ambiguous to anything reading the
    // table directly.
    sqlx::query!(
        r#"UPDATE wallets
           SET deleted_at = now(), is_default = false, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// The live wallet that should inherit the default flag, if any.
pub async fn next_default_candidate(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Option<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT id FROM wallets
           WHERE workspace_id = $1 AND deleted_at IS NULL
           ORDER BY sort_order, name
           LIMIT 1"#,
        workspace_id
    )
    .fetch_optional(executor)
    .await
}

/// Does any live transaction reference this wallet, on either leg (WAL-4)?
pub async fn wallet_has_live_transactions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    wallet_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
             SELECT 1 FROM transactions
             WHERE workspace_id = $1
               AND (wallet_id = $2 OR to_wallet_id = $2)
               AND deleted_at IS NULL
           ) AS "exists!""#,
        workspace_id,
        wallet_id
    )
    .fetch_one(executor)
    .await
}

/// Has the workspace any transaction at all, deleted ones included?
///
/// The one read in this module that does not filter `deleted_at IS NULL`,
/// and deliberately so: the workspace currency is locked once *any* row has
/// been denominated in it, because `base_amount` on a soft-deleted row is
/// still a number in that currency and would be reinterpreted by a change.
pub async fn workspace_has_transactions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS(
             SELECT 1 FROM transactions WHERE workspace_id = $1
           ) AS "exists!""#,
        workspace_id
    )
    .fetch_one(executor)
    .await
}
