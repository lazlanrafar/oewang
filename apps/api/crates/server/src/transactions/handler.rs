//! Transaction routes.
//!
//! Handlers parse, call one service and map to HTTP. Query parameters are
//! parsed into typed filters here; the enum that reaches the repository is
//! what keeps a sort out of the SQL string (SEC-10).

use axum::{
    extract::{Path, Query, State},
    http::{header, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use oewang_db::repositories::{
    audit::AuditRow,
    transactions::{SortField, SortOrder, TransactionFilters, TransactionListRow},
};
use oewang_domain::{ledger::TransactionType, AppError, Envelope, PageMeta, Result};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    audit::Actor,
    auth::extractor::{Auth, AuthWrite},
    response::{ApiError, RequestId},
    state::AppState,
    transactions::service::{self, Page, TransactionInput},
};

// ------------------------------------------------------------------- views

/// One row as the table renders it.
///
/// Every money field is a string (D12). `wallet_currency_code` is what
/// `amount` is denominated in; `original_*` is what the user typed when the
/// two differed (TXN-21).
#[derive(Debug, Serialize)]
pub struct TransactionView {
    pub id: String,
    pub wallet_id: String,
    pub wallet_name: String,
    pub wallet_currency_code: String,
    pub to_wallet_id: Option<String>,
    pub to_wallet_name: Option<String>,
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub to_amount: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub original_amount: Option<Decimal>,
    pub original_currency_code: Option<String>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub exchange_rate: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str")]
    pub base_amount: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub base_rate: Decimal,
    pub base_rate_source: String,
    pub base_rate_date: String,
    /// True when the row was written on a cached rate from another day, so
    /// the list can mark it and name the rate's date (TXN-22).
    pub base_rate_is_stale: bool,
    pub date: String,
    pub r#type: String,
    pub name: Option<String>,
    pub description: Option<String>,
    pub is_ready: bool,
    pub is_exported: bool,
    pub source: String,
    pub created_at: String,
}

impl From<TransactionListRow> for TransactionView {
    fn from(row: TransactionListRow) -> Self {
        // The same rule the resolution ladder uses, not a second copy of it.
        let stale = row
            .base_rate_source
            .parse::<oewang_domain::ledger::RateSource>()
            .is_ok_and(|source| source.is_stale(row.base_rate_date, row.date.date_naive()));

        Self {
            id: row.id,
            wallet_id: row.wallet_id,
            wallet_name: row.wallet_name,
            wallet_currency_code: row.wallet_currency_code,
            to_wallet_id: row.to_wallet_id,
            to_wallet_name: row.to_wallet_name,
            category_id: row.category_id,
            category_name: row.category_name,
            amount: row.amount,
            to_amount: row.to_amount,
            original_amount: row.original_amount,
            original_currency_code: row.original_currency_code,
            exchange_rate: row.exchange_rate,
            base_amount: row.base_amount,
            base_rate: row.base_rate,
            base_rate_source: row.base_rate_source,
            base_rate_date: row.base_rate_date.to_string(),
            base_rate_is_stale: stale,
            date: row.date.to_rfc3339(),
            r#type: row.r#type,
            name: row.name,
            description: row.description,
            is_ready: row.is_ready,
            is_exported: row.is_exported,
            source: row.source,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct SummaryView {
    pub currency_code: String,
    pub by_type: Vec<TypeTotal>,
    pub by_category: Vec<CategoryTotal>,
}

#[derive(Debug, Serialize)]
pub struct TypeTotal {
    pub r#type: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub total: Decimal,
    pub count: i64,
}

#[derive(Debug, Serialize)]
pub struct CategoryTotal {
    pub category_id: Option<String>,
    pub category_name: Option<String>,
    pub r#type: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub total: Decimal,
}

/// One line item (TXN-12).
#[derive(Debug, Serialize)]
pub struct ItemView {
    pub id: String,
    pub name: String,
    pub brand: Option<String>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub quantity: Option<Decimal>,
    pub unit: Option<String>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub unit_price: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub category_id: Option<String>,
    pub notes: Option<String>,
}

impl From<service::ItemRow> for ItemView {
    fn from(row: service::ItemRow) -> Self {
        Self {
            id: row.id,
            name: row.name,
            brand: row.brand,
            quantity: row.quantity,
            unit: row.unit,
            unit_price: row.unit_price,
            amount: row.amount,
            category_id: row.category_id,
            notes: row.notes,
        }
    }
}

/// One attached file. The bytes come back through the file routes in
/// encrypted chunks, never as a URL (D23).
#[derive(Debug, Serialize)]
pub struct AttachmentView {
    pub id: String,
    pub file_id: String,
    pub name: String,
    pub r#type: String,
    pub size: i64,
}

impl From<service::AttachmentRow> for AttachmentView {
    fn from(row: service::AttachmentRow) -> Self {
        Self { id: row.id, file_id: row.file_id, name: row.name, r#type: row.r#type, size: row.size }
    }
}

/// One transaction with everything the detail sheet shows.
#[derive(Debug, Serialize)]
pub struct TransactionDetailView {
    #[serde(flatten)]
    pub transaction: TransactionView,
    pub items: Vec<ItemView>,
    pub attachments: Vec<AttachmentView>,
}

#[derive(Debug, Deserialize)]
pub struct ItemBody {
    pub name: String,
    pub brand: Option<String>,
    pub quantity: Option<String>,
    pub unit: Option<String>,
    pub unit_price: Option<String>,
    pub amount: String,
    pub category_id: Option<String>,
    pub notes: Option<String>,
}

impl ItemBody {
    fn input(&self) -> Result<service::ItemInput<'_>> {
        Ok(service::ItemInput {
            name: &self.name,
            brand: non_empty(self.brand.as_deref()),
            quantity: optional_money("quantity", self.quantity.as_deref())?,
            unit: non_empty(self.unit.as_deref()),
            unit_price: optional_money("unit_price", self.unit_price.as_deref())?,
            amount: money("amount", &self.amount)?,
            category_id: non_empty(self.category_id.as_deref()),
            notes: non_empty(self.notes.as_deref()),
        })
    }
}

/// One audit entry, as the detail sheet's history section renders it.
#[derive(Debug, Serialize)]
pub struct HistoryView {
    pub id: String,
    pub action: String,
    /// The surface: `web`, `chat`, `import` or `receipt`.
    pub source: String,
    pub actor_email: String,
    pub actor_name: Option<String>,
    pub before: Option<serde_json::Value>,
    pub after: Option<serde_json::Value>,
    pub created_at: String,
}

impl From<AuditRow> for HistoryView {
    fn from(row: AuditRow) -> Self {
        Self {
            id: row.id,
            action: row.action,
            source: row.source,
            actor_email: row.user_email,
            actor_name: row.user_name,
            before: row.before,
            after: row.after,
            created_at: row.created_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct BulkResultView {
    pub created: usize,
    pub duplicates: usize,
    pub skipped: Vec<SkippedView>,
}

#[derive(Debug, Serialize)]
pub struct SkippedView {
    pub index: usize,
    pub code: String,
    pub reason: String,
}

#[derive(Debug, Serialize)]
pub struct AffectedView {
    pub affected: usize,
}

// ---------------------------------------------------------------- requests

/// The list filters, every one of them flat, matching the web app's own URL
/// parameters so a shared link reproduces the view (TXN-9).
#[derive(Debug, Default, Deserialize)]
pub struct ListQuery {
    pub wallet_id: Option<String>,
    pub category_id: Option<String>,
    pub r#type: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub search: Option<String>,
    pub is_ready: Option<bool>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

impl ListQuery {
    /// Parse into the typed filters the repository takes.
    ///
    /// A date is a day, and the end of a range is inclusive, so `end_date`
    /// becomes the last instant of that day rather than its midnight.
    fn filters(&self) -> Result<TransactionFilters<'_>> {
        let kind = match self.r#type.as_deref() {
            None | Some("") => None,
            Some(value) => {
                let parsed: TransactionType = value
                    .parse()
                    .map_err(|_| AppError::validation([("type", "Use income, expense or transfer.")]))?;
                Some(parsed.as_str())
            }
        };

        Ok(TransactionFilters {
            wallet_id: non_empty(self.wallet_id.as_deref()),
            category_id: non_empty(self.category_id.as_deref()),
            kind,
            start_date: parse_day(self.start_date.as_deref(), DayEdge::Start)?,
            end_date: parse_day(self.end_date.as_deref(), DayEdge::End)?,
            search: non_empty(self.search.as_deref()),
            is_ready: self.is_ready,
            ids: None,
        })
    }

    /// A sort field is an enum before it is SQL (SEC-10). An unknown value
    /// is the default rather than an error: a stale bookmark should still
    /// render a list.
    fn sort(&self) -> (SortField, SortOrder) {
        let field = match self.sort.as_deref() {
            Some("amount") => SortField::Amount,
            Some("created_at") => SortField::CreatedAt,
            _ => SortField::Date,
        };
        let order = match self.order.as_deref() {
            Some("asc") => SortOrder::Ascending,
            _ => SortOrder::Descending,
        };
        (field, order)
    }
}

#[derive(Debug, Deserialize)]
pub struct TransactionBody {
    pub r#type: TransactionType,
    pub wallet_id: String,
    pub to_wallet_id: Option<String>,
    pub category_id: Option<String>,
    /// A string on the wire, parsed into a `Decimal` here. A client that
    /// sends a JSON number loses precision before this code runs, so the
    /// field refuses one (D12).
    pub amount: String,
    pub to_amount: Option<String>,
    pub original_amount: Option<String>,
    pub original_currency_code: Option<String>,
    pub exchange_rate: Option<String>,
    /// The wallet-to-workspace rate the user confirmed in the form. It is a
    /// suggestion to the resolution ladder, not a value written as given;
    /// `base_amount` is always computed (D39, TXN-22).
    pub base_rate: Option<String>,
    pub date: DateTime<Utc>,
    pub name: Option<String>,
    pub description: Option<String>,
    #[serde(default)]
    pub is_ready: bool,
    /// The whole set of files this transaction carries. Absent leaves the
    /// attachments alone; present replaces them (TXN-13, VLT-5).
    pub attachment_ids: Option<Vec<String>>,
}

impl TransactionBody {
    fn input(&self) -> Result<TransactionInput<'_>> {
        Ok(TransactionInput {
            kind: self.r#type,
            wallet_id: &self.wallet_id,
            to_wallet_id: non_empty(self.to_wallet_id.as_deref()),
            category_id: non_empty(self.category_id.as_deref()),
            amount: money("amount", &self.amount)?,
            to_amount: optional_money("to_amount", self.to_amount.as_deref())?,
            original_amount: optional_money("original_amount", self.original_amount.as_deref())?,
            original_currency_code: non_empty(self.original_currency_code.as_deref()),
            exchange_rate: optional_money("exchange_rate", self.exchange_rate.as_deref())?,
            requested_base_rate: optional_money("base_rate", self.base_rate.as_deref())?,
            date: self.date,
            name: non_empty(self.name.as_deref()),
            description: non_empty(self.description.as_deref()),
            is_ready: self.is_ready,
            attachment_ids: self.attachment_ids.as_deref(),
        })
    }
}

#[derive(Debug, Deserialize)]
pub struct BulkCreateBody {
    pub transactions: Vec<TransactionBody>,
}

#[derive(Debug, Deserialize)]
pub struct BulkUpdateBody {
    pub ids: Vec<String>,
    /// Absent leaves the category alone; `null` clears it.
    #[serde(default, deserialize_with = "explicit_null")]
    pub category_id: Option<Option<String>>,
    pub is_ready: Option<bool>,
}

/// A file's rows, as they came out of it, plus what each column holds.
///
/// The amounts are strings exactly as the file wrote them. They are parsed
/// in Rust, never by the model and never in the browser (D28).
#[derive(Debug, Deserialize)]
pub struct ImportBody {
    pub wallet_id: String,
    pub mapping: oewang_domain::csv_import::ColumnMapping,
    pub rows: Vec<oewang_domain::csv_import::RawRow>,
    /// Category name, lowercased, to the category it was matched to in
    /// step three of the wizard.
    #[serde(default)]
    pub categories: std::collections::BTreeMap<String, String>,
}

#[derive(Debug, Deserialize)]
pub struct BulkDeleteBody {
    pub ids: Vec<String>,
}

fn explicit_null<'de, T, D>(deserializer: D) -> std::result::Result<Option<Option<T>>, D::Error>
where
    T: Deserialize<'de>,
    D: serde::Deserializer<'de>,
{
    Deserialize::deserialize(deserializer).map(Some)
}

// ---------------------------------------------------------------- handlers

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<TransactionView>>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let (sort, order) = query.sort();
        let page = Page::new(query.page, query.limit);
        let (rows, total) =
            service::list(&state.db, &auth.workspace_id, &filters, sort, order, page).await?;
        Ok::<_, AppError>((rows, total, page))
    }
    .await;

    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(Into::into).collect(),
            id,
            PageMeta::new(page.page, page.limit, total as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn get(
    State(state): State<AppState>,
    auth: Auth,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<TransactionDetailView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let row = service::find(&state.db, &auth.workspace_id, &transaction_id).await?;
        let items = service::list_items(&state.db, &auth.workspace_id, &transaction_id).await?;
        let attachments =
            service::list_attachments(&state.db, &auth.workspace_id, &transaction_id).await?;

        Ok::<_, AppError>(TransactionDetailView {
            transaction: TransactionView::from(row),
            items: items.into_iter().map(Into::into).collect(),
            attachments: attachments.into_iter().map(Into::into).collect(),
        })
    }
    .await;

    match result {
        Ok(view) => Ok(Json(Envelope::data(view, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn list_items(
    State(state): State<AppState>,
    auth: Auth,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<ItemView>>>, ApiError> {
    let id = request_id.0;

    match service::list_items(&state.db, &auth.workspace_id, &transaction_id).await {
        Ok(rows) => Ok(Json(Envelope::data(
            rows.into_iter().map(Into::into).collect(),
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn add_item(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<ItemBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<ItemView>>), ApiError> {
    let id = request_id.0;

    let result = async {
        service::add_item(
            &state.db,
            Actor::web(&auth.workspace_id, &auth.user_id),
            &transaction_id,
            body.input()?,
        )
        .await
    }
    .await;

    match result {
        Ok(item) => Ok((StatusCode::CREATED, Json(Envelope::data(ItemView::from(item), id)))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn replace_item(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path((transaction_id, item_id)): Path<(String, String)>,
    request_id: RequestId,
    Json(body): Json<ItemBody>,
) -> std::result::Result<Json<Envelope<ItemView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        service::replace_item(
            &state.db,
            Actor::web(&auth.workspace_id, &auth.user_id),
            &transaction_id,
            &item_id,
            body.input()?,
        )
        .await
    }
    .await;

    match result {
        Ok(item) => Ok(Json(Envelope::data(ItemView::from(item), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn delete_item(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path((transaction_id, item_id)): Path<(String, String)>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let id = request_id.0;

    match service::delete_item(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &transaction_id,
        &item_id,
    )
    .await
    {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn history(
    State(state): State<AppState>,
    auth: Auth,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<HistoryView>>>, ApiError> {
    let id = request_id.0;
    match service::history(&state.db, &auth.workspace_id, &transaction_id).await {
        Ok(rows) => Ok(Json(Envelope::data(
            rows.into_iter().map(Into::into).collect(),
            id,
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn summary(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<SummaryView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let (by_type, by_category) =
            service::summary(&state.db, &auth.workspace_id, &filters).await?;
        let workspace = oewang_db::repositories::accounts::find_workspace(
            &state.db,
            &auth.workspace_id,
        )
        .await
        .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
        .ok_or(AppError::NotFound)?;

        Ok::<_, AppError>(SummaryView {
            // Every total is in the workspace currency, because every row
            // stored `base_amount` at write time (TXN-19).
            currency_code: workspace.currency_code,
            by_type: by_type
                .into_iter()
                .map(|row| TypeTotal { r#type: row.r#type, total: row.total, count: row.count })
                .collect(),
            by_category: by_category
                .into_iter()
                .map(|row| CategoryTotal {
                    category_id: row.category_id,
                    category_name: row.category_name,
                    r#type: row.r#type,
                    total: row.total,
                })
                .collect(),
        })
    }
    .await;

    match result {
        Ok(view) => Ok(Json(Envelope::data(view, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Stream the export as a CSV download (TXN-10).
///
/// Answers with a file rather than the envelope: the browser saves it, and
/// a JSON wrapper around a CSV would have to be unwrapped before it could
/// be saved. The OWE1 layer still seals the body.
pub async fn export(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ListQuery>,
    request_id: RequestId,
) -> std::result::Result<impl IntoResponse, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let (sort, order) = query.sort();
        service::export(
            &state.db,
            Actor::web(&auth.workspace_id, &auth.user_id),
            &filters,
            sort,
            order,
        )
        .await
    }
    .await;

    match result {
        Ok(csv) => Ok((
            [
                (header::CONTENT_TYPE, "text/csv; charset=utf-8"),
                (
                    header::CONTENT_DISPOSITION,
                    "attachment; filename=\"transactions.csv\"",
                ),
            ],
            csv,
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn create(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<TransactionBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<TransactionView>>), ApiError> {
    let id = request_id.0;

    let result = async {
        let input = body.input()?;
        let row = service::create(
            &state.db,
            &state.rates,
            Actor::web(&auth.workspace_id, &auth.user_id),
            input,
        )
        .await?;
        service::find(&state.db, &auth.workspace_id, &row.id).await
    }
    .await;

    match result {
        Ok(row) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(TransactionView::from(row), id)),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn update(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
    Json(body): Json<TransactionBody>,
) -> std::result::Result<Json<Envelope<TransactionView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let input = body.input()?;
        service::update(
            &state.db,
            &state.rates,
            Actor::web(&auth.workspace_id, &auth.user_id),
            &transaction_id,
            input,
        )
        .await?;
        service::find(&state.db, &auth.workspace_id, &transaction_id).await
    }
    .await;

    match result {
        Ok(row) => Ok(Json(Envelope::data(TransactionView::from(row), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn delete(
    State(state): State<AppState>,
    auth: AuthWrite,
    Path(transaction_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<StatusCode, ApiError> {
    let id = request_id.0;
    match service::delete(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &transaction_id,
    )
    .await
    {
        Ok(()) => Ok(StatusCode::NO_CONTENT),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn bulk_create(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<BulkCreateBody>,
) -> std::result::Result<Json<Envelope<BulkResultView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let mut inputs = Vec::with_capacity(body.transactions.len());
        for row in &body.transactions {
            inputs.push(row.input()?);
        }

        service::bulk_create(
            &state.db,
            // Every row written this way is an import, and the audit trail
            // says so (D14).
            Actor::web(&auth.workspace_id, &auth.user_id).with_source(crate::audit::SOURCE_IMPORT),
            inputs,
        )
        .await
    }
    .await;

    match result {
        Ok(outcome) => Ok(Json(Envelope::data(bulk_view(outcome), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

fn bulk_view(outcome: service::BulkOutcome) -> BulkResultView {
    BulkResultView {
        created: outcome.created,
        duplicates: outcome.duplicates,
        skipped: outcome
            .skipped
            .into_iter()
            .map(|row| SkippedView {
                index: row.index,
                code: row.code.to_string(),
                reason: row.reason,
            })
            .collect(),
    }
}

pub async fn import_csv(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<ImportBody>,
) -> std::result::Result<Json<Envelope<BulkResultView>>, ApiError> {
    let id = request_id.0;

    let result = service::import_rows(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id).with_source(crate::audit::SOURCE_IMPORT),
        &body.wallet_id,
        &body.mapping,
        &body.rows,
        &body.categories,
    )
    .await;

    match result {
        Ok(outcome) => Ok(Json(Envelope::data(bulk_view(outcome), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn bulk_update(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<BulkUpdateBody>,
) -> std::result::Result<Json<Envelope<AffectedView>>, ApiError> {
    let id = request_id.0;

    let category = body
        .category_id
        .as_ref()
        .map(|inner| inner.as_deref().filter(|value| !value.is_empty()));

    match service::bulk_update(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &body.ids,
        category,
        body.is_ready,
    )
    .await
    {
        Ok(affected) => Ok(Json(Envelope::data(AffectedView { affected }, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn bulk_delete(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<BulkDeleteBody>,
) -> std::result::Result<Json<Envelope<AffectedView>>, ApiError> {
    let id = request_id.0;

    match service::bulk_delete(
        &state.db,
        Actor::web(&auth.workspace_id, &auth.user_id),
        &body.ids,
    )
    .await
    {
        Ok(affected) => Ok(Json(Envelope::data(AffectedView { affected }, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

// ------------------------------------------------------------------ shared

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|value| !value.is_empty())
}

/// A money string to a `Decimal`.
///
/// The error names the field, so the form highlights the input the user is
/// looking at rather than the whole sheet.
fn money(field: &'static str, raw: &str) -> Result<Decimal> {
    raw.trim()
        .parse::<Decimal>()
        .map_err(|_| AppError::validation([(field, "Enter a number, for example 50000.00.")]))
}

fn optional_money(field: &'static str, raw: Option<&str>) -> Result<Option<Decimal>> {
    match non_empty(raw) {
        None => Ok(None),
        Some(value) => money(field, value).map(Some),
    }
}

enum DayEdge {
    Start,
    End,
}

/// A day to an instant. The end of a range is inclusive, so it becomes the
/// last moment of that day rather than its midnight.
fn parse_day(raw: Option<&str>, edge: DayEdge) -> Result<Option<DateTime<Utc>>> {
    let Some(value) = non_empty(raw) else { return Ok(None) };

    // The picker sends a plain day; a link pasted from elsewhere may carry a
    // full timestamp, and both should filter the same way.
    let day: NaiveDate = value
        .parse()
        .or_else(|_| {
            value
                .parse::<DateTime<Utc>>()
                .map(|moment| moment.date_naive())
        })
        .map_err(|_| AppError::validation([("date", "Use a date like 2026-11-02.")]))?;

    let time = match edge {
        DayEdge::Start => day.and_hms_opt(0, 0, 0),
        DayEdge::End => day.and_hms_milli_opt(23, 59, 59, 999),
    };

    Ok(time.map(|naive| Utc.from_utc_datetime(&naive)))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_make_the_end_of_a_range_inclusive() {
        let start = parse_day(Some("2026-11-02"), DayEdge::Start).unwrap().unwrap();
        let end = parse_day(Some("2026-11-02"), DayEdge::End).unwrap().unwrap();

        assert_eq!(start.to_rfc3339(), "2026-11-02T00:00:00+00:00");
        assert!(end > start);
        assert_eq!(end.date_naive(), start.date_naive(), "still the same day");
    }

    #[test]
    fn should_treat_a_blank_filter_as_absent() {
        assert_eq!(parse_day(Some("  "), DayEdge::Start).unwrap(), None);
        assert_eq!(non_empty(Some("")), None);
        assert_eq!(non_empty(Some(" x ")), Some("x"));
    }

    #[test]
    fn should_refuse_a_date_that_is_not_a_date() {
        assert!(parse_day(Some("last tuesday"), DayEdge::Start).is_err());
    }

    #[test]
    fn should_map_an_unknown_sort_to_the_default_rather_than_an_error() {
        let query = ListQuery { sort: Some("; DROP TABLE".into()), ..Default::default() };
        assert_eq!(query.sort(), (SortField::Date, SortOrder::Descending));
    }

    #[test]
    fn should_refuse_an_unknown_type_filter() {
        let query = ListQuery { r#type: Some("refund".into()), ..Default::default() };
        assert!(query.filters().is_err());
    }

    #[test]
    fn should_parse_money_as_a_decimal_never_a_float() {
        assert_eq!(money("amount", "812500.0000").unwrap(), Decimal::new(8125000000, 4));
        assert!(money("amount", "50,000").is_err(), "a separator is not a number");
    }

    #[test]
    fn should_cap_the_page_limit_at_one_hundred() {
        assert_eq!(Page::new(None, None).limit, 25);
        assert_eq!(Page::new(Some(0), Some(500)).limit, 100);
        assert_eq!(Page::new(Some(0), Some(500)).page, 1);
    }
}
