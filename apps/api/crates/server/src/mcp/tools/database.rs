//! The database screens over MCP: items bought (`/v1/items`, ITM-1, ITM-2)
//! and the exchange-rate snapshot (`/v1/fx/rates`, `/v1/fx/currencies`,
//! FX-1, FX-2).

use axum::extract::{Query, State};
use oewang_domain::Result;
use serde_json::{json, Value};

use crate::{
    fx::handler::{self as fx, RatesQuery},
    items::handler::{self as items, HistoryQuery, ItemListQuery},
    mcp::{
        budget::Spend,
        registry::{
            args, day, integer, no_args, object, one_of, out, out_page, string, Ctx, ToolDef,
        },
    },
    mcp_handler,
};

fn page_properties() -> (Value, Value) {
    (
        integer("Page number, from 1.", 1, 100_000),
        integer("Rows per page. 25 when left out.", 1, 100),
    )
}

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "list_items",
        description: "Items bought, from the line items on receipts: one row per item name and currency, with how often it was bought, the latest price, and the lowest and highest price paid. Paged; amounts are decimal strings in the row's currency.",
        spend: Spend::Read,
        schema: || {
            let (page, limit) = page_properties();
            object(
                json!({
                    "search": string("Part of an item name."),
                    "key": string("One exact item, by the key a row carries. Send currency with it."),
                    "currency": string("Items paid for in this ISO 4217 currency code, such as \"IDR\". Required with key."),
                    "sort": one_of(&["last_bought_at", "name", "purchases", "last_price"], "Sort field. last_bought_at when left out."),
                    "order": one_of(&["asc", "desc"], "Sort order. Newest first for last_bought_at, otherwise ascending, when left out."),
                    "page": page,
                    "limit": limit
                }),
                &[],
            )
        },
        handler: mcp_handler!(list_items),
    },
    ToolDef {
        name: "get_item_history",
        description: "Every purchase of one item, newest first: date, transaction, wallet, quantity, unit price and amount. Take key and currency from a list_items row. Paged.",
        spend: Spend::Read,
        schema: || {
            let (page, limit) = page_properties();
            object(
                json!({
                    "key": string("The item's key, from a list_items row."),
                    "currency": string("The item's ISO 4217 currency code, from the same row."),
                    "page": page,
                    "limit": limit
                }),
                &["key", "currency"],
            )
        },
        handler: mcp_handler!(item_history),
    },
    ToolDef {
        name: "list_exchange_rates",
        description: "The stored daily exchange-rate snapshot against the workspace currency: for each currency, what one unit is worth in the workspace currency and the inverse. Rates are decimal strings; quote them rather than recomputing. Paged.",
        spend: Spend::Read,
        schema: || {
            let (page, limit) = page_properties();
            object(
                json!({
                    "search": string("Part of a currency code."),
                    "date": day("The newest snapshot on or before this day. The newest snapshot when left out."),
                    "sort": one_of(&["code", "rate"], "Sort field. code when left out."),
                    "order": one_of(&["asc", "desc"], "Sort order. asc when left out."),
                    "page": page,
                    "limit": limit
                }),
                &[],
            )
        },
        handler: mcp_handler!(rates),
    },
    ToolDef {
        name: "list_currencies",
        description: "Every currency a wallet or transaction may use, with its latest rate against the workspace currency. The workspace currency comes first, at rate one.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(currencies),
    },
];

async fn list_items(ctx: Ctx, value: Value) -> Result<Value> {
    let query: ItemListQuery = args(value)?;
    out_page(
        items::list(
            State(ctx.state.clone()),
            ctx.auth(),
            Query(query),
            ctx.request_id(),
        )
        .await,
    )
}

async fn item_history(ctx: Ctx, value: Value) -> Result<Value> {
    let query: HistoryQuery = args(value)?;
    out_page(
        items::history(
            State(ctx.state.clone()),
            ctx.auth(),
            Query(query),
            ctx.request_id(),
        )
        .await,
    )
}

async fn rates(ctx: Ctx, value: Value) -> Result<Value> {
    let query: RatesQuery = args(value)?;
    out_page(
        fx::rates(
            State(ctx.state.clone()),
            ctx.auth(),
            Query(query),
            ctx.request_id(),
        )
        .await,
    )
}

async fn currencies(ctx: Ctx, _: Value) -> Result<Value> {
    out(fx::currencies(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}
