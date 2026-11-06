//! Reads over line items across transactions (ITM-1, ITM-2).
//!
//! No business rule lives here beyond paging: what counts as one item and
//! what one purchase cost are defined once, in the repository's SQL.

use oewang_db::{
    repositories::items::{self, ItemFilters, ItemPurchaseRow, ItemSort, ItemSummaryRow},
    PgPool,
};
use oewang_domain::{AppError, Page, Result};

pub async fn list(
    pool: &PgPool,
    workspace_id: &str,
    filters: &ItemFilters<'_>,
    sort: ItemSort,
    page: Page,
) -> Result<(Vec<ItemSummaryRow>, i64)> {
    let rows = items::list_items(
        pool,
        workspace_id,
        filters,
        sort,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;
    let total = items::count_items(pool, workspace_id, filters)
        .await
        .map_err(internal)?;

    Ok((rows, total))
}

/// One item's purchases, newest first. An item nobody bought is an empty
/// page, not a 404: the key is a name, not a row that could be missing.
pub async fn history(
    pool: &PgPool,
    workspace_id: &str,
    key: &str,
    currency_code: &str,
    page: Page,
) -> Result<(Vec<ItemPurchaseRow>, i64)> {
    let rows = items::list_purchases(
        pool,
        workspace_id,
        key,
        currency_code,
        i64::from(page.limit),
        page.offset(),
    )
    .await
    .map_err(internal)?;
    let total = items::count_purchases(pool, workspace_id, key, currency_code)
        .await
        .map_err(internal)?;

    Ok((rows, total))
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
