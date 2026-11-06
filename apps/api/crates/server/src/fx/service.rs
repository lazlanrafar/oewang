//! Rate resolution at write time, and the job that fills the cache.
//!
//! The ladder is docs/data-model.md#rate-resolution-at-write-time. It stops
//! at the first step that works. The last is the honest end: a rate cannot
//! be invented from nothing, so the write is refused and the form asks the
//! user to type one (TXN-22, D43).
//!
//! Nothing on the write path calls the rate source. The free plan allows
//! 100 calls a month, so the daily job is its only caller and every lookup
//! here is a local read (D96).

use chrono::NaiveDate;
use oewang_db::{repositories::fx, PgPool};
use oewang_domain::{
    ledger::{round_rate, RateSource},
    AppError, Result,
};
use rust_decimal::Decimal;

/// A rate, where it came from, and the day it applies to.
///
/// `date` is not always the transaction's date: a cached fallback carries
/// the day the cached rate was for, which is what lets the list mark a row
/// as written on a stale rate.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ResolvedRate {
    pub rate: Decimal,
    pub source: RateSource,
    pub date: NaiveDate,
}

impl ResolvedRate {
    /// The ordinary case: one currency, nothing looked up.
    pub fn same(date: NaiveDate) -> Self {
        Self {
            rate: Decimal::ONE,
            source: RateSource::Same,
            date,
        }
    }
}

/// Walk the ladder for one pair on one day.
///
/// `requested` is the rate the user saw and confirmed in the form. It wins
/// over any lookup, because a bank's rate is not the market rate (D39).
pub async fn resolve(
    pool: &PgPool,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
    requested: Option<Decimal>,
) -> Result<ResolvedRate> {
    // 1. No conversion.
    if base_code == quote_code {
        return Ok(ResolvedRate::same(date));
    }

    // 2. The request.
    if let Some(rate) = requested {
        if rate > Decimal::ZERO {
            return Ok(ResolvedRate {
                rate: round_rate(rate),
                source: RateSource::User,
                date,
            });
        }
    }

    // 3. The day's snapshot, filled by the daily job. Reported as `live`,
    //    because the value is the source's rate for that day.
    if let Some(cached) = fx::find_rate(pool, base_code, quote_code, date)
        .await
        .map_err(internal)?
    {
        return Ok(ResolvedRate {
            rate: round_rate(cached.rate),
            source: RateSource::Live,
            date: cached.date,
        });
    }

    // 4. The newest cached rate for the pair, however old.
    if let Some(cached) = fx::newest_rate(pool, base_code, quote_code)
        .await
        .map_err(internal)?
    {
        tracing::warn!(
            %base_code, %quote_code, wanted = %date, using = %cached.date,
            "no snapshot for the day, falling back to the newest cached rate"
        );
        return Ok(ResolvedRate {
            rate: round_rate(cached.rate),
            source: RateSource::Cache,
            date: cached.date,
        });
    }

    // 5. Nothing. The form already accepts a typed rate, so the user is
    //    never stuck, only asked.
    Err(AppError::FxRateUnavailable)
}

/// The ladder without a live call, for an imported row (TXN-23, D45).
///
/// A statement can cover months, so each row converts at the rate for its
/// own date, and only that date's rate: a row with no rate for its date is
/// skipped and reported, and the file still imports.
pub async fn resolve_cached(
    executor: impl sqlx::PgExecutor<'_>,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
    requested: Option<Decimal>,
) -> Result<ResolvedRate> {
    if base_code == quote_code {
        return Ok(ResolvedRate::same(date));
    }

    if let Some(rate) = requested {
        if rate > Decimal::ZERO {
            return Ok(ResolvedRate {
                rate: round_rate(rate),
                source: RateSource::User,
                date,
            });
        }
    }

    let cached = fx::find_rate(executor, base_code, quote_code, date)
        .await
        .map_err(internal)?
        .ok_or(AppError::FxRateUnavailable)?;

    Ok(ResolvedRate {
        rate: round_rate(cached.rate),
        source: RateSource::Live,
        date: cached.date,
    })
}

/// A suggestion for the form (TXN-20).
///
/// The same ladder without step 2, since the point is to propose a value the
/// user has not given yet.
pub async fn suggest(
    pool: &PgPool,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
) -> Result<ResolvedRate> {
    resolve(pool, base_code, quote_code, date, None).await
}

/// What one run of the daily job did.
#[derive(Debug, PartialEq, Eq)]
pub enum Refresh {
    /// No key is configured, so no call was made.
    Disabled,
    /// The day's snapshot is already stored; no call was made.
    AlreadyFresh,
    /// The source did not answer. The ladder falls back to older rates.
    Unavailable,
    /// The snapshot for `date` was stored, `written` currencies in it.
    Stored { date: NaiveDate, written: u64 },
}

/// Store today's snapshot of every currency, in one call to the source
/// (D44, D96).
///
/// Asks the cache first, so a process that restarts many times a day still
/// spends one call. Every pair is read through this snapshot afterwards.
pub async fn refresh_cache(
    pool: &PgPool,
    rates: &oewang_clients::RatesClient,
    today: NaiveDate,
) -> Result<Refresh> {
    if !rates.is_configured() {
        return Ok(Refresh::Disabled);
    }

    if fx::has_snapshot(pool, today).await.map_err(internal)? {
        return Ok(Refresh::AlreadyFresh);
    }

    let Some(snapshot) = rates.latest().await else {
        return Ok(Refresh::Unavailable);
    };

    // `numeric(19, 8)` holds less than 10^11. Nothing real comes near it; a
    // value that does is dropped rather than failing the whole snapshot.
    let ceiling = Decimal::from(100_000_000_000_u64);
    let quotes: Vec<(String, Decimal)> = snapshot
        .rates
        .into_iter()
        .map(|(code, rate)| (code, round_rate(rate)))
        .filter(|(_, rate)| *rate > Decimal::ZERO && *rate < ceiling)
        .collect();

    let written = fx::upsert_snapshot(pool, &snapshot.base, snapshot.date, &quotes)
        .await
        .map_err(internal)?;

    Ok(Refresh::Stored {
        date: snapshot.date,
        written,
    })
}

/// One page of the newest stored snapshot on or before a day, every
/// currency against the workspace's own (D96, FX-1).
///
/// Also returns the workspace currency, which is what every rate on the
/// page is expressed in.
pub async fn list_rates(
    pool: &PgPool,
    workspace_id: &str,
    filters: &fx::SnapshotFilters<'_>,
    sort: fx::SnapshotSort,
    page: oewang_domain::Page,
) -> Result<(String, Vec<fx::SnapshotRateRow>, i64)> {
    let workspace = oewang_db::repositories::accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let home = workspace.currency_code;

    let rows = fx::list_snapshot_rates(
        pool,
        &home,
        filters,
        sort,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;
    let total = fx::count_snapshot_rates(pool, &home, filters)
        .await
        .map_err(internal)?;

    Ok((home, rows, total))
}

/// Every currency the newest snapshot carries, the workspace's own first at
/// rate one, each with its rate against the workspace currency (FX-2).
///
/// The pickers' list. Unpaged, because the set is bounded by the source
/// (about 170) and a picker needs all of it; the ceiling below only guards
/// against a source that one day sends far more.
pub async fn list_currencies(
    pool: &PgPool,
    workspace_id: &str,
) -> Result<(String, Vec<fx::SnapshotRateRow>)> {
    const CEILING: i64 = 1_000;

    let workspace = oewang_db::repositories::accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;
    let home = workspace.currency_code;

    let mut rows = fx::list_snapshot_rates(
        pool,
        &home,
        &fx::SnapshotFilters::default(),
        fx::SnapshotSort::CodeAsc,
        CEILING,
        0,
    )
    .await
    .map_err(internal)?;

    // The home currency is not listed against itself by the query, but a
    // picker must offer it, and it is always worth exactly one of itself.
    let date = rows
        .first()
        .map(|row| row.date)
        .unwrap_or_else(|| chrono::Utc::now().date_naive());
    rows.insert(
        0,
        fx::SnapshotRateRow {
            currency_code: home.clone(),
            rate: Decimal::ONE,
            inverse: Decimal::ONE,
            date,
        },
    );

    Ok((home, rows))
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_treat_one_currency_as_rate_one() {
        let date = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let resolved = ResolvedRate::same(date);
        assert_eq!(resolved.rate, Decimal::ONE);
        assert_eq!(resolved.source, RateSource::Same);
        assert!(!resolved.source.is_stale(resolved.date, date));
    }

    #[test]
    fn should_mark_only_an_older_cached_rate_as_stale() {
        let wanted = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        let older = NaiveDate::from_ymd_opt(2026, 10, 28).unwrap();

        assert!(RateSource::Cache.is_stale(older, wanted));
        assert!(
            !RateSource::Cache.is_stale(wanted, wanted),
            "a cached rate for the day asked for is not stale"
        );
        assert!(
            !RateSource::Live.is_stale(older, wanted),
            "only the cache fallback is a fallback"
        );
    }
}
