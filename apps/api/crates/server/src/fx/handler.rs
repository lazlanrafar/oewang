//! `GET /v1/fx/rate`: a rate suggestion for the form (TXN-20).
//! `GET /v1/fx/rates`: the stored daily snapshot, for reading (FX-1).
//! `GET /v1/fx/currencies`: every currency in it, for the pickers (FX-2).
//!
//! The response is a suggestion and nothing more. The rate the user
//! confirms is sent back on the transaction and stored there, because a
//! bank's rate is not the market rate (D39). No read path consults this
//! endpoint: `base_amount` was computed at write time.

use axum::extract::{Query, State};
use axum::Json;
use chrono::{NaiveDate, Utc};
use oewang_db::repositories::fx::{SnapshotFilters, SnapshotRateRow, SnapshotSort};
use oewang_domain::{validate_currency_code, AppError, Envelope, Page, PageMeta};
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

        let resolved = service::suggest(&state.db, &from, &to, date).await?;

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

#[derive(Debug, Deserialize)]
pub struct RatesQuery {
    /// Part of a currency code.
    pub search: Option<String>,
    /// The newest snapshot on or before this day. Defaults to the newest.
    pub date: Option<String>,
    /// `code` (default) or `rate`.
    pub sort: Option<String>,
    /// `asc` (default for `code`) or `desc`.
    pub order: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

impl RatesQuery {
    fn filters(&self) -> oewang_domain::Result<SnapshotFilters<'_>> {
        let on_or_before =
            match non_empty(&self.date) {
                None => None,
                Some(value) => Some(value.parse::<NaiveDate>().map_err(|_| {
                    AppError::validation([("date", "Use a date like 2026-11-02.")])
                })?),
            };
        Ok(SnapshotFilters {
            search: non_empty(&self.search),
            on_or_before,
        })
    }

    fn sort(&self) -> oewang_domain::Result<SnapshotSort> {
        let descending = match non_empty(&self.order) {
            None | Some("asc") => false,
            Some("desc") => true,
            Some(_) => return Err(AppError::validation([("order", "Use asc or desc.")])),
        };
        Ok(match (non_empty(&self.sort), descending) {
            (None | Some("code"), false) => SnapshotSort::CodeAsc,
            (None | Some("code"), true) => SnapshotSort::CodeDesc,
            (Some("rate"), false) => SnapshotSort::RateAsc,
            (Some("rate"), true) => SnapshotSort::RateDesc,
            (Some(_), _) => return Err(AppError::validation([("sort", "Use code or rate.")])),
        })
    }
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[derive(Debug, Serialize)]
pub struct SnapshotRateView {
    /// The currency code doubles as the row id: one row per currency.
    pub id: String,
    pub currency_code: String,
    /// The workspace currency every rate is expressed in.
    pub home_code: String,
    /// One `currency_code` is worth this much `home_code`.
    #[serde(with = "rust_decimal::serde::str")]
    pub rate: Decimal,
    /// One `home_code` is worth this much `currency_code`.
    #[serde(with = "rust_decimal::serde::str")]
    pub inverse: Decimal,
    /// The snapshot's day, which may be older than the one asked for.
    pub date: String,
}

impl SnapshotRateView {
    fn new(row: SnapshotRateRow, home_code: &str) -> Self {
        Self {
            id: row.currency_code.clone(),
            currency_code: row.currency_code,
            home_code: home_code.to_string(),
            rate: row.rate,
            inverse: row.inverse,
            date: row.date.to_string(),
        }
    }
}

pub async fn rates(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<RatesQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<SnapshotRateView>>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let sort = query.sort()?;
        let page = Page::new(query.page, query.limit);
        let (home, rows, total) =
            service::list_rates(&state.db, &auth.workspace_id, &filters, sort, page).await?;
        Ok::<_, AppError>((home, rows, total, page))
    }
    .await;

    match result {
        Ok((home, rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter()
                .map(|row| SnapshotRateView::new(row, &home))
                .collect(),
            id,
            PageMeta::new(page.page, page.limit, total.max(0) as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Every currency the pickers offer, with its rate against the workspace
/// currency (FX-2). The same row as the rates list; the home currency comes
/// first, at rate one.
pub async fn currencies(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<SnapshotRateView>>>, ApiError> {
    let id = request_id.0;

    match service::list_currencies(&state.db, &auth.workspace_id).await {
        Ok((home, rows)) => Ok(Json(Envelope::data(
            rows.into_iter()
                .map(|row| SnapshotRateView::new(row, &home))
                .collect(),
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
