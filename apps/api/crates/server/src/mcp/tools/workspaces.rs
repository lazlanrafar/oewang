//! The current workspace over MCP: the `/v1/workspaces/current` handlers.
//!
//! Only the read and a name or country change. Changing the currency,
//! converting the ledger, deleting, creating and switching workspaces are
//! deliberately not exposed: each reprices or removes everything at once,
//! and belongs in the web app where its owner can see what it touches.

use axum::extract::{Json, State};
use serde::Deserialize;
use serde_json::{json, Value};

use crate::{
    mcp::{
        budget::Spend,
        registry::{args, no_args, object, out, string, Ctx, ToolDef},
    },
    mcp_handler,
    workspaces::handler::{self as web, UpdateWorkspaceRequest},
};
use oewang_domain::Result;

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "get_workspace",
        description: "The workspace this connection acts in: name, slug, currency, your role in it, and whether the currency is locked because transactions exist.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(get),
    },
    ToolDef {
        name: "update_workspace",
        description: "Rename the workspace or set its country. The currency cannot be changed over this connection. Returns the updated workspace.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "name": string("The new workspace name."),
                    "country": string("ISO 3166-1 alpha-2 country code, such as \"ID\".")
                }),
                &[],
            )
        },
        handler: mcp_handler!(update),
    },
];

/// The two fields this tool accepts. Unknown fields are refused so a
/// `currency_code` sent anyway fails loudly instead of being dropped.
#[derive(Deserialize)]
#[serde(deny_unknown_fields)]
struct UpdateArgs {
    name: Option<String>,
    country: Option<String>,
}

async fn get(ctx: Ctx, _value: Value) -> Result<Value> {
    out(web::current_workspace(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}

async fn update(ctx: Ctx, value: Value) -> Result<Value> {
    let UpdateArgs { name, country } = args(value)?;
    let body = UpdateWorkspaceRequest {
        name,
        country,
        currency_code: None,
    };
    web::update_workspace(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        ctx.request_id(),
        Json(body),
    )
    .await
    .map_err(|error| error.error)?;
    out(web::current_workspace(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}
