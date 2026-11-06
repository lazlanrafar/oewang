//! `/v1/budgets` (BUD-1 to BUD-3).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, Utc};
use oewang_db::repositories::budgets::BudgetRow;
use oewang_domain::{budget::Month, AppError, Envelope, Result};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    audit::Actor,
    auth::extractor::{Auth, AuthWrite},
    budgets::service::{self, BudgetStatus, Sort, SortField},
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct StatusQuery {
    /// `YYYY-MM`; the current month when absent.
    pub month: Option<String>,
    pub search: Option<String>,
    /// `category` (default), `amount`, `spent`, `remaining` or `percent`.
    pub sort: Option<String>,
    /// `asc` (default) or `desc`.
    pub order: Option<String>,
}

impl StatusQuery {
    fn month(&self) -> Result<Month> {
        match non_empty(&self.month) {
            None => Ok(Month::containing(Utc::now())),
            Some(raw) => Month::parse(raw).ok_or_else(|| {
                AppError::validation([("month", "Use YYYY-MM, for example 2026-11.")])
            }),
        }
    }

    fn sort(&self) -> Result<Sort> {
        let field = match non_empty(&self.sort) {
            None | Some("category") => SortField::Category,
            Some("amount") => SortField::Amount,
            Some("spent") => SortField::Spent,
            Some("remaining") => SortField::Remaining,
            Some("percent") => SortField::Percent,
            Some(_) => {
                return Err(AppError::validation([(
                    "sort",
                    "Use category, amount, spent, remaining or percent.",
                )]))
            }
        };
        let descending = match non_empty(&self.order) {
            None | Some("asc") => false,
            Some("desc") => true,
            Some(_) => return Err(AppError::validation([("order", "Use asc or desc.")])),
        };
        Ok(Sort { field, descending })
    }
}

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub category_id: String,
    /// A decimal string, never a number (D12).
    pub amount: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBody {
    pub amount: String,
}

#[derive(Debug, Serialize)]
pub struct BudgetView {
    pub id: String,
    pub category_id: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub created_at: String,
    pub updated_at: String,
}

impl From<BudgetRow> for BudgetView {
    fn from(row: BudgetRow) -> Self {
        Self {
            id: row.id,
            category_id: row.category_id,
            amount: row.amount,
            created_at: stamp(row.created_at),
            updated_at: stamp(row.updated_at),
        }
    }
}

pub async fn status(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<StatusQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<BudgetStatus>>, ApiError> {
    let id = request_id.0;
    let result = async {
        let month = query.month()?;
        let sort = query.sort()?;
        service::status(
            &state.db,
            &auth.workspace_id,
            month,
            non_empty(&query.search),
            sort,
        )
        .await
    }
    .await;

    match result {
        Ok(status) => Ok(Json(Envelope::data(status, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<CreateBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<BudgetView>>), ApiError> {
    let id = request_id.0;
    let result = async {
        let amount = money(&body.amount)?;
        service::create(&state.db, actor(&auth), body.category_id.trim(), amount).await
    }
    .await;

    match result {
        Ok(row) => Ok((StatusCode::CREATED, Json(Envelope::data(row.into(), id)))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(budget_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<UpdateBody>,
) -> std::result::Result<Json<Envelope<BudgetView>>, ApiError> {
    let id = request_id.0;
    let result = async {
        let amount = money(&body.amount)?;
        service::update(&state.db, actor(&auth), &budget_id, amount).await
    }
    .await;

    match result {
        Ok(row) => Ok(Json(Envelope::data(row.into(), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(budget_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    match service::delete(&state.db, actor(&auth), &budget_id).await {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}

fn actor(auth: &AuthWrite) -> Actor<'_> {
    auth.actor()
}

/// Parsed, never deserialized through a float (D12).
fn money(raw: &str) -> Result<Decimal> {
    raw.trim()
        .parse::<Decimal>()
        .map_err(|_| AppError::validation([("amount", "Enter a number, for example 500000.")]))
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

fn stamp(value: DateTime<Utc>) -> String {
    value.to_rfc3339()
}
