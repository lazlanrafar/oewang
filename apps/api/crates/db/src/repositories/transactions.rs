//! The ledger: transactions, their balance effects, and the bulk paths.
//!
//! Every method is workspace-scoped and filters `deleted_at IS NULL`. The
//! only dynamic SQL in the crate is here, and it is two fixed fragments
//! chosen by an enum, never a formatted string (SEC-9, SEC-10).

use chrono::{DateTime, NaiveDate, Utc};
use rust_decimal::Decimal;
use serde::Serialize;
use sqlx::{PgExecutor, QueryBuilder};

/// `Serialize` is for the audit snapshot (D14), as in `wallets`.
#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct TransactionRow {
    pub id: String,
    pub wallet_id: String,
    pub to_wallet_id: Option<String>,
    pub category_id: Option<String>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
    pub original_amount: Option<Decimal>,
    pub original_currency_code: Option<String>,
    pub exchange_rate: Option<Decimal>,
    pub base_amount: Decimal,
    pub base_rate: Decimal,
    pub base_rate_source: String,
    pub base_rate_date: NaiveDate,
    pub date: DateTime<Utc>,
    pub r#type: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_ready: bool,
    pub is_exported: bool,
    pub source: String,
    pub fingerprint: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// A list row with the names the table renders, joined in the same query.
///
/// Joined rather than fetched per row: an N+1 here is what the 10,000 row,
/// 100 ms target in the PRD exists to catch.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct TransactionListRow {
    pub id: String,
    pub wallet_id: String,
    pub wallet_name: String,
    pub wallet_currency_code: String,
    pub to_wallet_id: Option<String>,
    pub to_wallet_name: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
    pub original_amount: Option<Decimal>,
    pub original_currency_code: Option<String>,
    pub exchange_rate: Option<Decimal>,
    pub base_amount: Decimal,
    pub base_rate: Decimal,
    pub base_rate_source: String,
    pub base_rate_date: NaiveDate,
    pub date: DateTime<Utc>,
    pub r#type: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_ready: bool,
    pub is_exported: bool,
    pub source: String,
    pub created_at: DateTime<Utc>,
}

/// Every filter the list accepts (docs/api/endpoints.md).
#[derive(Debug, Default, Clone)]
pub struct TransactionFilters<'a> {
    /// Matches either leg, so a transfer shows under both wallets, and
    /// several ids are a union: a row sitting in any one of them is kept.
    pub wallet_ids: Option<&'a [String]>,
    /// Several ids are a union, as above. An uncategorized row matches none
    /// of them, which is what `category_id = ANY(...)` already answers for a
    /// `NULL` column.
    pub category_ids: Option<&'a [String]>,
    pub kind: Option<&'a str>,
    pub start_date: Option<DateTime<Utc>>,
    pub end_date: Option<DateTime<Utc>>,
    pub search: Option<&'a str>,
    pub is_ready: Option<bool>,
    pub ids: Option<&'a [String]>,
    /// Bounds on the amount, compared on `base_amount` so one bound means
    /// the same thing across wallets. A list holding a USD wallet beside an
    /// IDR one has no single scale otherwise, and both the filter bar and
    /// the assistant speak in the workspace's currency.
    pub min_amount: Option<Decimal>,
    pub max_amount: Option<Decimal>,
}

/// The allowed sort fields, as an enum so the SQL fragment is fixed.
///
/// A string from the query string never reaches the statement (SEC-10).
#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortField {
    #[default]
    Date,
    Amount,
    Name,
    CreatedAt,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Default)]
pub enum SortOrder {
    Ascending,
    #[default]
    Descending,
}

impl SortField {
    /// The one place a sort turns into SQL. Each arm is a literal.
    fn fragment(self, order: SortOrder) -> &'static str {
        match (self, order) {
            // The tiebreaker is `created_at` then `id`, so two rows on the
            // same day keep a stable order across pages. Without it, page 2
            // can repeat a row page 1 already showed.
            (SortField::Date, SortOrder::Descending) => "t.date DESC, t.created_at DESC, t.id DESC",
            (SortField::Date, SortOrder::Ascending) => "t.date ASC, t.created_at ASC, t.id ASC",
            (SortField::Amount, SortOrder::Descending) => "t.base_amount DESC, t.id DESC",
            (SortField::Amount, SortOrder::Ascending) => "t.base_amount ASC, t.id ASC",
            // A row with no name sorts last either way: `NULLS LAST` on the
            // way up and `NULLS FIRST` reversed would put the blanks first
            // on one of the two passes, which reads as a bug.
            (SortField::Name, SortOrder::Descending) => "t.name DESC NULLS LAST, t.id DESC",
            (SortField::Name, SortOrder::Ascending) => "t.name ASC NULLS LAST, t.id ASC",
            (SortField::CreatedAt, SortOrder::Descending) => "t.created_at DESC, t.id DESC",
            (SortField::CreatedAt, SortOrder::Ascending) => "t.created_at ASC, t.id ASC",
        }
    }
}

/// The one place an id list decides whether it narrows anything.
///
/// An empty list means no filter, not "match nothing". A caller arrives
/// with zero ids when the user cleared the chips or sent `?wallet_id=`,
/// and in both cases they are asking for the whole list rather than for an
/// empty page. Every multi-id clause below goes through here, so that
/// answer is given once.
fn selected(ids: Option<&[String]>) -> Option<&[String]> {
    ids.filter(|ids| !ids.is_empty())
}

/// Append every filter as bound parameters.
///
/// A `LIKE` pattern is bound like any other value: it is never formatted
/// into the statement (SEC-9).
fn push_filters<'a>(
    builder: &mut QueryBuilder<'a, sqlx::Postgres>,
    workspace_id: &'a str,
    filters: &TransactionFilters<'a>,
) {
    builder
        .push(" WHERE t.workspace_id = ")
        .push_bind(workspace_id);
    builder.push(" AND t.deleted_at IS NULL");

    if let Some(wallet_ids) = selected(filters.wallet_ids) {
        // `= ANY($n)` rather than an `IN` list built here: however many ids
        // arrive, they are one bound parameter, so the statement's text does
        // not depend on the query string (SEC-9, SEC-10).
        builder
            .push(" AND (t.wallet_id = ANY(")
            .push_bind(wallet_ids)
            .push(") OR t.to_wallet_id = ANY(")
            .push_bind(wallet_ids)
            .push("))");
    }
    if let Some(category_ids) = selected(filters.category_ids) {
        builder
            .push(" AND t.category_id = ANY(")
            .push_bind(category_ids)
            .push(")");
    }
    if let Some(kind) = filters.kind {
        builder.push(" AND t.type = ").push_bind(kind);
    }
    if let Some(start) = filters.start_date {
        builder.push(" AND t.date >= ").push_bind(start);
    }
    if let Some(end) = filters.end_date {
        builder.push(" AND t.date <= ").push_bind(end);
    }
    if let Some(search) = filters.search {
        let pattern = format!(
            "%{}%",
            search
                .replace('\\', "\\\\")
                .replace('%', "\\%")
                .replace('_', "\\_")
        );
        builder
            .push(" AND (t.name ILIKE ")
            .push_bind(pattern.clone())
            .push(" OR t.description ILIKE ")
            .push_bind(pattern)
            .push(")");
    }
    if let Some(min_amount) = filters.min_amount {
        builder.push(" AND t.base_amount >= ").push_bind(min_amount);
    }
    if let Some(max_amount) = filters.max_amount {
        builder.push(" AND t.base_amount <= ").push_bind(max_amount);
    }
    if let Some(is_ready) = filters.is_ready {
        builder.push(" AND t.is_ready = ").push_bind(is_ready);
    }
    if let Some(ids) = filters.ids {
        builder.push(" AND t.id = ANY(").push_bind(ids).push(")");
    }
}

const LIST_SELECT: &str = r#"
    SELECT t.id, t.wallet_id, w.name AS wallet_name, w.currency_code AS wallet_currency_code,
           t.to_wallet_id, tw.name AS to_wallet_name,
           t.category_id, c.name AS category_name,
           t.amount, t.to_amount, t.original_amount, t.original_currency_code, t.exchange_rate,
           t.base_amount, t.base_rate, t.base_rate_source, t.base_rate_date,
           t.date, t.type, t.name, t.description, t.is_ready, t.is_exported, t.source,
           t.created_at
    FROM transactions t
    JOIN wallets w ON w.id = t.wallet_id
    LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
    LEFT JOIN categories c ON c.id = t.category_id
"#;

pub async fn list(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
    sort: SortField,
    order: SortOrder,
    limit: i64,
    offset: i64,
) -> Result<Vec<TransactionListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(LIST_SELECT);
    push_filters(&mut builder, workspace_id, filters);
    builder.push(" ORDER BY ").push(sort.fragment(order));
    builder.push(" LIMIT ").push_bind(limit);
    builder.push(" OFFSET ").push_bind(offset);

    builder
        .build_query_as::<TransactionListRow>()
        .fetch_all(executor)
        .await
}

/// The same filters, every matching row, no pagination.
///
/// The export streams this (TXN-10). It is a separate method rather than a
/// `limit` of a million, so nobody reaches the unbounded path by accident.
pub async fn list_all(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
    sort: SortField,
    order: SortOrder,
) -> Result<Vec<TransactionListRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(LIST_SELECT);
    push_filters(&mut builder, workspace_id, filters);
    builder.push(" ORDER BY ").push(sort.fragment(order));

    builder
        .build_query_as::<TransactionListRow>()
        .fetch_all(executor)
        .await
}

pub async fn count(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM transactions t");
    push_filters(&mut builder, workspace_id, filters);

    builder
        .build_query_scalar::<i64>()
        .fetch_one(executor)
        .await
}

/// Totals by type, in the workspace currency.
///
/// A plain sum of `base_amount` with no conversion and no rate lookup: the
/// conversion happened once, at write time (TXN-19).
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SummaryRow {
    pub r#type: String,
    pub total: Decimal,
    pub count: i64,
}

pub async fn summary(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
) -> Result<Vec<SummaryRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "SELECT t.type, COALESCE(sum(t.base_amount), 0) AS total, count(*) AS count
         FROM transactions t",
    );
    push_filters(&mut builder, workspace_id, filters);
    builder.push(" GROUP BY t.type ORDER BY t.type");

    builder
        .build_query_as::<SummaryRow>()
        .fetch_all(executor)
        .await
}

/// Totals by category, in the workspace currency.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct CategoryTotalRow {
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub r#type: String,
    pub total: Decimal,
}

pub async fn summary_by_category(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
) -> Result<Vec<CategoryTotalRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "SELECT t.category_id, c.name AS category_name, t.type,
                COALESCE(sum(t.base_amount), 0) AS total
         FROM transactions t
         LEFT JOIN categories c ON c.id = t.category_id",
    );
    push_filters(&mut builder, workspace_id, filters);
    builder.push(" GROUP BY t.category_id, c.name, t.type ORDER BY total DESC");

    builder
        .build_query_as::<CategoryTotalRow>()
        .fetch_all(executor)
        .await
}

/// The groupings a summary may be asked for.
///
/// An enum, so the `GROUP BY` fragment is a literal and a string from a
/// model never reaches the statement (SEC-10).
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SummaryGroup {
    Category,
    Wallet,
    Type,
    Month,
}

impl SummaryGroup {
    /// The selected key and label, the joins they need, and the grouping.
    /// Each arm is fixed text.
    fn fragments(self) -> (&'static str, &'static str, &'static str) {
        match self {
            SummaryGroup::Category => (
                "t.category_id AS key, c.name AS label",
                " LEFT JOIN categories c ON c.id = t.category_id",
                " GROUP BY t.category_id, c.name",
            ),
            SummaryGroup::Wallet => (
                "t.wallet_id AS key, w.name AS label",
                " JOIN wallets w ON w.id = t.wallet_id",
                " GROUP BY t.wallet_id, w.name",
            ),
            SummaryGroup::Type => ("t.type AS key, t.type AS label", "", " GROUP BY t.type"),
            SummaryGroup::Month => (
                "to_char(t.date, 'YYYY-MM') AS key, to_char(t.date, 'YYYY-MM') AS label",
                "",
                " GROUP BY to_char(t.date, 'YYYY-MM')",
            ),
        }
    }
}

/// One group's total, in the workspace currency.
///
/// `key` is null for the one group that has no row behind it: transactions
/// with no category. The caller labels it; the repository does not decide
/// what to call it.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct GroupTotalRow {
    pub key: Option<String>,
    pub label: Option<String>,
    pub total: Decimal,
    pub count: i64,
}

/// Totals per group, for the chat summary tool (CHAT-15, D27).
///
/// A plain sum of `base_amount`: the conversion happened once, at write
/// time (TXN-19), so there is no rate lookup and nothing to get wrong here.
pub async fn summary_grouped(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
    group: SummaryGroup,
) -> Result<Vec<GroupTotalRow>, sqlx::Error> {
    let (select, join, group_by) = group.fragments();

    let mut builder = QueryBuilder::new("SELECT ");
    builder.push(select);
    builder.push(", COALESCE(sum(t.base_amount), 0) AS total, count(*) AS count");
    builder.push(" FROM transactions t");
    builder.push(join);
    push_filters(&mut builder, workspace_id, filters);
    builder.push(group_by);
    builder.push(" ORDER BY total DESC");

    builder
        .build_query_as::<GroupTotalRow>()
        .fetch_all(executor)
        .await
}

/// One month's total for one type, in the workspace currency.
///
/// `month` is `YYYY-MM`. Months with no rows are absent; the service fills
/// the gaps, because a chart with a missing month draws a wrong line.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct MonthTotalRow {
    pub month: String,
    pub r#type: String,
    pub total: Decimal,
    pub count: i64,
}

/// Totals per month and type, for the overview and the analysis canvases.
///
/// Grouped by type as well as month so income and expense come back in one
/// pass. The month is read the same way `SummaryGroup::Month` reads it, so
/// the chat summary and the charts put a row in the same month.
pub async fn monthly_totals(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &TransactionFilters<'_>,
) -> Result<Vec<MonthTotalRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(
        "SELECT to_char(t.date, 'YYYY-MM') AS month, t.type,
                COALESCE(sum(t.base_amount), 0) AS total, count(*) AS count
         FROM transactions t",
    );
    push_filters(&mut builder, workspace_id, filters);
    builder.push(" GROUP BY to_char(t.date, 'YYYY-MM'), t.type ORDER BY month");

    builder
        .build_query_as::<MonthTotalRow>()
        .fetch_all(executor)
        .await
}

pub async fn find(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<TransactionRow>, sqlx::Error> {
    sqlx::query_as!(
        TransactionRow,
        r#"SELECT id, wallet_id, to_wallet_id, category_id, amount, to_amount,
                  original_amount, original_currency_code, exchange_rate,
                  base_amount, base_rate, base_rate_source, base_rate_date,
                  date, type AS "type!", name, description, is_ready, is_exported,
                  source, fingerprint, created_at, updated_at
           FROM transactions
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// One row with the same joined names the list carries.
///
/// Its own statement rather than the list with an id filter, because the
/// detail sheet asks for exactly one row and the macro can check it.
pub async fn find_detail(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<TransactionListRow>, sqlx::Error> {
    sqlx::query_as!(
        TransactionListRow,
        r#"SELECT t.id, t.wallet_id, w.name AS wallet_name,
                  w.currency_code AS wallet_currency_code,
                  t.to_wallet_id, tw.name AS "to_wallet_name?",
                  t.category_id, c.name AS "category_name?",
                  t.amount, t.to_amount, t.original_amount, t.original_currency_code,
                  t.exchange_rate, t.base_amount, t.base_rate, t.base_rate_source,
                  t.base_rate_date, t.date, t.type AS "type!", t.name, t.description,
                  t.is_ready, t.is_exported, t.source, t.created_at
           FROM transactions t
           JOIN wallets w ON w.id = t.wallet_id
           LEFT JOIN wallets tw ON tw.id = t.to_wallet_id
           LEFT JOIN categories c ON c.id = t.category_id
           WHERE t.workspace_id = $1 AND t.id = $2 AND t.deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Everything a row needs at insert time. The service computes every field.
#[derive(Debug)]
pub struct NewTransaction<'a> {
    pub id: &'a str,
    pub workspace_id: &'a str,
    pub wallet_id: &'a str,
    pub to_wallet_id: Option<&'a str>,
    pub category_id: Option<&'a str>,
    pub amount: Decimal,
    pub to_amount: Option<Decimal>,
    pub original_amount: Option<Decimal>,
    pub original_currency_code: Option<&'a str>,
    pub exchange_rate: Option<Decimal>,
    pub base_amount: Decimal,
    pub base_rate: Decimal,
    pub base_rate_source: &'a str,
    pub base_rate_date: NaiveDate,
    pub date: DateTime<Utc>,
    pub kind: &'a str,
    pub name: Option<&'a str>,
    pub description: Option<&'a str>,
    pub is_ready: bool,
    pub source: &'a str,
    pub fingerprint: Option<&'a str>,
}

pub async fn insert(
    executor: impl PgExecutor<'_>,
    new: NewTransaction<'_>,
) -> Result<TransactionRow, sqlx::Error> {
    sqlx::query_as!(
        TransactionRow,
        r#"INSERT INTO transactions
             (id, workspace_id, wallet_id, to_wallet_id, category_id, amount, to_amount,
              original_amount, original_currency_code, exchange_rate,
              base_amount, base_rate, base_rate_source, base_rate_date,
              date, type, name, description, is_ready, source, fingerprint)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
                   $15, $16, $17, $18, $19, $20, $21)
           RETURNING id, wallet_id, to_wallet_id, category_id, amount, to_amount,
                     original_amount, original_currency_code, exchange_rate,
                     base_amount, base_rate, base_rate_source, base_rate_date,
                     date, type AS "type!", name, description, is_ready, is_exported,
                     source, fingerprint, created_at, updated_at"#,
        new.id,
        new.workspace_id,
        new.wallet_id,
        new.to_wallet_id,
        new.category_id,
        new.amount,
        new.to_amount,
        new.original_amount,
        new.original_currency_code,
        new.exchange_rate,
        new.base_amount,
        new.base_rate,
        new.base_rate_source,
        new.base_rate_date,
        new.date,
        new.kind,
        new.name,
        new.description,
        new.is_ready,
        new.source,
        new.fingerprint
    )
    .fetch_one(executor)
    .await
}

/// Replace every mutable column.
///
/// A full replace rather than a column-by-column patch: an update reverses
/// the old effect and applies the new one, so the service has already built
/// the whole new row and a partial write would be the harder thing to reason
/// about.
pub async fn update(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
    new: NewTransaction<'_>,
) -> Result<Option<TransactionRow>, sqlx::Error> {
    sqlx::query_as!(
        TransactionRow,
        r#"UPDATE transactions
           SET wallet_id = $3, to_wallet_id = $4, category_id = $5, amount = $6, to_amount = $7,
               original_amount = $8, original_currency_code = $9, exchange_rate = $10,
               base_amount = $11, base_rate = $12, base_rate_source = $13, base_rate_date = $14,
               date = $15, type = $16, name = $17, description = $18, is_ready = $19,
               updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL
           RETURNING id, wallet_id, to_wallet_id, category_id, amount, to_amount,
                     original_amount, original_currency_code, exchange_rate,
                     base_amount, base_rate, base_rate_source, base_rate_date,
                     date, type AS "type!", name, description, is_ready, is_exported,
                     source, fingerprint, created_at, updated_at"#,
        workspace_id,
        id,
        new.wallet_id,
        new.to_wallet_id,
        new.category_id,
        new.amount,
        new.to_amount,
        new.original_amount,
        new.original_currency_code,
        new.exchange_rate,
        new.base_amount,
        new.base_rate,
        new.base_rate_source,
        new.base_rate_date,
        new.date,
        new.kind,
        new.name,
        new.description,
        new.is_ready
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
        r#"UPDATE transactions SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        id
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Set the category, the ready flag, or both, across a selection (TXN-14).
///
/// Neither column touches a balance, which is why a bulk edit is one
/// statement while a bulk delete has to walk its rows.
pub async fn bulk_update(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
    category_id: Option<Option<&str>>,
    is_ready: Option<bool>,
) -> Result<u64, sqlx::Error> {
    let (set_category, category_id) = match category_id {
        Some(value) => (true, value),
        None => (false, None),
    };

    sqlx::query!(
        r#"UPDATE transactions
           SET category_id = CASE WHEN $3 THEN $4 ELSE category_id END,
               is_ready = COALESCE($5, is_ready),
               updated_at = now()
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL"#,
        workspace_id,
        ids,
        set_category,
        category_id,
        is_ready
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Every live row in a selection, locked for the balance reversal.
pub async fn find_many(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
) -> Result<Vec<TransactionRow>, sqlx::Error> {
    sqlx::query_as!(
        TransactionRow,
        r#"SELECT id, wallet_id, to_wallet_id, category_id, amount, to_amount,
                  original_amount, original_currency_code, exchange_rate,
                  base_amount, base_rate, base_rate_source, base_rate_date,
                  date, type AS "type!", name, description, is_ready, is_exported,
                  source, fingerprint, created_at, updated_at
           FROM transactions
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL
           ORDER BY id"#,
        workspace_id,
        ids
    )
    .fetch_all(executor)
    .await
}

pub async fn soft_delete_many(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE transactions SET deleted_at = now(), updated_at = now()
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL"#,
        workspace_id,
        ids
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Mark what an export covered (TXN-10).
pub async fn mark_exported(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE transactions SET is_exported = true, updated_at = now()
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL"#,
        workspace_id,
        ids
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Which of these fingerprints the workspace already holds (TXN-16).
///
/// Asked before a bulk insert so a duplicate is counted and skipped rather
/// than failing the statement and taking the good rows with it.
pub async fn existing_fingerprints(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    fingerprints: &[String],
) -> Result<Vec<String>, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT fingerprint AS "fingerprint!"
           FROM transactions
           WHERE workspace_id = $1
             AND fingerprint = ANY($2)
             AND deleted_at IS NULL"#,
        workspace_id,
        fingerprints
    )
    .fetch_all(executor)
    .await
}

// ------------------------------------------------------------- balances

/// A wallet, locked, with what a balance move needs to know.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct LockedWallet {
    pub id: String,
    pub currency_code: String,
    pub balance: Decimal,
}

/// Lock wallets in ascending ID order, before any balance is read (D13).
///
/// The caller sorts; this method sorts again in SQL so the order is a
/// property of the statement rather than of the caller remembering.
pub async fn lock_wallets(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    ids: &[String],
) -> Result<Vec<LockedWallet>, sqlx::Error> {
    sqlx::query_as!(
        LockedWallet,
        r#"SELECT id, currency_code, balance
           FROM wallets
           WHERE workspace_id = $1 AND id = ANY($2) AND deleted_at IS NULL
           ORDER BY id
           FOR UPDATE"#,
        workspace_id,
        ids
    )
    .fetch_all(executor)
    .await
}

/// Move one wallet's balance by a signed delta.
///
/// An addition rather than a write of a computed total: two concurrent
/// creates then cannot each read the same balance and write the same sum.
/// The row is already locked by `lock_wallets` when this runs.
pub async fn apply_delta(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    wallet_id: &str,
    delta: Decimal,
) -> Result<u64, sqlx::Error> {
    sqlx::query!(
        r#"UPDATE wallets SET balance = balance + $3, updated_at = now()
           WHERE workspace_id = $1 AND id = $2 AND deleted_at IS NULL"#,
        workspace_id,
        wallet_id,
        delta
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

// ------------------------------------------------------------ import jobs

/// A statement import, running or finished (AI-4, AI-6).
#[derive(Debug, Clone, serde::Serialize)]
pub struct ImportJobRow {
    pub id: String,
    pub workspace_id: String,
    pub user_id: String,
    pub status: String,
    /// The document the rows were read from, so a retry does not re-upload
    /// it. Null for a job that predates the column.
    pub vault_file_id: Option<String>,
    pub imported: Option<i32>,
    pub skipped: Option<i32>,
    pub duplicates: Option<i32>,
    /// An error code, never a message: the modal renders a dictionary
    /// string keyed by it, and a message could carry a row's contents.
    pub error: Option<String>,
    /// What became of each row, capped by the application. A report, not
    /// ledger data: written once, read whole, joined to nothing.
    pub review: Option<serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

pub async fn insert_import_job(
    executor: impl PgExecutor<'_>,
    id: &str,
    workspace_id: &str,
    user_id: &str,
    vault_file_id: &str,
) -> Result<ImportJobRow, sqlx::Error> {
    sqlx::query_as!(
        ImportJobRow,
        r#"INSERT INTO transaction_import_jobs
               (id, workspace_id, user_id, vault_file_id)
           VALUES ($1, $2, $3, $4)
           RETURNING id, workspace_id, user_id, status, vault_file_id,
                     imported, skipped, duplicates, error, review,
                     created_at, updated_at"#,
        id,
        workspace_id,
        user_id,
        vault_file_id
    )
    .fetch_one(executor)
    .await
}

pub async fn find_import_job(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    id: &str,
) -> Result<Option<ImportJobRow>, sqlx::Error> {
    sqlx::query_as!(
        ImportJobRow,
        r#"SELECT id, workspace_id, user_id, status, vault_file_id,
                  imported, skipped, duplicates, error, review, created_at,
                  updated_at
           FROM transaction_import_jobs
           WHERE workspace_id = $1 AND id = $2"#,
        workspace_id,
        id
    )
    .fetch_optional(executor)
    .await
}

/// Write the outcome back. The job row is the only record the modal polls,
/// so it carries the counts separately: imported, skipped and duplicate are
/// three different things that happened to a row (TXN-16).
/// Everything a finished job records, in one value: six positional
/// arguments at a call site is five chances to transpose two of them, and
/// `imported` and `skipped` are both counts of rows.
#[derive(Debug, Default)]
pub struct JobOutcome<'a> {
    pub status: &'a str,
    pub imported: i32,
    pub skipped: i32,
    pub duplicates: i32,
    pub error: Option<&'a str>,
    pub review: Option<&'a serde_json::Value>,
}

pub async fn finish_import_job(
    executor: impl PgExecutor<'_>,
    id: &str,
    outcome: JobOutcome<'_>,
) -> Result<u64, sqlx::Error> {
    let JobOutcome {
        status,
        imported,
        skipped,
        duplicates,
        error,
        review,
    } = outcome;
    sqlx::query!(
        r#"UPDATE transaction_import_jobs
           SET status = $2, imported = $3, skipped = $4, duplicates = $5,
               error = $6, review = $7, updated_at = now()
           WHERE id = $1"#,
        id,
        status,
        imported,
        skipped,
        duplicates,
        error,
        review
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}
