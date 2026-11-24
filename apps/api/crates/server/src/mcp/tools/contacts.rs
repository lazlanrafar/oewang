//! Contacts over MCP: the `/v1/contacts` handlers (CON-1 to CON-4,
//! DEBT-15). A merge soft-deletes the contact it empties, so it is
//! confirmed and counted like a delete.

use axum::extract::{Json, Path, Query, State};
use oewang_domain::Result;
use serde_json::{json, Value};

use crate::{
    contacts::handler::{self as web, CreateBody, ListQuery, MergeBody, UpdateBody},
    mcp::{
        budget::Spend,
        registry::{
            args, id, integer, object, one_of, out, out_created, out_done, out_page, string,
            take_str, Ctx, ToolDef,
        },
    },
    mcp_handler,
    offline::IfMatch,
};

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "list_contacts",
        description: "Contacts, the people debts are owed between, with how many debts each has. Search covers name, email and phone.",
        spend: Spend::Read,
        schema: || {
            object(
                json!({
                    "search": string("Part of a name, email or phone."),
                    "sort": one_of(&["name", "created_at"], "Sort field."),
                    "order": one_of(&["asc", "desc"], "Sort order."),
                    "page": integer("Page, from 1.", 1, 10_000),
                    "per_page": integer("Rows per page.", 1, 100)
                }),
                &[],
            )
        },
        handler: mcp_handler!(list),
    },
    ToolDef {
        name: "create_contact",
        description: "Create a contact. Two people may share a name; check list_contacts first rather than making a duplicate.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "name": string("Their name."),
                    "email": string("Email address."),
                    "phone": string("Phone number."),
                    "note": string("A note.")
                }),
                &["name"],
            )
        },
        handler: mcp_handler!(create),
    },
    ToolDef {
        name: "update_contact",
        description: "Change a contact's name, email, phone or note; send only what changes, null clears one.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("contact"),
                    "name": string("Their name."),
                    "email": string("Email address."),
                    "phone": string("Phone number."),
                    "note": string("A note.")
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update),
    },
    ToolDef {
        name: "delete_contact",
        description: "Delete a contact with no debts. A contact with any debt, paid or not, is refused; merge it into another instead.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("contact") }), &["id"]),
        handler: mcp_handler!(delete),
    },
    ToolDef {
        name: "merge_contacts",
        description: "Merge a duplicate contact into another: every debt of id moves to into_id, and id is deleted.",
        spend: Spend::Delete,
        schema: || {
            object(
                json!({ "id": id("contact to merge away"), "into_id": id("contact that keeps the debts") }),
                &["id", "into_id"],
            )
        },
        handler: mcp_handler!(merge),
    },
];

async fn list(ctx: Ctx, value: Value) -> Result<Value> {
    let query: ListQuery = args(value)?;
    out_page(
        web::list(
            State(ctx.state.clone()),
            ctx.auth(),
            Query(query),
            ctx.request_id(),
        )
        .await,
    )
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
        IfMatch(None),
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

async fn merge(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    let body: MergeBody = args(value)?;
    out(web::merge(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        Path(id),
        ctx.request_id(),
        Json(body),
    )
    .await)
}
