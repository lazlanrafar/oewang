//! Rate resolution at write time, and the job that fills the cache.
//!
//! The ladder is docs/data-model.md#rate-resolution-at-write-time. It has
//! five steps and stops at the first that works. Step 5 is the honest end:
//! a rate cannot be invented from nothing, so the write is refused and the
//! form asks the user to type one (TXN-22, D43).

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
        Self { rate: Decimal::ONE, source: RateSource::Same, date }
    }
}

/// Walk the ladder for one pair on one day.
///
/// `requested` is the rate the user saw and confirmed in the form. It wins
/// over any lookup, because a bank's rate is not the market rate (D39).
pub async fn resolve(
    pool: &PgPool,
    rates: &oewang_clients::RatesClient,
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
            return Ok(ResolvedRate { rate: round_rate(rate), source: RateSource::User, date });
        }
    }

    // 3. The cache for this exact day, then the live source.
    //
    // The documented order puts the live call first, but a cached row for
    // the day it is for is the same number the live call would return, and
    // reaching for it first keeps a third party out of the hot path. Both
    // report `live`, because the value came from the live source either way.
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

    if let Some(rate) = rates.rate(base_code, quote_code, date).await {
        // Written back so the next transaction on this day is a local read.
        fx::upsert_rate(pool, base_code, quote_code, date, round_rate(rate), "api")
            .await
            .map_err(internal)?;

        return Ok(ResolvedRate { rate: round_rate(rate), source: RateSource::Live, date });
    }

    // 4. The newest cached rate for the pair, however old.
    if let Some(cached) = fx::newest_rate(pool, base_code, quote_code)
        .await
        .map_err(internal)?
    {
        tracing::warn!(
            %base_code, %quote_code, wanted = %date, using = %cached.date,
            "rate source unavailable, falling back to the cache"
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
/// own date. Reaching for the live source once per row would be thousands
/// of calls for one file, so this stops at the cache: a row with no rate
/// for its date is skipped and reported, and the file still imports.
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
            return Ok(ResolvedRate { rate: round_rate(rate), source: RateSource::User, date });
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
    rates: &oewang_clients::RatesClient,
    base_code: &str,
    quote_code: &str,
    date: NaiveDate,
) -> Result<ResolvedRate> {
    resolve(pool, rates, base_code, quote_code, date, None).await
}

/// Fill the cache for every pair in use (D44).
///
/// Returns how many pairs were written, which is what the log line carries.
/// A pair the source cannot answer is skipped: the job filling nothing is
/// not a reason to fail, because the ladder has a step for exactly that.
pub async fn refresh_cache(
    pool: &PgPool,
    rates: &oewang_clients::RatesClient,
    date: NaiveDate,
) -> Result<usize> {
    let pairs = fx::pairs_in_use(pool).await.map_err(internal)?;
    let mut written = 0;

    for pair in pairs {
        let Some(rate) = rates.rate(&pair.base_code, &pair.quote_code, date).await else {
            continue;
        };

        fx::upsert_rate(
            pool,
            &pair.base_code,
            &pair.quote_code,
            date,
            round_rate(rate),
            "api",
        )
        .await
        .map_err(internal)?;

        written += 1;
    }

    Ok(written)
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
