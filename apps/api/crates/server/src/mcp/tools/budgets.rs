//! Budgets over MCP: the `/v1/budgets` handlers (BUD-1 to BUD-3).

use axum::extract::{Json, Path, Query, State};
use serde_json::{json, Value};

use crate::{
    budgets::handler::{self as web, CreateBody, StatusQuery, UpdateBody},
    mcp::{
        budget::Spend,
        registry::{
            args, id, money, object, one_of, out, out_created, out_done, string, take_str, Ctx,
            ToolDef,
        },
    },
    mcp_handler,
};
use oewang_domain::Result;

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "get_budget_status",
        description: "Every budget for one month: limit, spent, remaining, percent used and state (safe, warning from 80%, over past 100%), with totals. Figures are formatted by oewang; quote them.",
        spend: Spend::Read,
        schema: || {
            object(
                json!({
                    "month": { "type": "string", "pattern": "^[0-9]{4}-[0-9]{2}$", "description": "YYYY-MM. The current month when left out." },
                    "search": string("Part of a category name."),
                    "sort": one_of(&["category", "amount", "spent", "remaining", "percent"], "Sort field."),
                    "order": one_of(&["asc", "desc"], "Sort order.")
                }),
                &[],
            )
        },
        handler: mcp_handler!(status),
    },
    ToolDef {
        name: "create_budget",
        description: "Set a monthly limit on one expense category, in the workspace currency. A category has at most one budget.",
        spend: Spend::Write,
        schema: || object(json!({ "category_id": id("expense category"), "amount": money("The monthly limit.") }), &["category_id", "amount"]),
        handler: mcp_handler!(create),
    },
    ToolDef {
        name: "update_budget",
        description: "Change a budget's monthly limit. Its category cannot change.",
        spend: Spend::Write,
        schema: || object(json!({ "id": id("budget"), "amount": money("The new monthly limit.") }), &["id", "amount"]),
        handler: mcp_handler!(update),
    },
    ToolDef {
        name: "delete_budget",
        description: "Delete a budget. The category and its transactions stay.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("budget") }), &["id"]),
        handler: mcp_handler!(delete),
    },
];

async fn status(ctx: Ctx, value: Value) -> Result<Value> {
    let query: StatusQuery = args(value)?;
    out(web::status(
        State(ctx.state.clone()),
        ctx.auth(),
        Query(query),
        ctx.request_id(),
    )
    .await)
}

async fn create(ctx: Ctx, value: Value) -> Result<Value> {
    let body: CreateBody = args(value)?;
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
    let body: UpdateBody = args(value)?;
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
