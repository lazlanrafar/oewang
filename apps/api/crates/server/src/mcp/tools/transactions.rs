//! Transactions over MCP: the `/v1/transactions` handlers (TXN-1 to
//! TXN-13). No bulk, import or export tools: each write here is one row.

use axum::extract::{Json, Path, State};
use oewang_domain::{AppError, Result};
use serde_json::{json, Value};

use crate::{
    mcp::{
        budget::Spend,
        registry::{
            args, boolean, day, id, integer, list_of, money, object, one_of, out, out_created,
            out_done, out_page, string, take_str, Ctx, ToolDef,
        },
    },
    mcp_handler,
    transactions::handler::{self as web, ItemBody, ListQuery, TransactionBody},
};

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "import_transactions",
        description: "Import rows from a spreadsheet or bank statement into one wallet, through the same import as the web's CSV wizard: each row is a map of column name to cell text, and mapping says which column is the date, the amount (one signed column, or amount_out and amount_in), the name, description, currency and category. Read the file yourself and send the rows as text. Rows already imported are skipped as duplicates, so importing the same file twice adds nothing. Dates in YYYY-MM-DD, DD/MM/YYYY and similar; amounts like 50000, 50.000,00 or (50,000.00). One call per wallet, at most 5000 rows.",
        spend: Spend::Write,
        schema: || {
            let column = |what: &str| string(&format!("The column name that holds {what}.") );
            object(
                json!({
                    "wallet_id": id("wallet every row goes into"),
                    "mapping": {
                        "type": "object",
                        "additionalProperties": false,
                        "description": "Column names from the rows. Map date and either amount or amount_out/amount_in.",
                        "properties": {
                            "date": column("the date"),
                            "name": column("what it was"),
                            "description": column("a note"),
                            "amount": column("one signed amount: negative is an expense"),
                            "amount_out": column("money out (expenses)"),
                            "amount_in": column("money in (income)"),
                            "currency": column("the currency code, when rows differ"),
                            "category": column("the category name")
                        }
                    },
                    "rows": {
                        "type": "array",
                        "maxItems": 5000,
                        "description": "One object per row: column name to cell text, exactly as in the file.",
                        "items": { "type": "object", "additionalProperties": { "type": "string" } }
                    },
                    "categories": {
                        "type": "object",
                        "additionalProperties": { "type": "string" },
                        "description": "Category name as it appears in the file, lowercased, to an existing category id (list_categories, create_category). A name left out imports without a category."
                    }
                }),
                &["wallet_id", "mapping", "rows"],
            )
        },
        handler: mcp_handler!(import),
    },
    ToolDef {
        name: "list_transactions",
        description: "List transactions, newest first by default, with the same filters as the web list, one page at a time (at most 100 per page). Amounts are decimal strings in each row's wallet currency; base_amount is the workspace-currency figure.",
        spend: Spend::Read,
        schema: || object(list_properties(true), &[]),
        handler: mcp_handler!(list),
    },
    ToolDef {
        name: "get_transaction",
        description: "One transaction with its line items and attached files (names and ids only, never the file contents).",
        spend: Spend::Read,
        schema: || object(json!({ "id": id("transaction") }), &["id"]),
        handler: mcp_handler!(get),
    },
    ToolDef {
        name: "get_transaction_history",
        description: "The audit history of one transaction and its line items: who changed what, from which surface, with the before and after values.",
        spend: Spend::Read,
        schema: || object(json!({ "id": id("transaction") }), &["id"]),
        handler: mcp_handler!(history),
    },
    ToolDef {
        name: "get_transaction_summary",
        description: "Totals by type and by category for the transactions matching the filters, in the workspace currency. The totals are computed by oewang as decimal strings; quote them rather than adding rows yourself.",
        spend: Spend::Read,
        schema: || object(list_properties(false), &[]),
        handler: mcp_handler!(summary),
    },
    ToolDef {
        name: "create_transaction",
        description: "Record one income, expense or transfer and move the wallet balances it touches. Amounts are decimal strings; the workspace-currency figure is computed by oewang.",
        spend: Spend::Write,
        schema: || {
            let mut properties = transaction_properties();
            insert(
                &mut properties,
                "items",
                list_of(
                    object(item_properties(), &["name", "amount"]),
                    "Line items written with the transaction, in the same database write. Their total need not match the amount.",
                ),
            );
            object(properties, &TRANSACTION_REQUIRED)
        },
        handler: mcp_handler!(create),
    },
    ToolDef {
        name: "update_transaction",
        description: "Replace a transaction's fields and rebalance the wallets. Send every field to keep: an optional field left out is cleared, except attachment_ids, which is left alone when absent. Line items change through their own tools.",
        spend: Spend::Write,
        schema: || {
            let mut properties = transaction_properties();
            insert(&mut properties, "id", id("transaction"));
            object(properties, &["id", "type", "wallet_id", "amount", "date"])
        },
        handler: mcp_handler!(update),
    },
    ToolDef {
        name: "delete_transaction",
        description: "Delete a transaction. The delete is soft and reverses the balance change it made on its wallets.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("transaction") }), &["id"]),
        handler: mcp_handler!(delete),
    },
    ToolDef {
        name: "add_transaction_item",
        description: "Add a line item to a transaction. Items are a breakdown only: they never change the transaction's amount or any balance.",
        spend: Spend::Write,
        schema: || {
            let mut properties = item_properties();
            insert(&mut properties, "transaction_id", id("transaction"));
            object(properties, &["transaction_id", "name", "amount"])
        },
        handler: mcp_handler!(add_item),
    },
    ToolDef {
        name: "update_transaction_item",
        description: "Replace one line item's fields. An optional field left out is cleared. The transaction's amount and balances do not change.",
        spend: Spend::Write,
        schema: || {
            let mut properties = item_properties();
            insert(&mut properties, "transaction_id", id("transaction"));
            insert(&mut properties, "item_id", id("line item"));
            object(properties, &["transaction_id", "item_id", "name", "amount"])
        },
        handler: mcp_handler!(replace_item),
    },
    ToolDef {
        name: "delete_transaction_item",
        description: "Delete one line item from a transaction. The delete is soft; the transaction's amount and balances do not change.",
        spend: Spend::Delete,
        schema: || object(json!({ "transaction_id": id("transaction"), "item_id": id("line item") }), &["transaction_id", "item_id"]),
        handler: mcp_handler!(delete_item),
    },
];

const TRANSACTION_REQUIRED: [&str; 4] = ["type", "wallet_id", "amount", "date"];

// ----------------------------------------------------------------- schemas

/// The web list's filters. `paged` adds sort and paging, which the summary
/// does not read.
fn list_properties(paged: bool) -> Value {
    let mut properties = json!({
        "start_date": day("First day of the range, inclusive."),
        "end_date": day("Last day of the range, inclusive."),
        "type": one_of(&["income", "expense", "transfer"], "Only this type."),
        "wallet_ids": list_of(id("wallet"), "Only transactions in any of these wallets."),
        "category_ids": list_of(id("category"), "Only transactions in any of these categories."),
        "search": string("Text to find in the name or description."),
        "is_ready": boolean("Only transactions marked ready (true) or not ready (false)."),
        "min_amount": money("Smallest amount, inclusive."),
        "max_amount": money("Largest amount, inclusive.")
    });
    if paged {
        insert(
            &mut properties,
            "sort",
            one_of(
                &["date", "amount", "name", "created_at"],
                "Sort field. date when left out.",
            ),
        );
        insert(
            &mut properties,
            "order",
            one_of(&["asc", "desc"], "Sort order. desc when left out."),
        );
        insert(
            &mut properties,
            "page",
            integer("Page number, from 1.", 1, i64::from(u32::MAX)),
        );
        insert(
            &mut properties,
            "limit",
            integer("Rows per page. 25 when left out.", 1, 100),
        );
    }
    properties
}

/// Every field of the web's `TransactionBody` except `items`, which only a
/// create reads, and `source`, which is the browser's claim and not the
/// client's to make here.
fn transaction_properties() -> Value {
    json!({
        "type": one_of(&["income", "expense", "transfer"], "The transaction type."),
        "wallet_id": string("The wallet's id; for a transfer, the wallet the money leaves."),
        "to_wallet_id": string("The destination wallet's id. Required for a transfer, refused otherwise."),
        "category_id": string("The category's id. Left out for an uncategorised transaction."),
        "amount": money("The amount in the wallet's currency, greater than zero."),
        "to_amount": money("What the destination wallet receives, in its own currency. Required for a transfer, refused otherwise."),
        "original_amount": money("The amount as typed in a foreign currency. Send it with original_currency_code and exchange_rate, or none of the three; amount must then equal original_amount times exchange_rate."),
        "original_currency_code": string("ISO 4217 code of the foreign currency, different from the wallet's. Sent with original_amount and exchange_rate."),
        "exchange_rate": rate("Wallet-currency units per one unit of the foreign currency. Sent with original_amount and original_currency_code."),
        "base_rate": rate("A suggested wallet-to-workspace currency rate. oewang resolves the rate itself and computes base_amount; this is a hint, not a value written as given."),
        "date": { "type": "string", "format": "date-time", "description": "When it happened, as an RFC 3339 timestamp such as \"2026-11-06T09:30:00Z\"." },
        "name": string("A short name, such as the merchant."),
        "description": string("A longer note."),
        "is_ready": boolean("Whether the transaction is reviewed and ready. false when left out."),
        "attachment_ids": list_of(id("vault file"), "The whole set of vault files attached. Left out leaves the attachments alone; sent, it replaces them.")
    })
}

/// Every field of the web's `ItemBody`.
fn item_properties() -> Value {
    json!({
        "name": string("What the item is."),
        "brand": string("The brand, if any."),
        "quantity": money("How many, greater than zero."),
        "unit": string("The unit of the quantity, such as kg or pcs."),
        "unit_price": money("Price per unit."),
        "amount": money("The line total. Not zero; negative for a refund line."),
        "category_id": string("The category's id for this line, when it differs from the transaction's."),
        "notes": string("A note on this line.")
    })
}

/// A rate carries more decimals than money does.
fn rate(description: &str) -> Value {
    json!({
        "type": "string",
        "pattern": "^[0-9]+(\\.[0-9]{1,8})?$",
        "description": format!("{description} A decimal string such as \"16250.5\", never a number.")
    })
}

fn insert(properties: &mut Value, key: &str, schema: Value) {
    if let Some(map) = properties.as_object_mut() {
        map.insert(key.to_owned(), schema);
    }
}

// ---------------------------------------------------------------- handlers

async fn list(ctx: Ctx, value: Value) -> Result<Value> {
    let query = list_query(value)?;
    out_page(
        web::list(
            State(ctx.state.clone()),
            ctx.auth(),
            query,
            ctx.request_id(),
        )
        .await,
    )
}

async fn get(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out(web::get(
        State(ctx.state.clone()),
        ctx.auth(),
        Path(id),
        ctx.request_id(),
    )
    .await)
}

async fn history(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out(web::history(
        State(ctx.state.clone()),
        ctx.auth(),
        Path(id),
        ctx.request_id(),
    )
    .await)
}

async fn summary(ctx: Ctx, value: Value) -> Result<Value> {
    let query = list_query(value)?;
    out(web::summary(
        State(ctx.state.clone()),
        ctx.auth(),
        query,
        ctx.request_id(),
    )
    .await)
}

async fn create(ctx: Ctx, value: Value) -> Result<Value> {
    let mut body: TransactionBody = args(value)?;
    // The browser's surface claim is not an MCP client's to make.
    body.source = None;
    out_created(
        web::create(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn update(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let mut body: TransactionBody = args(value)?;
    body.source = None;
    out(web::update(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn delete(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::delete(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}

async fn add_item(ctx: Ctx, mut value: Value) -> Result<Value> {
    let transaction_id = take_str(&mut value, "transaction_id")?;
    let body: ItemBody = args(value)?;
    out_created(
        web::add_item(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(transaction_id),
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn replace_item(ctx: Ctx, mut value: Value) -> Result<Value> {
    let transaction_id = take_str(&mut value, "transaction_id")?;
    let item_id = take_str(&mut value, "item_id")?;
    let body: ItemBody = args(value)?;
    out(web::replace_item(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path((transaction_id, item_id)),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn delete_item(ctx: Ctx, mut value: Value) -> Result<Value> {
    let transaction_id = take_str(&mut value, "transaction_id")?;
    let item_id = take_str(&mut value, "item_id")?;
    out_done(
        web::delete_item(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path((transaction_id, item_id)),
            ctx.request_id(),
        )
        .await,
    )
}

// ----------------------------------------------------------------- helpers

/// The web's `ListQuery`. Its two id lists are skipped by serde because the
/// web reads them from a repeated query parameter; here they are arrays.
fn list_query(mut value: Value) -> Result<ListQuery> {
    let wallet_ids = take_ids(&mut value, "wallet_ids")?;
    let category_ids = take_ids(&mut value, "category_ids")?;
    let mut query: ListQuery = args(value)?;
    query.wallet_ids = wallet_ids;
    query.category_ids = category_ids;
    Ok(query)
}

/// An optional array of ids. Blank entries are dropped, as the web drops a
/// blank `?wallet_id=`.
fn take_ids(value: &mut Value, key: &'static str) -> Result<Vec<String>> {
    let taken = value.as_object_mut().and_then(|map| map.remove(key));
    match taken {
        None | Some(Value::Null) => Ok(Vec::new()),
        Some(Value::Array(items)) => items
            .into_iter()
            .map(|item| match item {
                Value::String(text) => Ok(text.trim().to_owned()),
                _ => Err(AppError::validation([(
                    key,
                    "Send an array of id strings.",
                )])),
            })
            .filter(|item| !matches!(item, Ok(text) if text.is_empty()))
            .collect(),
        Some(_) => Err(AppError::validation([(
            key,
            "Send an array of id strings.",
        )])),
    }
}

/// The web's CSV import (TXN-15, TXN-16): fingerprints, the row limit and
/// the per-row outcomes are the import's own. Audited as `import`, as the
/// web's is: the row came from a file either way.
async fn import(ctx: Ctx, value: Value) -> Result<Value> {
    let body: web::ImportBody = args(value)?;
    out(web::import_csv(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        ctx.request_id(),
        Json(body),
    )
    .await)
}
