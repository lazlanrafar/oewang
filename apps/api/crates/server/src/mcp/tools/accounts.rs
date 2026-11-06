//! Wallets, wallet groups and categories over MCP: the `/v1/wallets`,
//! `/v1/wallet-groups` and `/v1/categories` handlers (WAL-*, CAT-*).

use axum::extract::{Json, Path, Query, State};
use serde_json::{json, Value};

use crate::{
    accounts::handler::{
        self as web, AdjustWalletBody, CategoryQuery, CreateCategoryBody, CreateWalletBody,
        UpdateCategoryBody, UpdateWalletBody, WalletGroupBody, WalletGroupPatchBody,
    },
    mcp::{
        budget::Spend,
        registry::{
            args, boolean, id, integer, money, no_args, object, one_of, out, out_created, out_done,
            string, take_str, Ctx, ToolDef,
        },
    },
    mcp_handler,
};
use oewang_domain::Result;

const SORT_ORDER: &str = "Position in lists; lower comes first.";

pub static TOOLS: &[ToolDef] = &[
    // ------------------------------------------------------------- wallets
    ToolDef {
        name: "list_wallets",
        description: "Every wallet in the workspace with its group, currency, balance (a decimal string), default flag and whether it counts in totals.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(list_wallets),
    },
    ToolDef {
        name: "get_wallet",
        description: "One wallet by id, with its current balance.",
        spend: Spend::Read,
        schema: || object(json!({ "id": id("wallet") }), &["id"]),
        handler: mcp_handler!(get_wallet),
    },
    ToolDef {
        name: "create_wallet",
        description: "Create a wallet. It starts at a zero balance; use adjust_wallet_balance to set an opening figure.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "name": string("The wallet's name."),
                    "group_id": id("wallet group to put it in"),
                    "currency_code": string("ISO 4217 code such as \"IDR\". The workspace currency when left out."),
                    "is_included_in_totals": boolean("Whether the balance counts in workspace totals. True when left out."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["name"],
            )
        },
        handler: mcp_handler!(create_wallet),
    },
    ToolDef {
        name: "update_wallet",
        description: "Change a wallet's name, group, currency, totals flag or position. Only the fields sent change. The currency is refused once the wallet has transactions, and the balance is never set here.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("wallet"),
                    "name": string("The new name."),
                    "group_id": {
                        "type": ["string", "null"],
                        "description": "The wallet group to move it to, or null to take it out of its group. Leave out to keep the group."
                    },
                    "currency_code": string("ISO 4217 code. Refused once the wallet has transactions."),
                    "is_included_in_totals": boolean("Whether the balance counts in workspace totals."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update_wallet),
    },
    ToolDef {
        name: "set_default_wallet",
        description: "Make this wallet the workspace default. The previous default stops being one.",
        spend: Spend::Write,
        schema: || object(json!({ "id": id("wallet") }), &["id"]),
        handler: mcp_handler!(set_default_wallet),
    },
    ToolDef {
        name: "adjust_wallet_balance",
        description: "Bring a wallet to a stated balance. oewang records the difference as one \"Balance adjustment\" transaction dated today and returns the updated wallet.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("wallet"),
                    "balance": money("The balance the wallet should show afterwards, in its own currency.")
                }),
                &["id", "balance"],
            )
        },
        handler: mcp_handler!(adjust_wallet),
    },
    ToolDef {
        name: "delete_wallet",
        description: "Delete a wallet. Refused while the wallet has transactions. If it was the default, the next wallet becomes the default.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("wallet") }), &["id"]),
        handler: mcp_handler!(delete_wallet),
    },
    // ------------------------------------------------------- wallet groups
    ToolDef {
        name: "list_wallet_groups",
        description: "Every wallet group in the workspace, in display order.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(list_groups),
    },
    ToolDef {
        name: "create_wallet_group",
        description: "Create a wallet group, a heading wallets can be filed under.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "name": string("The group's name."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["name"],
            )
        },
        handler: mcp_handler!(create_group),
    },
    ToolDef {
        name: "update_wallet_group",
        description: "Rename a wallet group or change its position. Only the fields sent change.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("wallet group"),
                    "name": string("The new name."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update_group),
    },
    ToolDef {
        name: "delete_wallet_group",
        description: "Delete a wallet group. Its wallets stay and become ungrouped.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("wallet group") }), &["id"]),
        handler: mcp_handler!(delete_group),
    },
    // ---------------------------------------------------------- categories
    ToolDef {
        name: "list_categories",
        description: "The workspace's categories, optionally only income or only expense ones.",
        spend: Spend::Read,
        schema: || object(json!({ "type": one_of(&["income", "expense"], "Only categories of this type. Both when left out.") }), &[]),
        handler: mcp_handler!(list_categories),
    },
    ToolDef {
        name: "create_category",
        description: "Create an income or expense category.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "name": string("The category's name."),
                    "type": one_of(&["income", "expense"], "Whether it labels income or expenses."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["name", "type"],
            )
        },
        handler: mcp_handler!(create_category),
    },
    ToolDef {
        name: "update_category",
        description: "Rename a category, change its type or its position. Only the fields sent change.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("category"),
                    "name": string("The new name."),
                    "type": one_of(&["income", "expense"], "The new type."),
                    "sort_order": integer(SORT_ORDER, 0, i32::MAX as i64)
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update_category),
    },
    ToolDef {
        name: "delete_category",
        description: "Delete a category. Its transactions keep their amounts and lose the category, and the category's budget is deleted with it.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("category") }), &["id"]),
        handler: mcp_handler!(delete_category),
    },
];

// ------------------------------------------------------------------ wallets

async fn list_wallets(ctx: Ctx, _value: Value) -> Result<Value> {
    out(web::list_wallets(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}

async fn get_wallet(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out(web::get_wallet(
        State(ctx.state.clone()),
        ctx.auth(),
        Path(id),
        ctx.request_id(),
    )
    .await)
}

async fn create_wallet(ctx: Ctx, value: Value) -> Result<Value> {
    let body: CreateWalletBody = args(value)?;
    out_created(
        web::create_wallet(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

/// `UpdateWalletBody` keeps its absent-versus-null `group_id` through
/// `args`, which is the same serde path the web body takes.
async fn update_wallet(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: UpdateWalletBody = args(value)?;
    out(web::update_wallet(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn set_default_wallet(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out(web::set_default_wallet(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
    )
    .await)
}

async fn adjust_wallet(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: AdjustWalletBody = args(value)?;
    out(web::adjust_wallet(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn delete_wallet(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::delete_wallet(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}

// ------------------------------------------------------------ wallet groups

async fn list_groups(ctx: Ctx, _value: Value) -> Result<Value> {
    out(web::list_groups(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}

async fn create_group(ctx: Ctx, value: Value) -> Result<Value> {
    let body: WalletGroupBody = args(value)?;
    out_created(
        web::create_group(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn update_group(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: WalletGroupPatchBody = args(value)?;
    out(web::update_group(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn delete_group(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::delete_group(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}

// --------------------------------------------------------------- categories

async fn list_categories(ctx: Ctx, value: Value) -> Result<Value> {
    let query: CategoryQuery = args(value)?;
    out(web::list_categories(
        State(ctx.state.clone()),
        ctx.auth(),
        Query(query),
        ctx.request_id(),
    )
    .await)
}

async fn create_category(ctx: Ctx, value: Value) -> Result<Value> {
    let body: CreateCategoryBody = args(value)?;
    out_created(
        web::create_category(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn update_category(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: UpdateCategoryBody = args(value)?;
    out(web::update_category(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}

async fn delete_category(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::delete_category(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}
