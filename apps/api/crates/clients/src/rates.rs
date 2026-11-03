//! The daily exchange-rate source (D44).
//!
//! Called from a configured base URL. No endpoint ever fetches a
//! user-supplied URL, so the pair codes are the only thing that varies and
//! they are validated before they get here.
//!
//! Every failure is a `None`, never an error that propagates. The rate
//! ladder treats "the source did not answer" as a step, not as a fault
//! (TXN-22): a write must not fail because a third party is down.

use std::{collections::HashMap, time::Duration};

use chrono::NaiveDate;
use rust_decimal::Decimal;

/// How long one lookup may take before the ladder moves on to the cache.
///
/// Short on purpose: this call sits in front of a user waiting for a
/// transaction to save, and the next step down is a local read.
const TIMEOUT: Duration = Duration::from_secs(4);

#[derive(Clone)]
pub struct RatesClient {
    http: reqwest::Client,
    base_url: String,
    /// Only the paid plans need one. Absent is normal.
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

    /// One rate, for one pair, on one day. One `base` buys `rate` `quote`.
    ///
    /// `None` covers every failure: a network error, a non-200, a body that
    /// does not parse, a missing pair, or a rate that is not positive.
    pub async fn rate(&self, base: &str, quote: &str, date: NaiveDate) -> Option<Decimal> {
        let url = self.url(base, quote, date);

        let response = match self.http.get(&url).send().await {
            Ok(response) => response,
            Err(error) => {
                // The URL is not logged: it may carry the key.
                tracing::warn!(%base, %quote, %date, %error, "rate lookup failed");
                return None;
            }
        };

        if !response.status().is_success() {
            tracing::warn!(%base, %quote, status = %response.status(), "rate source refused");
            return None;
        }

        let body: RateResponse = match response.json().await {
            Ok(body) => body,
            Err(error) => {
                tracing::warn!(%base, %quote, %error, "rate source body did not parse");
                return None;
            }
        };

        body.find(base, quote)
    }

    /// The historical endpoint, in whichever dialect this deployment speaks.
    ///
    /// The keyless endpoint takes `base`/`symbols` on a dated path; the
    /// keyed one takes `source`/`currencies` on `/historical`. Both are
    /// exchangerate.host, and which one a host answers depends on its plan,
    /// so the client sends what matches the key it was given.
    fn url(&self, base: &str, quote: &str, date: NaiveDate) -> String {
        let root = self.base_url.trim_end_matches('/');

        match &self.access_key {
            Some(key) => format!(
                "{root}/historical?date={date}&source={base}&currencies={quote}&access_key={key}"
            ),
            None => format!("{root}/{date}?base={base}&symbols={quote}"),
        }
    }
}

/// Both response dialects, read through one struct.
///
/// `rates` is keyed by the quote code (`{"IDR": 16250}`), `quotes` by the
/// two codes joined (`{"USDIDR": 16250}`). Accepting both means the client
/// does not have to be reconfigured when a plan changes.
#[derive(serde::Deserialize)]
struct RateResponse {
    #[serde(default)]
    success: Option<bool>,
    #[serde(default)]
    rates: HashMap<String, f64>,
    #[serde(default)]
    quotes: HashMap<String, f64>,
}

impl RateResponse {
    fn find(&self, base: &str, quote: &str) -> Option<Decimal> {
        if self.success == Some(false) {
            return None;
        }

        let value = self
            .quotes
            .get(&format!("{base}{quote}"))
            .or_else(|| self.rates.get(quote))?;

        let rate = Decimal::try_from(*value).ok()?;
        (rate > Decimal::ZERO).then_some(rate)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn date() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 2).unwrap()
    }

    #[test]
    fn should_read_the_keyless_dialect() {
        let body: RateResponse =
            serde_json::from_str(r#"{"success":true,"rates":{"IDR":16250.5}}"#).unwrap();
        assert_eq!(
            body.find("USD", "IDR"),
            Some(Decimal::try_from(16250.5).unwrap())
        );
    }

    #[test]
    fn should_read_the_keyed_dialect() {
        let body: RateResponse =
            serde_json::from_str(r#"{"success":true,"quotes":{"USDIDR":16250}}"#).unwrap();
        assert_eq!(body.find("USD", "IDR"), Some(Decimal::from(16250)));
    }

    #[test]
    fn should_answer_none_for_a_pair_the_body_does_not_carry() {
        let body: RateResponse = serde_json::from_str(r#"{"rates":{"EUR":0.9}}"#).unwrap();
        assert_eq!(body.find("USD", "IDR"), None);
    }

    #[test]
    fn should_answer_none_when_the_source_reports_failure() {
        let body: RateResponse =
            serde_json::from_str(r#"{"success":false,"rates":{"IDR":16250}}"#).unwrap();
        assert_eq!(body.find("USD", "IDR"), None);
    }

    #[test]
    fn should_answer_none_for_a_rate_that_is_not_positive() {
        let body: RateResponse = serde_json::from_str(r#"{"rates":{"IDR":0}}"#).unwrap();
        assert_eq!(body.find("USD", "IDR"), None);
    }

    #[test]
    fn should_switch_dialect_on_whether_a_key_is_configured() {
        let keyless = RatesClient::new("https://rates.test/".into(), None);
        assert_eq!(
            keyless.url("USD", "IDR", date()),
            "https://rates.test/2026-11-02?base=USD&symbols=IDR"
        );

        let keyed = RatesClient::new("https://rates.test".into(), Some("k".into()));
        assert!(keyed
            .url("USD", "IDR", date())
            .contains("/historical?date=2026-11-02"));
    }

    #[test]
    fn should_not_print_the_access_key() {
        let client = RatesClient::new("https://rates.test".into(), Some("sk-secret".into()));
        assert!(!format!("{client:?}").contains("sk-secret"));
    }
}
