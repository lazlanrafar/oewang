//! `GET /v1/fx/rate`: a rate suggestion for the form (TXN-20).
//!
//! The response is a suggestion and nothing more. The rate the user
//! confirms is sent back on the transaction and stored there, because a
//! bank's rate is not the market rate (D39). No read path consults this
//! endpoint: `base_amount` was computed at write time.

use axum::extract::{Query, State};
use axum::Json;
use chrono::{NaiveDate, Utc};
use oewang_domain::{validate_currency_code, AppError, Envelope};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::Auth,
    fx::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct RateQuery {
    pub from: String,
    pub to: String,
    /// Defaults to today, which is what the form asks for.
    pub date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RateView {
    pub from: String,
    pub to: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub rate: Decimal,
    /// `same`, `user`, `live` or `cache`. The form says so when it is
    /// `cache`, because the number is then older than it looks.
    pub source: String,
    pub date: String,
}

pub async fn rate(
    State(state): State<AppState>,
    _auth: Auth,
    Query(query): Query<RateQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<RateView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let from = validate_currency_code("from", &query.from)?;
        let to = validate_currency_code("to", &query.to)?;

        let date = match query
            .date
            .as_deref()
            .map(str::trim)
            .filter(|d| !d.is_empty())
        {
            Some(value) => value
                .parse::<NaiveDate>()
                .map_err(|_| AppError::validation([("date", "Use a date like 2026-11-02.")]))?,
            None => Utc::now().date_naive(),
        };

        let resolved = service::suggest(&state.db, &state.rates, &from, &to, date).await?;

        Ok::<_, AppError>(RateView {
            from,
            to,
            rate: resolved.rate,
            source: resolved.source.as_str().to_string(),
            date: resolved.date.to_string(),
        })
    }
    .await;

    match result {
        Ok(view) => Ok(Json(Envelope::data(view, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
