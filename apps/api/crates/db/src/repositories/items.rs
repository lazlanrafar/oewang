//! Line items across every transaction: what was bought, when, and at
//! what price (ITM-1, ITM-2).
//!
//! An item is identified by its name, trimmed and lowercased, together with
//! the currency of the wallet that paid for it. "Beras 5kg" and "beras 5kg "
//! are one item; the same name bought in IDR and in SGD is two, because a
//! lowest and a highest price across two currencies would compare numbers
//! that do not mean the same thing.
//!
//! The price of one purchase is the unit price when the item has one, else
//! the amount divided by the quantity, else the amount. Worked out here, in
//! `numeric`, so no float touches it (D12).
//!
//! A line with a negative amount is a discount, not a thing bought, so it
//! is never an item. It is reported instead on every purchase from the same
//! transaction, as `transaction_discount`: the receipt does not say which
//! item a discount belongs to in a form that survives storage (items keep
//! no position), so it is stated for the receipt rather than guessed for an
//! item (D97).
//!
//! The wallet is joined for its currency only, and deliberately without
//! `deleted_at`: archiving a wallet does not unbuy what it paid for, and
//! the transaction itself is still filtered as live.

use chrono::{DateTime, Utc};
use rust_decimal::Decimal;
use sqlx::{PgExecutor, QueryBuilder};

/// One purchase's price, as described above.
const PRICE: &str = "COALESCE(i.unit_price, \
     CASE WHEN i.quantity > 0 THEN round(i.amount / i.quantity, 4) END, \
     i.amount)";

/// The identity of an item.
const KEY: &str = "lower(btrim(i.name))";

/// The sum of the discount lines on the purchase's transaction, or null
/// when it had none.
const DISCOUNT: &str = "(SELECT sum(d.amount) FROM transaction_items d \
     WHERE d.transaction_id = i.transaction_id AND d.workspace_id = i.workspace_id \
       AND d.deleted_at IS NULL AND d.amount < 0)";

/// Which items, before paging.
#[derive(Debug, Default)]
pub struct ItemFilters<'a> {
    /// Matches anywhere in the name, case-insensitively.
    pub search: Option<&'a str>,
    /// One exact item: its key and its currency, both required together.
    pub exact: Option<(&'a str, &'a str)>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum ItemSortField {
    LastBought,
    Name,
    Purchases,
    LastPrice,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ItemSort {
    pub field: ItemSortField,
    pub descending: bool,
}

impl ItemSort {
    /// Fixed SQL per field, never interpolated from input. The key and the
    /// currency break ties, so a page boundary is stable.
    fn order_by(self) -> &'static str {
        use ItemSortField::*;
        match (self.field, self.descending) {
            (LastBought, true) => " ORDER BY last_bought_at DESC, key, currency_code",
            (LastBought, false) => " ORDER BY last_bought_at ASC, key, currency_code",
            (Name, true) => " ORDER BY key DESC, currency_code",
            (Name, false) => " ORDER BY key ASC, currency_code",
            (Purchases, true) => " ORDER BY purchases DESC, key, currency_code",
            (Purchases, false) => " ORDER BY purchases ASC, key, currency_code",
            (LastPrice, true) => " ORDER BY last_price DESC, key, currency_code",
            (LastPrice, false) => " ORDER BY last_price ASC, key, currency_code",
        }
    }
}

/// One item, summed over every time it was bought.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ItemSummaryRow {
    pub key: String,
    /// As it was written on the most recent purchase.
    pub name: String,
    pub currency_code: String,
    pub purchases: i64,
    pub last_bought_at: DateTime<Utc>,
    pub last_price: Decimal,
    pub last_quantity: Option<Decimal>,
    pub last_unit: Option<String>,
    pub last_transaction_id: String,
    /// The discount lines on the latest purchase's receipt, summed; negative.
    pub last_discount: Option<Decimal>,
    pub min_price: Decimal,
    pub max_price: Decimal,
}

/// One time an item was bought.
#[derive(Debug, Clone, sqlx::FromRow)]
pub struct ItemPurchaseRow {
    pub id: String,
    pub transaction_id: String,
    pub transaction_name: Option<String>,
    pub wallet_name: String,
    pub date: DateTime<Utc>,
    pub name: String,
    pub brand: Option<String>,
    pub quantity: Option<Decimal>,
    pub unit: Option<String>,
    pub price: Decimal,
    pub amount: Decimal,
    pub currency_code: String,
    /// The discount lines on this purchase's receipt, summed; negative.
    pub transaction_discount: Option<Decimal>,
}

/// The rows every query here starts from: live items on live transactions
/// in one workspace, with the paying wallet's currency.
fn push_purchases<'a>(
    builder: &mut QueryBuilder<'a, sqlx::Postgres>,
    workspace_id: &'a str,
    filters: &ItemFilters<'a>,
) {
    builder.push(
        " FROM transaction_items i
          JOIN transactions t
            ON t.id = i.transaction_id AND t.workspace_id = i.workspace_id
          JOIN wallets w
            ON w.id = t.wallet_id AND w.workspace_id = t.workspace_id
          WHERE i.workspace_id = ",
    );
    builder.push_bind(workspace_id);
    builder.push(" AND i.deleted_at IS NULL AND t.deleted_at IS NULL AND i.amount >= 0");

    if let Some(search) = filters.search {
        builder.push(format_args!(" AND {KEY} ILIKE "));
        builder.push_bind(super::contains_pattern(search));
    }
    if let Some((key, currency)) = filters.exact {
        builder.push(format_args!(" AND {KEY} = "));
        builder.push_bind(key);
        builder.push(" AND w.currency_code = ");
        builder.push_bind(currency);
    }
}

/// One page of items, each summed over its purchases.
pub async fn list_items(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &ItemFilters<'_>,
    sort: ItemSort,
    limit: i64,
    offset: i64,
) -> Result<Vec<ItemSummaryRow>, sqlx::Error> {
    let mut builder = QueryBuilder::new(format!(
        "WITH purchases AS (
             SELECT {KEY} AS key, i.name, w.currency_code, t.date,
                    t.id AS transaction_id, i.quantity, i.unit,
                    {PRICE} AS price, {DISCOUNT} AS discount,
                    row_number() OVER (
                        PARTITION BY {KEY}, w.currency_code
                        ORDER BY t.date DESC, i.created_at DESC, i.id DESC
                    ) AS recency"
    ));
    push_purchases(&mut builder, workspace_id, filters);
    builder.push(
        "), items AS (
             SELECT key, currency_code,
                    max(name) FILTER (WHERE recency = 1) AS name,
                    count(*) AS purchases,
                    max(date) AS last_bought_at,
                    max(price) FILTER (WHERE recency = 1) AS last_price,
                    max(quantity) FILTER (WHERE recency = 1) AS last_quantity,
                    max(unit) FILTER (WHERE recency = 1) AS last_unit,
                    max(transaction_id) FILTER (WHERE recency = 1) AS last_transaction_id,
                    max(discount) FILTER (WHERE recency = 1) AS last_discount,
                    min(price) AS min_price,
                    max(price) AS max_price
             FROM purchases
             GROUP BY key, currency_code
         )
         SELECT * FROM items",
    );
    builder.push(sort.order_by());
    builder.push(" LIMIT ");
    builder.push_bind(limit);
    builder.push(" OFFSET ");
    builder.push_bind(offset);

    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_items(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    filters: &ItemFilters<'_>,
) -> Result<i64, sqlx::Error> {
    let mut builder = QueryBuilder::new("SELECT count(*) FROM (SELECT 1");
    push_purchases(&mut builder, workspace_id, filters);
    builder.push(format_args!(" GROUP BY {KEY}, w.currency_code) items"));

    builder.build_query_scalar().fetch_one(executor).await
}

/// One page of the purchases of one item, newest first.
pub async fn list_purchases(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    key: &str,
    currency_code: &str,
    limit: i64,
    offset: i64,
) -> Result<Vec<ItemPurchaseRow>, sqlx::Error> {
    let filters = ItemFilters {
        search: None,
        exact: Some((key, currency_code)),
    };
    let mut builder = QueryBuilder::new(format!(
        "SELECT i.id, t.id AS transaction_id, t.name AS transaction_name,
                w.name AS wallet_name, t.date, i.name, i.brand, i.quantity, i.unit,
                {PRICE} AS price, i.amount, w.currency_code,
                {DISCOUNT} AS transaction_discount"
    ));
    push_purchases(&mut builder, workspace_id, &filters);
    builder.push(" ORDER BY t.date DESC, i.created_at DESC, i.id DESC LIMIT ");
    builder.push_bind(limit);
    builder.push(" OFFSET ");
    builder.push_bind(offset);

    builder.build_query_as().fetch_all(executor).await
}

pub async fn count_purchases(
    executor: impl PgExecutor<'_>,
    workspace_id: &str,
    key: &str,
    currency_code: &str,
) -> Result<i64, sqlx::Error> {
    let filters = ItemFilters {
        search: None,
        exact: Some((key, currency_code)),
    };
    let mut builder = QueryBuilder::new("SELECT count(*)");
    push_purchases(&mut builder, workspace_id, &filters);

    builder.build_query_scalar().fetch_one(executor).await
}
