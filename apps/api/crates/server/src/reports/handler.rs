//! Report routes.
//!
//! Parse the range, call one builder, wrap it in the envelope. The workspace
//! is the token's, never the query's (AUTH-4).

use axum::{
    extract::{Query, State},
    Json,
};
use chrono::NaiveDate;
use oewang_domain::{AppError, Envelope, Result};
use serde::Deserialize;

use crate::{
    auth::extractor::Auth,
    reports::service::{self, DayRange, Overview},
    response::{ApiError, RequestId},
    state::AppState,
};

/// `?from=2026-01-01&to=2026-12-31`. Both required: the page always knows
/// its range, and a default chosen here would drift from the one the date
/// picker shows. Strings rather than dates, so a malformed day answers in
/// the error envelope instead of the extractor's plain-text rejection.
#[derive(Debug, Deserialize)]
pub struct RangeQuery {
    pub from: Option<String>,
    pub to: Option<String>,
}

impl RangeQuery {
    fn range(&self) -> Result<DayRange> {
        DayRange::new(day("from", &self.from)?, day("to", &self.to)?)
    }
}

fn day(field: &'static str, raw: &Option<String>) -> Result<NaiveDate> {
    raw.as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .ok_or_else(|| AppError::validation([(field, "This parameter is required.")]))?
        .parse()
        .map_err(|_| AppError::validation([(field, "Use a date like 2026-11-02.")]))
}

/// The overview page's figures (OVR-2, OVR-3). Any member may read them.
pub async fn overview(
    State(state): State<AppState>,
    auth: Auth,
    request_id: RequestId,
    Query(query): Query<RangeQuery>,
) -> std::result::Result<Json<Envelope<Overview>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let range = query.range()?;
        service::overview(&state.db, &auth.workspace_id, range).await
    }
    .await;

    match result {
        Ok(view) => Ok(Json(Envelope::data(view, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
