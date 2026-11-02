//! The daily exchange-rate cache.
//!
//! Not workspace-scoped, and deliberately so: a rate is a fact about the
//! world, not about a tenant. That is why the methods here take no
//! `workspace_id` and the usual scoping rule does not apply.
//!
//! Read when prefilling a form and when resolving a rate at write time. No
//! report path reads it, because `base_amount` was computed once already
//! (TXN-19).

use chrono::NaiveDate;
use rust_decimal::Decimal;
use sqlx::PgExecutor;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RateRow {
    pub rate: Decimal,
    pub date: NaiveDate,
    pub source: String,
}

/// The rate for a pair on one day, if it was cached.
pub async fn find_rate(
    executor: impl PgExecutor<'_>,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
) -> Result<Option<RateRow>, sqlx::Error> {
    sqlx::query_as!(
        RateRow,
        r#"SELECT rate, date, source
           FROM exchange_rates
           WHERE base_code = $1 AND quote_code = $2 AND date = $3"#,
        base_code,
        quote_code,
        date
    )
    .fetch_optional(executor)
    .await
}

/// The newest rate for a pair, whatever its date.
///
/// Step 4 of the resolution ladder. The date comes back with it, because a
/// row written on a stale rate says so in the list and the detail sheet
/// (TXN-22).
pub async fn newest_rate(
    executor: impl PgExecutor<'_>,
    base_code: &str,
    quote_code: &str,
) -> Result<Option<RateRow>, sqlx::Error> {
    sqlx::query_as!(
        RateRow,
        r#"SELECT rate, date, source
           FROM exchange_rates
           WHERE base_code = $1 AND quote_code = $2
           ORDER BY date DESC
           LIMIT 1"#,
        base_code,
        quote_code
    )
    .fetch_optional(executor)
    .await
}

/// Write a fetched rate, replacing the day's row if it is already there.
pub async fn upsert_rate(
    executor: impl PgExecutor<'_>,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
    rate: Decimal,
    source: &str,
) -> Result<(), sqlx::Error> {
    sqlx::query!(
        r#"INSERT INTO exchange_rates (id, base_code, quote_code, date, rate, source)
           VALUES ($1, $2, $3, $4, $5, $6)
           ON CONFLICT (base_code, quote_code, date)
           DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, fetched_at = now()"#,
        cuid2::create_id(),
        base_code,
        quote_code,
        date,
        rate,
        source
    )
    .execute(executor)
    .await
    .map(|_| ())
}

/// Every wallet-currency to workspace-currency pair actually in use (D44).
///
/// The daily job fetches these and nothing else: there is no reason to pull
/// a rate for a currency no wallet is denominated in.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct PairRow {
    pub base_code: String,
    pub quote_code: String,
}

pub async fn pairs_in_use(executor: impl PgExecutor<'_>) -> Result<Vec<PairRow>, sqlx::Error> {
    sqlx::query_as!(
        PairRow,
        r#"SELECT DISTINCT w.currency_code AS base_code, ws.currency_code AS quote_code
           FROM wallets w
           JOIN workspaces ws ON ws.id = w.workspace_id
           WHERE w.deleted_at IS NULL
             AND ws.deleted_at IS NULL
             AND w.currency_code <> ws.currency_code"#
    )
    .fetch_all(executor)
    .await
}
