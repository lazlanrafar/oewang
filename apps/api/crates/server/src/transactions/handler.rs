//! Transaction routes.
//!
//! Handlers parse, call one service and map to HTTP. Query parameters are
//! parsed into typed filters here; the enum that reaches the repository is
//! what keeps a sort out of the SQL string (SEC-10).

use axum::{
    extract::{rejection::QueryRejection, FromRequestParts, Path, Query, State},
    http::{header, request::Parts, StatusCode},
    response::IntoResponse,
    Json,
};
use chrono::{DateTime, NaiveDate, TimeZone, Utc};
use oewang_db::repositories::{
    audit::AuditRow,
    transactions::{SortField, SortOrder, TransactionFilters, TransactionListRow},
};
use oewang_domain::{
    csv_import::ColumnMapping, ledger::TransactionType, AppError, Envelope, PageMeta, Result,
};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    audit::Actor,
    auth::extractor::{Auth, AuthWrite},
    response::{ApiError, RequestId},
    state::AppState,
    transactions::{
        service::{self, Page, TransactionInput},
        statement,
    },
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
        Self {
            id: row.id,
            file_id: row.file_id,
            name: row.name,
            r#type: row.r#type,
            size: row.size,
        }
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

/// A statement import, as the modal polls it (AI-6).
///
/// The three counts are separate because they are three different things
/// that happened to a row, and a user reading "40 imported" wants to know
/// what became of the other six (TXN-16).
#[derive(Debug, Serialize)]
pub struct ImportJobView {
    pub id: String,
    pub status: String,
    pub vault_file_id: Option<String>,
    pub imported: Option<i32>,
    pub skipped: Option<i32>,
    pub duplicates: Option<i32>,
    pub error: Option<String>,
    /// What became of each row: `{rows: [{date, name, amount, direction,
    /// status}], truncated}`. Null while the job is pending. The counts
    /// above are exact for the whole file; this list is capped, and says
    /// so (AI-6).
    pub review: Option<serde_json::Value>,
    /// Computed, not stored: a job is stale because time passed, and
    /// nothing writes that fact down.
    pub stale: bool,
    pub created_at: String,
    pub updated_at: String,
}

impl From<statement::ImportJobRow> for ImportJobView {
    fn from(row: statement::ImportJobRow) -> Self {
        let stale = statement::is_stale(&row);
        Self {
            id: row.id,
            status: row.status,
            vault_file_id: row.vault_file_id,
            imported: row.imported,
            skipped: row.skipped,
            duplicates: row.duplicates,
            error: row.error,
            review: row.review,
            stale,
            created_at: row.created_at.to_rfc3339(),
            updated_at: row.updated_at.to_rfc3339(),
        }
    }
}

#[derive(Debug, Serialize)]
pub struct StartedJobView {
    pub job_id: String,
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
    /// Every `wallet_id` in the query string, because the parameter may
    /// repeat: `?wallet_id=a&wallet_id=b` filters by both. Filled by this
    /// struct's own extractor rather than by serde, for the reason given
    /// on `repeated`.
    #[serde(skip)]
    pub wallet_ids: Vec<String>,
    /// Every `category_id`, repeated the same way.
    #[serde(skip)]
    pub category_ids: Vec<String>,
    pub r#type: Option<String>,
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub search: Option<String>,
    pub is_ready: Option<bool>,
    /// Amount bounds, as strings. Money is parsed, never deserialized into
    /// a float (D12).
    pub min_amount: Option<String>,
    pub max_amount: Option<String>,
    pub sort: Option<String>,
    pub order: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

/// Every value of a repeated query parameter, in the order it was given.
///
/// `axum`'s `Query` deserializes through `serde_urlencoded`, which keeps
/// only the last value of a repeated key, so `?wallet_id=a&wallet_id=b`
/// would quietly filter by `b` alone. The scalar parameters still come from
/// that extractor, unchanged; only the two that may repeat are read from
/// the raw query string here.
///
/// A blank value is dropped, exactly as `non_empty` drops one, so
/// `?wallet_id=` is the same as sending nothing.
fn repeated(raw: &str, key: &str) -> Vec<String> {
    form_urlencoded::parse(raw.as_bytes())
        .filter(|(name, _)| name == key)
        .map(|(_, value)| value.trim().to_owned())
        .filter(|value| !value.is_empty())
        .collect()
}

/// `ListQuery` is its own extractor, rather than being read through
/// `Query<ListQuery>`, so the repeated parameters survive. The change is
/// deliberately local to these three routes: every other route keeps
/// `Query`, because no other query parameter repeats.
impl<S> FromRequestParts<S> for ListQuery
where
    S: Send + Sync,
{
    type Rejection = QueryRejection;

    async fn from_request_parts(
        parts: &mut Parts,
        state: &S,
    ) -> std::result::Result<Self, Self::Rejection> {
        let raw = parts.uri.query().unwrap_or_default().to_owned();
        let Query(mut query) = Query::<ListQuery>::from_request_parts(parts, state).await?;
        query.wallet_ids = repeated(&raw, "wallet_id");
        query.category_ids = repeated(&raw, "category_id");
        Ok(query)
    }
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
                let parsed: TransactionType = value.parse().map_err(|_| {
                    AppError::validation([("type", "Use income, expense or transfer.")])
                })?;
                Some(parsed.as_str())
            }
        };

        Ok(TransactionFilters {
            // An empty list is no filter, and the repository is where that
            // is decided, so nothing has to be stripped out here.
            wallet_ids: Some(&self.wallet_ids),
            category_ids: Some(&self.category_ids),
            kind,
            start_date: parse_day(self.start_date.as_deref(), DayEdge::Start)?,
            end_date: parse_day(self.end_date.as_deref(), DayEdge::End)?,
            search: non_empty(self.search.as_deref()),
            is_ready: self.is_ready,
            ids: None,
            min_amount: bound("min_amount", self.min_amount.as_deref())?,
            max_amount: bound("max_amount", self.max_amount.as_deref())?,
        })
    }

    /// A sort field is an enum before it is SQL (SEC-10). An unknown value
    /// is the default rather than an error: a stale bookmark should still
    /// render a list.
    fn sort(&self) -> (SortField, SortOrder) {
        let field = match self.sort.as_deref() {
            Some("amount") => SortField::Amount,
            Some("name") => SortField::Name,
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
    /// Line items written with the transaction, in one database
    /// transaction. Only `POST` reads this: a `PATCH` edits items through
    /// their own routes, where each one can be addressed (TXN-12).
    #[serde(default)]
    pub items: Vec<ItemBody>,
    /// Which surface this write came from, for the audit row (OPS-8).
    ///
    /// A claim, and a deliberately narrow one: `web` and `receipt` are the
    /// two things a browser can truthfully be. `chat` and `import` are
    /// minted by the API's own paths and are refused here, because a
    /// surface the client can name freely would make the audit trail
    /// describe whatever the client preferred.
    pub source: Option<String>,
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

/// Which document to read, and which wallet its rows belong to.
///
/// The bytes are not in the body: a statement does not fit in one
/// (SEC-18), so it is uploaded as chunks first and named here (D23). The
/// wallet is required because a statement is an account's statement, and
/// every row it holds moves that account's balance.
#[derive(Debug, Deserialize)]
pub struct StatementImportBody {
    pub vault_file_id: String,
    pub wallet_id: String,
}

/// Column names and a sample or two, on their way to the model (AI-9).
#[derive(Debug, Deserialize)]
pub struct MapColumnsBody {
    pub columns: Vec<String>,
    #[serde(default)]
    pub sample_rows: Vec<std::collections::BTreeMap<String, String>>,
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
    query: ListQuery,
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
        Ok(item) => Ok((
            StatusCode::CREATED,
            Json(Envelope::data(ItemView::from(item), id)),
        )),
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
    query: ListQuery,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<SummaryView>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let filters = query.filters()?;
        let (by_type, by_category) =
            service::summary(&state.db, &auth.workspace_id, &filters).await?;
        let workspace =
            oewang_db::repositories::accounts::find_workspace(&state.db, &auth.workspace_id)
                .await
                .map_err(|e| AppError::Internal(anyhow::anyhow!(e)))?
                .ok_or(AppError::NotFound)?;

        Ok::<_, AppError>(SummaryView {
            // Every total is in the workspace currency, because every row
            // stored `base_amount` at write time (TXN-19).
            currency_code: workspace.currency_code,
            by_type: by_type
                .into_iter()
                .map(|row| TypeTotal {
                    r#type: row.r#type,
                    total: row.total,
                    count: row.count,
                })
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
    query: ListQuery,
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
        let items = body
            .items
            .iter()
            .map(ItemBody::input)
            .collect::<Result<Vec<_>>>()?;

        let row = service::create_with_items(
            &state.db,
            &state.rates,
            Actor::web(&auth.workspace_id, &auth.user_id)
                .with_source(client_source(body.source.as_deref())?),
            input,
            &items,
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
            state.config.import_row_limit,
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
        state.config.import_row_limit,
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
/// The surfaces a browser may claim (OPS-8).
///
/// `chat` and `import` are written by the API's own paths, so a client
/// naming either of them is either confused or lying, and both answers are
/// a rejection.
fn client_source(claimed: Option<&str>) -> Result<&'static str> {
    match claimed {
        None | Some("web") => Ok(crate::audit::SOURCE_WEB),
        Some("receipt") => Ok(crate::audit::SOURCE_RECEIPT),
        Some(_) => Err(AppError::validation([(
            "source",
            "A write from the browser is either web or receipt.",
        )])),
    }
}

/// An optional amount bound from the query string.
///
/// Absent and empty both mean "no bound": a filter the user cleared sends
/// `?min_amount=` rather than dropping the key, and that is not an error.
fn bound(field: &'static str, raw: Option<&str>) -> Result<Option<Decimal>> {
    match non_empty(raw) {
        None => Ok(None),
        Some(value) => money(field, value).map(Some),
    }
}

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
    let Some(value) = non_empty(raw) else {
        return Ok(None);
    };

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

/// Start a statement import (AI-4).
///
/// Answers `202` and a job id. The work runs in a task, because the ladder
/// may spend forty-five seconds on the document before the first row
/// exists and a request held open that long is a request that times out
/// (SEC-19).
pub async fn import_statement(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<StatementImportBody>,
) -> std::result::Result<(StatusCode, Json<Envelope<StartedJobView>>), ApiError> {
    let id = request_id.0;

    match statement::start(
        &state.db,
        &state.files,
        &state.ai,
        statement::StatementImport {
            actor: Actor::web(&auth.workspace_id, &auth.user_id)
                .with_source(crate::audit::SOURCE_IMPORT),
            request_id: &id,
            wallet_id: &body.wallet_id,
            vault_file_id: &body.vault_file_id,
            row_limit: state.config.import_row_limit,
        },
    )
    .await
    {
        Ok(job) => Ok((
            StatusCode::ACCEPTED,
            Json(Envelope::data(StartedJobView { job_id: job.id }, id)),
        )),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Poll one. Any member: watching an import finish is not a privileged
/// question, and the row holds counts, not contents.
pub async fn import_job(
    State(state): State<AppState>,
    auth: Auth,
    Path(job_id): Path<String>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<ImportJobView>>, ApiError> {
    let id = request_id.0;

    match statement::find(&state.db, &auth.workspace_id, &job_id).await {
        Ok(job) => Ok(Json(Envelope::data(job.into(), id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// Propose which column holds what (AI-9, D28).
///
/// A proxy, because the browser never calls the AI service (D5, PLT-4).
/// The model sees column names and two sample rows and returns a mapping;
/// every figure in the file is then read by `csv_import::transform`, so a
/// wrong mapping costs a correction in the wizard and never a wrong amount.
///
/// A failure is relayed as it comes. The wizard's step two works by hand,
/// and an empty step is a better answer than a guess.
pub async fn map_columns(
    State(state): State<AppState>,
    auth: AuthWrite,
    request_id: RequestId,
    Json(body): Json<MapColumnsBody>,
) -> std::result::Result<Json<Envelope<ColumnMapping>>, ApiError> {
    let id = request_id.0;

    if body.columns.is_empty() {
        return Err(ApiError::new(
            AppError::validation([("columns", "Name at least one column.")]),
            id,
        ));
    }

    // Two rows is what the prompt is written for, and every cell is clamped
    // before it leaves this process: a sample row is file content, and file
    // content is the input this product treats as hostile (SEC-21).
    let samples: Vec<_> = body
        .sample_rows
        .iter()
        .take(SAMPLE_ROWS)
        .map(clamp_row)
        .collect();

    match crate::ai::extraction::map_columns(
        &state.ai,
        crate::usage::Meter::new(&state.db, &auth.workspace_id, Some(&auth.user_id)),
        &id,
        &body.columns,
        &samples,
    )
    .await
    {
        Ok(mapping) => Ok(Json(Envelope::data(mapping, id))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

/// How many sample rows the model is shown, and how much of each cell.
/// Both are from the prompt's own contract
/// (docs/ai/service.md#csv-column-mapping).
const SAMPLE_ROWS: usize = 2;
const SAMPLE_CELL_CHARS: usize = 80;

fn clamp_row(
    row: &std::collections::BTreeMap<String, String>,
) -> std::collections::BTreeMap<String, String> {
    row.iter()
        .map(|(column, value)| {
            (
                column.clone(),
                value.chars().take(SAMPLE_CELL_CHARS).collect::<String>(),
            )
        })
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_make_the_end_of_a_range_inclusive() {
        let start = parse_day(Some("2026-11-02"), DayEdge::Start)
            .unwrap()
            .unwrap();
        let end = parse_day(Some("2026-11-02"), DayEdge::End)
            .unwrap()
            .unwrap();

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
    fn should_read_every_value_of_a_repeated_filter() {
        assert_eq!(
            repeated("category_id=c_food&category_id=c_rent", "category_id"),
            vec!["c_food", "c_rent"],
            "both chips filter, not only the last one"
        );
        assert_eq!(
            repeated("category_id=c_food", "category_id"),
            vec!["c_food"],
            "one value is still one filter"
        );
        assert_eq!(
            repeated("wallet_id=w_cash&category_id=c_food", "wallet_id"),
            vec!["w_cash"],
            "another key's value is not this key's"
        );
        assert!(
            repeated("category_id=&category_id=%20", "category_id").is_empty(),
            "a blank value is ignored, the way non_empty ignores one"
        );
        assert!(repeated("", "wallet_id").is_empty());
    }

    /// The extractor as a route sees it: the repeated keys reach the lists
    /// and every scalar parameter still comes back from `Query`.
    #[tokio::test]
    async fn should_keep_every_repeated_id_when_the_query_is_extracted() {
        let request = axum::http::Request::builder()
            .uri("/v1/transactions?wallet_id=w_cash&wallet_id=w_bank&category_id=c_food&search=gojek&limit=10")
            .body(axum::body::Body::empty())
            .unwrap();
        let (mut parts, _) = request.into_parts();

        let query = ListQuery::from_request_parts(&mut parts, &())
            .await
            .unwrap();

        assert_eq!(query.wallet_ids, vec!["w_cash", "w_bank"]);
        assert_eq!(query.category_ids, vec!["c_food"]);
        assert_eq!(query.search.as_deref(), Some("gojek"));
        assert_eq!(query.limit, Some(10));
    }

    #[test]
    fn should_refuse_a_date_that_is_not_a_date() {
        assert!(parse_day(Some("last tuesday"), DayEdge::Start).is_err());
    }

    #[test]
    fn should_map_an_unknown_sort_to_the_default_rather_than_an_error() {
        let query = ListQuery {
            sort: Some("; DROP TABLE".into()),
            ..Default::default()
        };
        assert_eq!(query.sort(), (SortField::Date, SortOrder::Descending));
    }

    #[test]
    fn should_refuse_an_unknown_type_filter() {
        let query = ListQuery {
            r#type: Some("refund".into()),
            ..Default::default()
        };
        assert!(query.filters().is_err());
    }

    #[test]
    fn should_parse_money_as_a_decimal_never_a_float() {
        assert_eq!(
            money("amount", "812500.0000").unwrap(),
            Decimal::new(8125000000, 4)
        );
        assert!(
            money("amount", "50,000").is_err(),
            "a separator is not a number"
        );
    }

    #[test]
    fn should_cap_the_page_limit_at_one_hundred() {
        assert_eq!(Page::new(None, None).limit, 25);
        assert_eq!(Page::new(Some(0), Some(500)).limit, 100);
        assert_eq!(Page::new(Some(0), Some(500)).page, 1);
    }
}
