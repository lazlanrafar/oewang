//! `GET /v1/items` and `GET /v1/items/history` (ITM-1, ITM-2).

use axum::{
    extract::{Query, State},
    Json,
};
use oewang_db::repositories::items::{
    ItemFilters, ItemPurchaseRow, ItemSort, ItemSortField, ItemSummaryRow,
};
use oewang_domain::{validate_currency_code, AppError, Envelope, Page, PageMeta};
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    auth::extractor::Auth,
    items::service,
    response::{ApiError, RequestId},
    state::AppState,
};

#[derive(Debug, Deserialize)]
pub struct ItemListQuery {
    pub search: Option<String>,
    /// One exact item, by the `key` and `currency_code` a row carries. Both
    /// or neither.
    pub key: Option<String>,
    pub currency: Option<String>,
    /// `last_bought_at` (default), `name`, `purchases` or `last_price`.
    pub sort: Option<String>,
    /// `desc` (default for `last_bought_at`) or `asc`.
    pub order: Option<String>,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

impl ItemListQuery {
    /// The exact item's currency, validated, when one is asked for.
    fn exact_currency(&self) -> oewang_domain::Result<Option<String>> {
        match (non_empty(&self.key), non_empty(&self.currency)) {
            (None, None) => Ok(None),
            (Some(_), Some(code)) => Ok(Some(validate_currency_code("currency", code)?)),
            _ => Err(AppError::validation([(
                "key",
                "Send key and currency together.",
            )])),
        }
    }

    fn sort(&self) -> oewang_domain::Result<ItemSort> {
        let field = match non_empty(&self.sort) {
            None | Some("last_bought_at") => ItemSortField::LastBought,
            Some("name") => ItemSortField::Name,
            Some("purchases") => ItemSortField::Purchases,
            Some("last_price") => ItemSortField::LastPrice,
            Some(_) => {
                return Err(AppError::validation([(
                    "sort",
                    "Use last_bought_at, name, purchases or last_price.",
                )]))
            }
        };
        let descending = match non_empty(&self.order) {
            None => field == ItemSortField::LastBought,
            Some("asc") => false,
            Some("desc") => true,
            Some(_) => return Err(AppError::validation([("order", "Use asc or desc.")])),
        };
        Ok(ItemSort { field, descending })
    }
}

#[derive(Debug, Deserialize)]
pub struct HistoryQuery {
    pub key: String,
    pub currency: String,
    pub page: Option<u32>,
    pub limit: Option<u32>,
}

fn non_empty(value: &Option<String>) -> Option<&str> {
    value
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
}

#[derive(Debug, Serialize)]
pub struct ItemView {
    /// `{currency_code}:{key}`, unique per item.
    pub id: String,
    /// The trimmed, lowercased name that identifies the item.
    pub key: String,
    pub name: String,
    pub currency_code: String,
    pub purchases: i64,
    pub last_bought_at: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub last_price: Decimal,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub last_quantity: Option<Decimal>,
    pub last_unit: Option<String>,
    pub last_transaction_id: String,
    /// The discount lines on the latest purchase's receipt, summed and
    /// negative, or null. Not attributed to this item (D97).
    #[serde(with = "rust_decimal::serde::str_option")]
    pub last_discount: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str")]
    pub min_price: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub max_price: Decimal,
}

impl From<ItemSummaryRow> for ItemView {
    fn from(row: ItemSummaryRow) -> Self {
        Self {
            id: format!("{}:{}", row.currency_code, row.key),
            key: row.key,
            name: row.name,
            currency_code: row.currency_code,
            purchases: row.purchases,
            last_bought_at: row.last_bought_at.to_rfc3339(),
            last_price: row.last_price,
            last_quantity: row.last_quantity,
            last_unit: row.last_unit,
            last_transaction_id: row.last_transaction_id,
            last_discount: row.last_discount,
            min_price: row.min_price,
            max_price: row.max_price,
        }
    }
}

#[derive(Debug, Serialize)]
pub struct PurchaseView {
    pub id: String,
    pub transaction_id: String,
    pub transaction_name: Option<String>,
    pub wallet_name: String,
    pub date: String,
    pub name: String,
    pub brand: Option<String>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub quantity: Option<Decimal>,
    pub unit: Option<String>,
    /// One unit's price: the unit price, else amount over quantity, else
    /// the amount.
    #[serde(with = "rust_decimal::serde::str")]
    pub price: Decimal,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub currency_code: String,
    /// The discount lines on this purchase's receipt, summed and negative,
    /// or null. Not attributed to this item (D97).
    #[serde(with = "rust_decimal::serde::str_option")]
    pub transaction_discount: Option<Decimal>,
}

impl From<ItemPurchaseRow> for PurchaseView {
    fn from(row: ItemPurchaseRow) -> Self {
        Self {
            id: row.id,
            transaction_id: row.transaction_id,
            transaction_name: row.transaction_name,
            wallet_name: row.wallet_name,
            date: row.date.to_rfc3339(),
            name: row.name,
            brand: row.brand,
            quantity: row.quantity,
            unit: row.unit,
            price: row.price,
            amount: row.amount,
            currency_code: row.currency_code,
            transaction_discount: row.transaction_discount,
        }
    }
}

pub async fn list(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<ItemListQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<ItemView>>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let currency = query.exact_currency()?;
        let filters = ItemFilters {
            search: non_empty(&query.search),
            exact: non_empty(&query.key).zip(currency.as_deref()),
        };
        let sort = query.sort()?;
        let page = Page::new(query.page, query.limit);
        let (rows, total) =
            service::list(&state.db, &auth.workspace_id, &filters, sort, page).await?;
        Ok::<_, AppError>((rows, total, page))
    }
    .await;

    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(Into::into).collect(),
            id,
            PageMeta::new(page.page, page.limit, total.max(0) as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}

pub async fn history(
    State(state): State<AppState>,
    auth: Auth,
    Query(query): Query<HistoryQuery>,
    request_id: RequestId,
) -> std::result::Result<Json<Envelope<Vec<PurchaseView>>>, ApiError> {
    let id = request_id.0;

    let result = async {
        let currency = validate_currency_code("currency", &query.currency)?;
        let key = query.key.trim();
        if key.is_empty() {
            return Err(AppError::validation([("key", "Name the item.")]));
        }
        let page = Page::new(query.page, query.limit);
        let (rows, total) =
            service::history(&state.db, &auth.workspace_id, key, &currency, page).await?;
        Ok::<_, AppError>((rows, total, page))
    }
    .await;

    match result {
        Ok((rows, total, page)) => Ok(Json(Envelope::paged(
            rows.into_iter().map(Into::into).collect(),
            id,
            PageMeta::new(page.page, page.limit, total.max(0) as u64),
        ))),
        Err(error) => Err(ApiError::new(error, id)),
    }
}
