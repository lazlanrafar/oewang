//! Debts and their payments (DEBT-1 to DEBT-10, D120, D121).
//!
//! See docs/features/debts.md. `remaining_amount` and `status` are written
//! only by the debt service, inside the transaction of the payment or
//! cancellation that moves them.

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::{PgExecutor, QueryBuilder};

/// `Serialize` is for the audit snapshot.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct DebtRow {
    pub id: String,
    pub contact_id: String,
    pub source_transaction_id: Option<String>,
    pub r#type: String,
    pub origin: String,
    pub currency_code: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub remaining_amount: Decimal,
    pub status: String,
    pub description: Option<String>,
    pub due_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A debt with its contact's name, as the list and the detail show it.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct DebtListRow {
    pub id: String,
    pub contact_id: String,
    pub contact_name: String,
    pub source_transaction_id: Option<String>,
    pub r#type: String,
    pub origin: String,
    pub currency_code: String,
    pub amount: Decimal,
    pub remaining_amount: Decimal,
    pub status: String,
    pub description: Option<String>,
    pub due_date: Option<NaiveDate>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct PaymentRow {
    pub id: String,
    pub debt_id: String,
    pub transaction_id: Option<String>,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A payment with the wallet its transaction moved, if any.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PaymentDetailRow {
    pub id: String,
    pub debt_id: String,
    pub transaction_id: Option<String>,
    pub wallet_id: Option<String>,
    pub amount: Decimal,
    pub date: DateTime<Utc>,
    pub created_at: DateTime<Utc>,
}

/// Unpaid and partial debts, summed per type and currency.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct OpenTotalRow {
    pub r#type: String,
    pub currency_code: String,
    pub remaining: Decimal,
}

pub struct NewDebt<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub contact_id: &'a str,
    pub source_transaction_id: Option<&'a str>,
    pub kind: &'a str,
    pub origin: &'a str,
    pub currency_code: &'a str,
    pub amount: Decimal,
    pub description: Option<&'a str>,
    pub due_date: Option<NaiveDate>,
}

/// Every column an edit may set, already resolved by the service.
pub struct DebtUpdate<'a> {
    pub contact_id: &'a str,
    pub kind: &'a str,
    pub currency_code: &'a str,
    pub amount: Decimal,
    pub remaining_amount: Decimal,
    pub status: &'a str,
    pub description: Option<&'a str>,
    pub due_date: Option<NaiveDate>,
}

pub struct NewPayment<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub debt_id: &'a str,
    pub transaction_id: Option<&'a str>,
    pub amount: Decimal,
    pub date: DateTime<Utc>,
}

#[derive(Debug, Default)]
pub struct DebtFilters<'a> {
    pub search: Option<&'a str>,
    pub statuses: Vec<String>,
    pub kind: Option<&'a str>,
    pub contact_id: Option<&'a str>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum DebtSort {
    DueDate,
    Amount,
    Remaining,
    CreatedAt,
    Contact,
}

const DEBT_COLUMNS: &str = "d.id, d.contact_id, c.name AS contact_name, d.source_transaction_id,
       d.type, d.origin, d.currency_code, d.amount, d.remaining_amount, d.status,
       d.description, d.due_date, d.created_at, d.updated_at";

fn push_filters(
    builder: &mut QueryBuilder<sqlx::Postgres>,
    workspace_id: &str,
    f: &DebtFilters<'_>,
) {
    builder
        .push(" FROM debts d JOIN contacts c ON c.id = d.contact_id WHERE d.workspace_id = ")
        .push_bind(workspace_id.to_string())
        .push(" AND d.deleted_at IS NULL");
    if let Some(search) = f.search {
        let pattern = super::contains_pattern(search);
        builder
            .push(" AND (c.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR d.description ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if !f.statuses.is_empty() {
        builder
            .push(" AND d.status = ANY(")
            .push_bind(f.statuses.clone())
            .push(")");
    }
    if let Some(kind) = f.kind {
        builder.push(" AND d.type = ").push_bind(kind.to_string());
    }
    if let Some(contact_id) = f.contact_id {
        builder
            .push(" AND d.contact_id = ")
            .push_bind(contact_id.to_string());
    }
}

#[allow(clippy::too_many_arguments)]
pub async fn list(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &DebtFilters<'_>,
    sort: DebtSort,
    descending: bool,
    limit: i64,
    offset: i64,
) -> Result<Vec<DebtListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT ");
    builder.push(DEBT_COLUMNS);
    push_filters(&mut builder, workspace_id, filters);
    let dir = if descending { "DESC" } else { "ASC" };
    builder.push(match sort {
        // A debt with no due date is never the most urgent one.
        DebtSort::DueDate => {
            format!(" ORDER BY d.due_date {dir} NULLS LAST, d.created_at DESC, d.id")
        }
        DebtSort::Amount => format!(" ORDER BY d.amount {dir}, d.id"),
        DebtSort::Remaining => format!(" ORDER BY d.remaining_amount {dir}, d.id"),
        DebtSort::CreatedAt => format!(" ORDER BY d.created_at {dir}, d.id"),
        DebtSort::Contact => format!(" ORDER BY lower(c.name) {dir}, d.id"),
    });
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);
    builder.build_query_as().fetch_all(executor).await
}

pub async fn count(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &DebtFilters<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*)");
    push_filters(&mut builder, workspace_id, filters);
    builder.build_query_scalar().fetch_one(executor).await
}

pub async fn find_detail(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<DebtListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT ");
    builder.push(DEBT_COLUMNS);
    push_filters(&mut builder, workspace_id, &DebtFilters::default());
    builder.push(" AND d.id = ").push_bind(id.to_string());
    builder.build_query_as().fetch_optional(executor).await
}

/// Debts made from this transaction (DEBT-9, DEBT-12).
pub async fn list_for_source(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    transaction_id: &str,
) -> Result<Vec<DebtListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT ");
    builder.push(DEBT_COLUMNS);
    push_filters(&mut builder, workspace_id, &DebtFilters::default());
    builder
        .push(" AND d.source_transaction_id = ")
        .push_bind(transaction_id.to_string())
        .push(" ORDER BY d.created_at, d.id");
    builder.build_query_as().fetch_all(executor).await
}

pub async fn find(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"SELECT id, contact_id, source_transaction_id, type AS "type!", origin, currency_code,
                  amount, remaining_amount, status, description, due_date, created_at, updated_at
           FROM debts
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
) -> Result<Option<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"SELECT id, contact_id, source_transaction_id, type AS "type!", origin, currency_code,
                  amount, remaining_amount, status, description, due_date, created_at, updated_at
           FROM debts
           WHERE workspace_id = $1 AND id = $2"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Lock live debts in ascending id order, after any wallet lock (D13), so
/// two payments touching the same debts cannot deadlock. A missing id is
/// simply absent from the answer.
pub async fn lock(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
) -> Result<Vec<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"SELECT id, contact_id, source_transaction_id, type AS "type!", origin, currency_code,
                  amount, remaining_amount, status, description, due_date, created_at, updated_at
           FROM debts
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE"#,
        workspace_id,
        ids
    )
    .fetch_all(executor)
    .await
}

/// `None` when the id is already taken (D114).
pub async fn insert(
    executor: impl PgExecutor<'_>,
    debt: NewDebt<'_>,
) -> Result<Option<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"INSERT INTO debts (id, workspace_id, contact_id, source_transaction_id, type, origin,
                              currency_code, amount, remaining_amount, status, description,
                              due_date)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8, 'unpaid', $9, $10)
           ON CONFLICT (id) DO NOTHING
           RETURNING id, contact_id, source_transaction_id, type AS "type!", origin,
                     currency_code, amount, remaining_amount, status, description, due_date,
                     created_at, updated_at"#,
        debt.id,
        debt.workspace_id,
        debt.contact_id,
        debt.source_transaction_id,
        debt.kind,
        debt.origin,
        debt.currency_code,
        debt.amount,
        debt.description,
        debt.due_date
    )
    .fetch_optional(executor)
    .await
}

/// `if_match` is checked by this statement under its row lock (D115).
pub async fn update(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    change: &DebtUpdate<'_>,
    if_match: Option<DateTime<Utc>>,
) -> Result<Option<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"UPDATE debts
           SET contact_id = $3, type = $4, currency_code = $5, amount = $6,
               remaining_amount = $7, status = $8, description = $9, due_date = $10,
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
             AND ($11::timestamptz IS NULL OR updated_at = $11)
           RETURNING id, contact_id, source_transaction_id, type AS "type!", origin,
                     currency_code, amount, remaining_amount, status, description, due_date,
                     created_at, updated_at"#,
        workspace_id,
        id,
        change.contact_id,
        change.kind,
        change.currency_code,
        change.amount,
        change.remaining_amount,
        change.status,
        change.description,
        change.due_date,
        if_match
    )
    .fetch_optional(executor)
    .await
}

/// Move what is left after a payment or a cancellation. The caller holds
/// the row lock.
pub async fn set_remaining(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    remaining_amount: Decimal,
    status: &str,
) -> Result<DebtRow, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"UPDATE debts SET remaining_amount = $3, status = $4, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, contact_id, source_transaction_id, type AS "type!", origin,
                     currency_code, amount, remaining_amount, status, description, due_date,
                     created_at, updated_at"#,
        workspace_id,
        id,
        remaining_amount,
        status
    )
    .fetch_one(executor)
    .await
}

pub async fn soft_delete(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE debts SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|done| done.rows_affected())
}

/// Whether a live debt names this contact, paid or not (CON-3).
pub async fn contact_has_debts(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    contact_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM debts
             WHERE workspace_id = $1 AND contact_id = $2 AND deleted_at IS NULL) AS "exists!""#,
        workspace_id,
        contact_id
    )
    .fetch_one(executor)
    .await
}

/// Move every live debt of `from` to `into` (CON-4). Answers the moved rows
/// as they are now.
pub async fn move_to_contact(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    from: &str,
    into: &str,
) -> Result<Vec<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"UPDATE debts SET contact_id = $3, updated_at = now()
           WHERE workspace_id = $1 AND contact_id = $2 AND deleted_at IS NULL
           RETURNING id, contact_id, source_transaction_id, type AS "type!", origin,
                     currency_code, amount, remaining_amount, status, description, due_date,
                     created_at, updated_at"#,
        workspace_id,
        from,
        into
    )
    .fetch_all(executor)
    .await
}

/// Lock the live debts made from these transactions, ascending, as they
/// are before their link is cleared.
pub async fn lock_by_source(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    transaction_ids: &[String],
) -> Result<Vec<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"SELECT id, contact_id, source_transaction_id, type AS "type!", origin, currency_code,
                  amount, remaining_amount, status, description, due_date, created_at, updated_at
           FROM debts
           WHERE workspace_id = $1 AND source_transaction_id = ANY($2) AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE"#,
        workspace_id,
        transaction_ids
    )
    .fetch_all(executor)
    .await
}

/// Clear the link of every live debt made from these transactions, which
/// are being deleted (D121). Answers the changed rows as they are now.
pub async fn clear_source(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    transaction_ids: &[String],
) -> Result<Vec<DebtRow>, sqlx::Error> {
    sqlx::query_as!(
        DebtRow,
        r#"UPDATE debts SET source_transaction_id = NULL, updated_at = now()
           WHERE workspace_id = $1 AND source_transaction_id = ANY($2) AND deleted_at IS NULL
           RETURNING id, contact_id, source_transaction_id, type AS "type!", origin,
                     currency_code, amount, remaining_amount, status, description, due_date,
                     created_at, updated_at"#,
        workspace_id,
        transaction_ids
    )
    .fetch_all(executor)
    .await
}

pub async fn open_totals(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
) -> Result<Vec<OpenTotalRow>, sqlx::Error> {
    sqlx::query_as!(
        OpenTotalRow,
        r#"SELECT type AS "type!", currency_code, sum(remaining_amount) AS "remaining!"
           FROM debts
           WHERE workspace_id = $1 AND deleted_at IS NULL AND status <> 'paid'
           GROUP BY type, currency_code
           ORDER BY type, currency_code"#,
        workspace_id
    )
    .fetch_all(executor)
    .await
}

pub async fn overdue_count(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    today: NaiveDate,
) -> Result<i64, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT count(*) AS "count!" FROM debts
           WHERE workspace_id = $1 AND deleted_at IS NULL AND status <> 'paid'
             AND due_date < $2"#,
        workspace_id,
        today
    )
    .fetch_one(executor)
    .await
}

// ---------------------------------------------------------------- payments

/// `None` when the id is already taken (D114).
pub async fn insert_payment(
    executor: impl PgExecutor<'_>,
    payment: NewPayment<'_>,
) -> Result<Option<PaymentRow>, sqlx::Error> {
    sqlx::query_as!(
        PaymentRow,
        r#"INSERT INTO debt_payments (id, workspace_id, debt_id, transaction_id, amount, date)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (id) DO NOTHING
           RETURNING id, debt_id, transaction_id, amount, date, created_at, updated_at"#,
        payment.id,
        payment.workspace_id,
        payment.debt_id,
        payment.transaction_id,
        payment.amount,
        payment.date
    )
    .fetch_optional(executor)
    .await
}

pub async fn find_payment(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<PaymentRow>, sqlx::Error> {
    sqlx::query_as!(
        PaymentRow,
        r#"SELECT id, debt_id, transaction_id, amount, date, created_at, updated_at
           FROM debt_payments
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Live or deleted: what a repeated payment answers (D114).
pub async fn find_payment_with_deleted(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<PaymentRow>, sqlx::Error> {
    sqlx::query_as!(
        PaymentRow,
        r#"SELECT id, debt_id, transaction_id, amount, date, created_at, updated_at
           FROM debt_payments
           WHERE workspace_id = $1 AND id = $2"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

pub async fn list_payments(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    debt_id: &str,
) -> Result<Vec<PaymentDetailRow>, sqlx::Error> {
    sqlx::query_as!(
        PaymentDetailRow,
        r#"SELECT p.id, p.debt_id, p.transaction_id, t.wallet_id AS "wallet_id?", p.amount,
                  p.date, p.created_at
           FROM debt_payments p
           LEFT JOIN transactions t ON t.id = p.transaction_id
           WHERE p.workspace_id = $1 AND p.debt_id = $2 AND p.deleted_at IS NULL
           ORDER BY p.date DESC, p.id"#,
        workspace_id,
        debt_id
    )
    .fetch_all(executor)
    .await
}

pub async fn has_live_payments(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    debt_id: &str,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (SELECT 1 FROM debt_payments
             WHERE workspace_id = $1 AND debt_id = $2 AND deleted_at IS NULL) AS "exists!""#,
        workspace_id,
        debt_id
    )
    .fetch_one(executor)
    .await
}

/// The live payments these transactions settle, one at most each.
pub async fn payments_for_transactions(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    transaction_ids: &[String],
) -> Result<Vec<PaymentRow>, sqlx::Error> {
    sqlx::query_as!(
        PaymentRow,
        r#"SELECT id, debt_id, transaction_id, amount, date, created_at, updated_at
           FROM debt_payments
           WHERE workspace_id = $1 AND transaction_id = ANY($2) AND deleted_at IS NULL
           ORDER BY id"#,
        workspace_id,
        transaction_ids
    )
    .fetch_all(executor)
    .await
}

pub async fn soft_delete_payment(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE debt_payments SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|done| done.rows_affected())
}
