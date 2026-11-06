//! The daily exchange-rate source (D44, D96).
//!
//! APILayer's Exchange Rate API, which answers in the Fixer format: every
//! rate against one base (EUR on the free plan), keyed by currency code. One
//! call returns all ~170 currencies, so the daily job makes exactly one call
//! and every pair is worked out from the cache afterwards. The free plan
//! allows 100 calls a month; nothing but the daily job calls this.
//!
//! Every failure is a `None`, never an error that propagates. The rate
//! ladder treats "the source did not answer" as a step, not as a fault
//! (TXN-22): a write must not fail because a third party is down.

use std::{collections::HashMap, str::FromStr, time::Duration};

use chrono::NaiveDate;
use rust_decimal::Decimal;

/// How long the daily call may take. Nobody waits on it.
const TIMEOUT: Duration = Duration::from_secs(15);

#[derive(Clone)]
pub struct RatesClient {
    http: reqwest::Client,
    base_url: String,
    /// Without one the source refuses every call, so none is made.
    access_key: Option<String>,
}

impl std::fmt::Debug for RatesClient {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        // The key never reaches a log line (OPS-3).
        f.debug_struct("RatesClient")
            .field("base_url", &self.base_url)
            .field("keyed", &self.access_key.is_some())
            .finish()
    }
}

/// Every rate the source published for one day, against one base.
///
/// `rates` includes the base itself at 1, so a pair through the base needs
/// no special case when it is read back.
#[derive(Debug, Clone, PartialEq)]
pub struct Snapshot {
    pub base: String,
    pub date: NaiveDate,
    pub rates: HashMap<String, Decimal>,
}

impl RatesClient {
    pub fn new(base_url: String, access_key: Option<String>) -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(TIMEOUT)
                .build()
                .unwrap_or_default(),
            base_url,
            access_key,
        }
    }

    pub fn is_configured(&self) -> bool {
        self.access_key.is_some()
    }

    /// The latest rates for every currency, in one call.
    ///
    /// `None` covers every failure: no key, a network error, a non-200, a
    /// body that does not parse, or a body that reports failure.
    pub async fn latest(&self) -> Option<Snapshot> {
        let key = self.access_key.as_ref()?;
        let url = format!(
            "{}/latest?access_key={key}",
            self.base_url.trim_end_matches('/')
        );

        let response = match self.http.get(&url).send().await {
            Ok(response) => response,
            Err(error) => {
                // reqwest's error carries the URL, and the URL carries the key.
                let error = error.without_url();
                tracing::warn!(%error, "rate lookup failed");
                return None;
            }
        };

        if !response.status().is_success() {
            tracing::warn!(status = %response.status(), "rate source refused");
            return None;
        }

        let body: LatestResponse = match response.json().await {
            Ok(body) => body,
            Err(error) => {
                let error = error.without_url();
                tracing::warn!(%error, "rate source body did not parse");
                return None;
            }
        };

        body.into_snapshot()
    }
}

/// The Fixer response shape.
///
/// Rates are read as JSON numbers and turned into decimals through their
/// text, never through an `f64`, so `16250.5` is stored as exactly that
/// (D12).
#[derive(serde::Deserialize)]
struct LatestResponse {
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    error: Option<serde_json::Value>,
    base: Option<String>,
    date: Option<NaiveDate>,
    #[serde(default)]
    rates: HashMap<String, serde_json::Number>,
}

impl LatestResponse {
    fn into_snapshot(self) -> Option<Snapshot> {
        if self.success == Some(false) {
            // Quota spent, a bad key, a plan that lacks the endpoint. The
            // body says which; it carries no secret.
            tracing::warn!(error = ?self.error, "rate source reported failure");
            return None;
        }

        let base = self.base?;
        let date = self.date?;

        let mut rates: HashMap<String, Decimal> = self
            .rates
            .into_iter()
            .filter_map(|(code, value)| {
                let text = value.to_string();
                let rate = Decimal::from_str(&text)
                    .or_else(|_| Decimal::from_scientific(&text))
                    .ok()?;
                (rate > Decimal::ZERO).then_some((code, rate))
            })
            .collect();

        // The base is always 1 against itself; say so even if the body
        // left it out, so every pair can be read through it.
        rates.insert(base.clone(), Decimal::ONE);

        Some(Snapshot { base, date, rates })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn parse(body: &str) -> Option<Snapshot> {
        serde_json::from_str::<LatestResponse>(body)
            .unwrap()
            .into_snapshot()
    }

    #[test]
    fn should_read_a_fixer_body_exactly() {
        let snapshot = parse(
            r#"{"success":true,"timestamp":1793933886,"base":"EUR","date":"2026-11-06",
                "rates":{"EUR":1,"USD":1.120762,"IDR":20311.848588}}"#,
        )
        .unwrap();

        assert_eq!(snapshot.base, "EUR");
        assert_eq!(snapshot.date.to_string(), "2026-11-06");
        assert_eq!(
            snapshot.rates["IDR"],
            Decimal::from_str("20311.848588").unwrap()
        );
        assert_eq!(snapshot.rates["EUR"], Decimal::ONE);
    }

    #[test]
    fn should_read_a_rate_written_in_exponent_form() {
        let snapshot =
            parse(r#"{"base":"EUR","date":"2026-11-06","rates":{"BTC":1.07e-5}}"#).unwrap();
        assert_eq!(
            snapshot.rates["BTC"],
            Decimal::from_str("0.0000107").unwrap()
        );
    }

    #[test]
    fn should_add_the_base_when_the_body_leaves_it_out() {
        let snapshot = parse(r#"{"base":"EUR","date":"2026-11-06","rates":{"USD":1.12}}"#).unwrap();
        assert_eq!(snapshot.rates["EUR"], Decimal::ONE);
    }

    #[test]
    fn should_drop_a_rate_that_is_not_positive() {
        let snapshot = parse(r#"{"base":"EUR","date":"2026-11-06","rates":{"IDR":0}}"#).unwrap();
        assert!(!snapshot.rates.contains_key("IDR"));
    }

    #[test]
    fn should_answer_none_when_the_source_reports_failure() {
        let body = r#"{"success":false,"error":{"code":104,"type":"usage_limit_reached"}}"#;
        assert_eq!(parse(body), None);
    }

    #[tokio::test]
    async fn should_make_no_call_without_a_key() {
        let client = RatesClient::new("http://rates.invalid".into(), None);
        assert!(!client.is_configured());
        assert_eq!(client.latest().await, None);
    }

    #[test]
    fn should_not_print_the_access_key() {
        let client = RatesClient::new("https://rates.test".into(), Some("sk-secret".into()));
        assert!(!format!("{client:?}").contains("sk-secret"));
    }
}
