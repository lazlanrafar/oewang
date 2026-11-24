//! `/v1/debts` and `/v1/transactions/{id}/debts` (DEBT-1 to DEBT-12).

use axum::{
    extract::{Path, Query, State},
    http::StatusCode,
    Json,
};
use chrono::{DateTime, NaiveDate, Utc};
use oewang_db::repositories::debts::{
    DebtFilters, DebtListRow, DebtSort, PaymentDetailRow, PaymentRow,
};
use oewang_domain::{format_money, AppError, Envelope, Page, PageMeta, Result};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::{Auth, AuthWrite},
    contacts::handler::{descending, explicit_null, non_empty},
    debts::service::{
        self, BulkItem, DebtChange, DebtInput, NewExpense, Paid, PayInput, SplitSource,
    },
    offline::{self, IfMatch},
    response::{ApiError, RequestId},
    state::AppState,
    transactions::handler::TransactionView,
};

// ------------------------------------------------------------------ bodies

#[derive(Debug, Deserialize)]
pub struct ListQuery {
    pub search: Option<String>,
    /// Comma-separated: `unpaid`, `partial`, `paid`.
    pub status: Option<String>,
    pub r#type: Option<String>,
    pub contact_id: Option<String>,
    /// The person's local date, `YYYY-MM-DD`; the UTC date when absent.
    pub today: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<u32>,
    pub per_page: Option<u32>,
}

#[derive(Debug, Deserialize)]
pub struct TodayQuery {
    pub today: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateBody {
    pub id: Option<String>,
    pub r#type: String,
    pub contact_id: String,
    /// A decimal string, never a number (D12).
    pub amount: String,
    pub currency_code: Option<String>,
    pub due_date: Option<NaiveDate>,
    pub description: Option<String>,
    pub source_transaction_id: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBody {
    pub contact_id: Option<String>,
    pub r#type: Option<String>,
    pub currency_code: Option<String>,
    pub amount: Option<String>,
    #[serde(default, deserialize_with = "explicit_null")]
    pub description: Option<Option<String>>,
    #[serde(default, deserialize_with = "explicit_null")]
    pub due_date: Option<Option<NaiveDate>>,
}

#[derive(Debug, Deserialize)]
pub struct PayBody {
    pub id: Option<String>,
    pub amount: String,
    pub wallet_id: Option<String>,
    pub date: Option<DateTime<Utc>>,
    pub exchange_rate: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkPayBody {
    pub wallet_id: Option<String>,
    pub date: Option<DateTime<Utc>>,
    pub payments: Vec<BulkPayItem>,
}

#[derive(Debug, Deserialize)]
pub struct BulkPayItem {
    pub id: Option<String>,
    pub debt_id: String,
    pub amount: String,
}

#[derive(Debug, Deserialize)]
pub struct SplitBody {
    pub transaction_id: Option<String>,
    pub wallet_id: Option<String>,
    pub amount: Option<String>,
    pub name: Option<String>,
    pub category_id: Option<String>,
    pub date: Option<DateTime<Utc>>,
    #[serde(default)]
    pub contact_names: Vec<String>,
    #[serde(default)]
    pub contact_ids: Vec<String>,
}

// ------------------------------------------------------------------- views

/// Every figure computed here, with a `_formatted` twin (D12, D27).
#[derive(Debug, Serialize)]
pub struct DebtView {
    pub id: String,
    pub contact_id: String,
    pub contact_name: String,
    pub source_transaction_id: Option<String>,
    pub r#type: String,
    pub origin: String,
    pub currency_code: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub amount_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub remaining_amount: Decimal,
    pub remaining_amount_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub paid_amount: Decimal,
    pub paid_amount_formatted: String,
    pub status: String,
    pub overdue: bool,
    pub description: Option<String>,
    pub due_date: Option<String>,
    pub created_at: String,
    /// The row's version: send it back verbatim as `If-Match` (D115).
    pub updated_at: String,
}

impl DebtView {
    fn new(row: DebtListRow, today: NaiveDate) -> Self {
        let paid = row.amount - row.remaining_amount;
        let money = |value: Decimal| format_money(value, &row.currency_code, false);
        Self {
            amount_formatted: money(row.amount),
            remaining_amount_formatted: money(row.remaining_amount),
            paid_amount_formatted: money(paid),
            paid_amount: paid,
            overdue: row.status != "paid" && row.due_date.is_some_and(|due| due < today),
            id: row.id,
            contact_id: row.contact_id,
            contact_name: row.contact_name,
            source_transaction_id: row.source_transaction_id,
            r#type: row.r#type,
            origin: row.origin,
            amount: row.amount,
            remaining_amount: row.remaining_amount,
            status: row.status,
            description: row.description,
            due_date: row.due_date.map(|d| d.to_string()),
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
            currency_code: row.currency_code,
        }
    }
}

impl From<DebtListRow> for DebtView {
    fn from(row: DebtListRow) -> Self {
        Self::new(row, Utc::now().date_naive())
    }
}

#[derive(Debug, Serialize)]
pub struct PaymentView {
    pub id: String,
    pub debt_id: String,
    pub transaction_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub wallet_id: Option<String>,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub amount_formatted: String,
    pub date: String,
    pub created_at: String,
}

impl PaymentView {
    fn from_row(row: PaymentRow, currency_code: &str) -> Self {
        Self {
            amount_formatted: format_money(row.amount, currency_code, false),
            id: row.id,
            debt_id: row.debt_id,
            transaction_id: row.transaction_id,
            wallet_id: None,
            amount: row.amount,
            date: row.date.to_rfc3339(),
            created_at: row.created_at.to_rfc3339(),
        }
    }

    fn from_detail(row: PaymentDetailRow, currency_code: &str) -> Self {
        Self {
            amount_formatted: format_money(row.amount, currency_code, false),
            id: row.id,
            debt_id: row.debt_id,
            transaction_id: row.transaction_id,
            wallet_id: row.wallet_id,
            amount: row.amount,
            date: row.date.to_rfc3339(),
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct DebtDetailView {
    #[serde(flatten)]
    pub debt: DebtView,
    pub payments: Vec<PaymentView>,
    pub source_transaction: Option<TransactionView>,
}

#[derive(Debug, Serialize)]
pub struct PaidView {
    pub payment: PaymentView,
    pub debt: DebtView,
    pub transaction: Option<TransactionView>,
}

impl From<Paid> for PaidView {
    fn from(paid: Paid) -> Self {
        Self {
            payment: PaymentView::from_row(paid.payment, &paid.debt.currency_code),
            debt: paid.debt.into(),
            transaction: paid.transaction.map(Into::into),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SplitView {
    pub transaction: TransactionView,
    pub debts: Vec<DebtView>,
}

#[derive(Debug, Serialize)]
pub struct SettledView {
    pub payment: PaymentView,
    pub debt: DebtView,
}

#[derive(Debug, Serialize)]
pub struct TransactionDebtsView {
    /// Debts made from this transaction.
    pub debts: Vec<DebtView>,
    /// The payment this transaction is, if it is one.
    pub payment: Option<SettledView>,
}

// ------------------------------------------------------------------ routes

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<DebtView>>>, ApiError> {
    let id = request_id.0;
    let result = async {
        let today = today(&query.today)?;
        let statuses = match non_empty(&query.status) {
            None => Vec::new(),
            Some(raw) => raw
                .split(',')
                .map(|value| match value.trim() {
                    status @ ("unpaid" | "partial" | "paid") => Ok(status.to_string()),
                    _ => Err(AppError::validation([(
                        "status",
                        "Use unpaid, partial or paid.",
                    )])),
                })
                .collect::<Result<Vec<_>>>()?,
        };
        let kind = match non_empty(&query.r#type) {
            None => None,
            Some(kind @ ("payable" | "receivable")) => Some(kind),
            Some(_) => {
                return Err(AppError::validation([(
                    "type",
                    "Use payable or receivable.",
                )]))
            }
        };
        let sort = match non_empty(&query.sort) {
            None | Some("due_date") => DebtSort::DueDate,
            Some("amount") => DebtSort::Amount,
            Some("remaining") => DebtSort::Remaining,
            Some("created_at") => DebtSort::CreatedAt,
            Some("contact") => DebtSort::Contact,
            Some(_) => {
                return Err(AppError::validation([(
                    "sort",
                    "Use due_date, amount, remaining, created_at or contact.",
                )]))
            }
        };
        let filters = DebtFilters {
            search: non_empty(&query.search),
            statuses,
            kind,
            contact_id: non_empty(&query.contact_id),
        };
        let page = Page::new(query.page, query.per_page);
        let (rows, total) = service::list(
            &state.db,
            &auth.workspace_id,
            &filters,
            sort,
            descending(&query.order)?,
            page,
        )
        .await?;
        Ok((rows, total, page, today))
    }
    .await;

    match result {
        Ok((rows, total, page, today)) => Ok(Json(Envelope::paged(
            rows.into_iter()
                .map(|row| DebtView::new(row, today))
                .collect(),
            id,
            PageMeta::new(page.page, page.limit, total as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn summary(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<TodayQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<service::DebtSummary>>, ApiError> {
    let result = async {
        let today = today(&query.today)?;
        service::summary(&state.db, &auth.workspace_id, today).await
    }
    .await;
    ok(result, request_id)
}

pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
    Path(debt_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<DebtDetailView>>, ApiError> {
    let result = async {
        let debt = service::find(&state.db, &auth.workspace_id, &debt_id).await?;
        let payments = service::payments(&state.db, &auth.workspace_id, &debt_id).await?;
        let source = match &debt.source_transaction_id {
            Some(tx_id) => crate::transactions::service::find(&state.db, &auth.workspace_id, tx_id)
                .await
                .ok(),
            None => None,
        };
        let currency = debt.currency_code.clone();
        Ok(DebtDetailView {
            debt: debt.into(),
            payments: payments
                .into_iter()
                .map(|p| PaymentView::from_detail(p, &currency))
                .collect(),
            source_transaction: source.map(Into::into),
        })
    }
    .await;
    ok(result, request_id)
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<CreateBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<DebtView>>), ApiError> {
    let result = async {
        let input = DebtInput {
            kind: &body.r#type,
            contact_id: body.contact_id.trim(),
            amount: money("amount", &body.amount)?,
            currency_code: non_empty(&body.currency_code),
            due_date: body.due_date,
            description: body.description.as_deref(),
            source_transaction_id: non_empty(&body.source_transaction_id),
        };
        service::create_with_id(&state.db, auth.actor(), body.id.as_deref(), input).await
    }
    .await;
    created_once(result, request_id)
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(debt_id): Path<String>,
    request_id: RequestId,
    if_match: IfMatch,
    Json(body): Json<UpdateBody>,
) -> std::result::Result<Json<Envelope<DebtView>>, ApiError> {
    let updated = async {
        let change = DebtChange {
            contact_id: non_empty(&body.contact_id),
            kind: non_empty(&body.r#type),
            currency_code: non_empty(&body.currency_code),
            amount: body
                .amount
                .as_deref()
                .map(|raw| money("amount", raw))
                .transpose()?,
            description: body.description.as_ref().map(|v| v.as_deref()),
            due_date: body.due_date,
        };
        service::update(&state.db, auth.actor(), &debt_id, change, if_match.0).await
    }
    .await;
    let current = async {
        service::find(&state.db, &auth.workspace_id, &debt_id)
            .await
            .map(DebtView::from)
    };
    ok(
        offline::with_current(updated, current)
            .await
            .map(DebtView::from),
        request_id,
    )
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(debt_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    no_content(
        service::delete(&state.db, auth.actor(), &debt_id).await,
        request_id,
    )
}

pub async fn pay(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(debt_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<PayBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<PaidView>>), ApiError> {
    let result = async {
        let input = PayInput {
            amount: money("amount", &body.amount)?,
            wallet_id: non_empty(&body.wallet_id),
            date: body.date.unwrap_or_else(Utc::now),
            exchange_rate: non_empty(&body.exchange_rate)
                .map(|raw| money("exchange_rate", raw))
                .transpose()?,
        };
        service::pay(&state.db, auth.actor(), &debt_id, body.id.as_deref(), input).await
    }
    .await;
    created_once(result, request_id)
}

pub async fn cancel_payment(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path((debt_id, payment_id)): Path<(String, String)>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    no_content(
        service::cancel_payment(&state.db, auth.actor(), &debt_id, &payment_id).await,
        request_id,
    )
}

pub async fn bulk_pay(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<BulkPayBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<Vec<PaidView>>>), ApiError> {
    let result = async {
        let items = body
            .payments
            .iter()
            .map(|item| {
                Ok(BulkItem {
                    id: item.id.as_deref(),
                    debt_id: item.debt_id.trim(),
                    amount: money("amount", &item.amount)?,
                })
            })
            .collect::<Result<Vec<_>>>()?;
        let date = body.date.unwrap_or_else(Utc::now);
        service::bulk_pay(
            &state.db,
            auth.actor(),
            non_empty(&body.wallet_id),
            date,
            &items,
        )
        .await
    }
    .await;
    let id = request_id.0;
    match result {
        Ok((paid, made)) => Ok((
            if made {
                StatusCode::CREATED
            } else {
                StatusCode::OK
            },
            Json(Envelope::data(
                paid.into_iter().map(Into::into).collect(),
                id,
            )),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn split(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<SplitBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<SplitView>>), ApiError> {
    let result = async {
        let source = match non_empty(&body.transaction_id) {
            Some(transaction_id) => SplitSource::Existing(transaction_id),
            None => {
                let missing = || {
                    AppError::validation([(
                        "transaction_id",
                        "Send a transaction_id, or wallet_id, amount, name and date.",
                    )])
                };
                SplitSource::New(NewExpense {
                    wallet_id: non_empty(&body.wallet_id).ok_or_else(missing)?,
                    amount: money("amount", body.amount.as_deref().ok_or_else(missing)?)?,
                    name: non_empty(&body.name).ok_or_else(missing)?,
                    category_id: non_empty(&body.category_id),
                    date: body.date.ok_or_else(missing)?,
                })
            }
        };
        service::split(
            &state.db,
            auth.actor(),
            source,
            &body.contact_ids,
            &body.contact_names,
        )
        .await
    }
    .await;
    let id = request_id.0;
    match result {
        Ok((transaction, debts)) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(
                SplitView {
                    transaction: transaction.into(),
                    debts: debts.into_iter().map(Into::into).collect(),
                },
                id,
            )),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// `GET /v1/transactions/{id}/debts` (DEBT-12).
pub async fn for_transaction(
    State(state): State<AppState>,
    auth: Auth,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<TransactionDebtsView>>, ApiError> {
    let result = service::for_transaction(&state.db, &auth.workspace_id, &transaction_id)
        .await
        .map(|(debts, settled)| TransactionDebtsView {
            debts: debts.into_iter().map(Into::into).collect(),
            payment: settled.map(|(payment, debt)| SettledView {
                payment: PaymentView::from_row(payment, &debt.currency_code),
                debt: debt.into(),
            }),
        });
    ok(result, request_id)
}

// ----------------------------------------------------------------- helpers

fn today(raw: &Option<String>) -> Result<NaiveDate> {
    match non_empty(raw) {
        None => Ok(Utc::now().date_naive()),
        Some(value) => value
            .parse()
            .map_err(|_| AppError::validation([("today", "Use a date like 2026-11-24.")])),
    }
}

/// Parsed, never deserialized through a float (D12).
fn money(field: &'static str, raw: &str) -> Result<Decimal> {
    raw.trim()
        .parse::<Decimal>()
        .map_err(|_| AppError::validation([(field, "Enter a number, for example 50000.")]))
}

fn ok<V>(
    result: Result<V>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<V>>, ApiError> {
    let id = request_id.0;
    match result {
        Ok(value) => Ok(Json(Envelope::data(value, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// 201 when this call made the row, 200 for a repeat (D114).
fn created_once<R, V: From<R>>(
    result: Result<(R, bool)>,
    request_id: RequestId,
) -> std::result::Result<(StatusCode, Json<Envelope<V>>), ApiError> {
    let id = request_id.0;
    match result {
        Ok((row, made)) => Ok((
            if made {
                StatusCode::CREATED
            } else {
                StatusCode::OK
            },
            Json(Envelope::data(V::from(row), id)),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

fn no_content(
    result: Result<()>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    match result {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, request_id.0)),
    }
}
