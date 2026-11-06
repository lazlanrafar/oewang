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
use sqlx::{PgExecutor, QueryBuilder};

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct RateRow {
    pub rate: Decimal,
    pub date: NaiveDate,
    pub source: String,
}

/// The rate for a pair on one day, if it was cached.
///
/// A pair the cache does not hold directly is worked out through the
/// source's base for the same day: the daily snapshot stores every currency
/// against one base (D96), so IDR per USD is (IDR per EUR) / (USD per EUR).
/// A direct row wins when both exist.
pub async fn find_rate(
    executor: impl PgExecutor<'_>,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
) -> Result<Option<RateRow>, sqlx::Error> {
    sqlx::query_as!(
        RateRow,
        r#"SELECT rate AS "rate!", date AS "date!", source AS "source!"
           FROM (
               SELECT rate, date, source, 0 AS via
               FROM exchange_rates
               WHERE base_code = $1 AND quote_code = $2 AND date = $3
               UNION ALL
               SELECT round(q.rate / b.rate, 8), q.date, q.source, 1
               FROM exchange_rates b
               JOIN exchange_rates q
                 ON q.base_code = b.base_code AND q.date = b.date
               WHERE b.quote_code = $1 AND q.quote_code = $2 AND b.date = $3
           ) found
           ORDER BY via
           LIMIT 1"#,
        base_code,
        quote_code,
        date
    )
    .fetch_optional(executor)
    .await
}

/// The newest rate for a pair, whatever its date, direct or through the
/// source's base as in [`find_rate`].
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
        r#"SELECT rate AS "rate!", date AS "date!", source AS "source!"
           FROM (
               SELECT rate, date, source, 0 AS via
               FROM exchange_rates
               WHERE base_code = $1 AND quote_code = $2
               UNION ALL
               SELECT round(q.rate / b.rate, 8), q.date, q.source, 1
               FROM exchange_rates b
               JOIN exchange_rates q
                 ON q.base_code = b.base_code AND q.date = b.date
               WHERE b.quote_code = $1 AND q.quote_code = $2
           ) found
           ORDER BY date DESC, via
           LIMIT 1"#,
        base_code,
        quote_code
    )
    .fetch_optional(executor)
    .await
}

/// Whether the daily snapshot for `date` is already stored.
///
/// The job asks before it calls the source, so a restart does not spend a
/// call from the monthly quota on a day that already has its rates.
pub async fn has_snapshot(
    executor: impl PgExecutor<'_>,
    date: NaiveDate,
) -> Result<bool, sqlx::Error> {
    sqlx::query_scalar!(
        r#"SELECT EXISTS (
               SELECT 1 FROM exchange_rates
               WHERE date = $1 AND source = 'api' AND base_code = quote_code
           ) AS "exists!""#,
        date
    )
    .fetch_one(executor)
    .await
}

/// Write one day's snapshot: every quote against one base, in one
/// statement, replacing the day's rows where they already exist.
///
/// The base's own row (rate 1) is written too. It is what [`has_snapshot`]
/// looks for, and what lets a pair with the base on one side be read
/// through the same join as any other.
pub async fn upsert_snapshot(
    executor: impl PgExecutor<'_>,
    base_code: &str,
    date: NaiveDate,
    quotes: &[(String, Decimal)],
) -> Result<u64, sqlx::Error> {
    let ids: Vec<String> = quotes.iter().map(|_| cuid2::create_id()).collect();
    let codes: Vec<String> = quotes.iter().map(|(code, _)| code.clone()).collect();
    let rates: Vec<Decimal> = quotes.iter().map(|(_, rate)| *rate).collect();

    sqlx::query!(
        r#"INSERT INTO exchange_rates (id, base_code, quote_code, date, rate, source)
           SELECT id, $1, code, $2, rate, 'api'
           FROM UNNEST($3::text[], $4::text[], $5::numeric[]) AS t(id, code, rate)
           ON CONFLICT (base_code, quote_code, date)
           DO UPDATE SET rate = EXCLUDED.rate, source = EXCLUDED.source, fetched_at = now()"#,
        base_code,
        date,
        &ids,
        &codes,
        &rates
    )
    .execute(executor)
    .await
    .map(|result| result.rows_affected())
}

/// Which currencies the rates list shows, before paging.
#[derive(Debug, Default)]
pub struct SnapshotFilters<'a> {
    /// Matches anywhere in the currency code.
    pub search: Option<&'a str>,
    /// The newest snapshot on or before this day; the newest of all when
    /// absent.
    pub on_or_before: Option<NaiveDate>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SnapshotSort {
    CodeAsc,
    CodeDesc,
    RateAsc,
    RateDesc,
}

impl SnapshotSort {
    fn order_by(self) -> &'static str {
        match self {
            Self::CodeAsc => " ORDER BY currency_code ASC",
            Self::CodeDesc => " ORDER BY currency_code DESC",
            Self::RateAsc => " ORDER BY rate ASC, currency_code",
            Self::RateDesc => " ORDER BY rate DESC, currency_code",
        }
    }
}

/// One currency in a snapshot, against the reader's own currency.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct SnapshotRateRow {
    pub currency_code: String,
    /// What one unit of `currency_code` is worth in the home currency.
    pub rate: Decimal,
    /// What one unit of the home currency is worth in `currency_code`.
    pub inverse: Decimal,
    pub date: NaiveDate,
}

/// The snapshot chosen, and the home currency's own rate in it, as two
/// CTEs every snapshot query starts from. A home currency the snapshot
/// does not carry yields no rows rather than a wrong figure.
fn push_snapshot<'a>(
    builder: &mut QueryBuilder<'a, sqlx::Postgres>,
    home_code: &'a str,
    filters: &SnapshotFilters<'a>,
) {
    builder.push(
        "WITH snap AS (
             SELECT base_code, date FROM exchange_rates
             WHERE source = 'api' AND base_code = quote_code",
    );
    if let Some(date) = filters.on_or_before {
        builder.push(" AND date <= ");
        builder.push_bind(date);
    }
    builder.push(
        " ORDER BY date DESC LIMIT 1
         ), home AS (
             SELECT r.rate FROM exchange_rates r
             JOIN snap s ON r.base_code = s.base_code AND r.date = s.date
             WHERE r.quote_code = ",
    );
    builder.push_bind(home_code);
    builder.push(
        ")
         SELECT r.quote_code AS currency_code,
                round(home.rate / r.rate, 8) AS rate,
                round(r.rate / home.rate, 8) AS inverse,
                r.date
         FROM exchange_rates r
         JOIN snap s ON r.base_code = s.base_code AND r.date = s.date
         CROSS JOIN home
         WHERE r.quote_code <> ",
    );
    builder.push_bind(home_code);
    if let Some(search) = filters.search {
        builder.push(" AND r.quote_code ILIKE ");
        builder.push_bind(super::contains_pattern(search));
    }
}

/// One page of a day's snapshot, every currency against `home_code`
/// (D96). Not workspace-scoped, as the module says; the caller passes the
/// workspace's currency.
pub async fn list_snapshot_rates(
    executor: impl PgExecutor<'_>,
    home_code: &str,
    filters: &SnapshotFilters<'_>,
    sort: SnapshotSort,
    limit: i64,
    offset: i64,
) -> Result<Vec<SnapshotRateRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT * FROM (");
    push_snapshot(&mut builder, home_code, filters);
    builder.push(") rates");
    builder.push(sort.order_by());
    builder.push(" LIMIT ");
    builder.push_bind(limit);
    builder.push(" OFFSET ");
    builder.push_bind(offset);

    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_snapshot_rates(
    executor: impl PgExecutor<'_>,
    home_code: &str,
    filters: &SnapshotFilters<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM (");
    push_snapshot(&mut builder, home_code, filters);
    builder.push(") rates");

    builder.build_query_scalar().fetch_one(executor).await
}
