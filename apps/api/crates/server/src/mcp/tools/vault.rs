//! The vault over MCP: the `/v1/files` handlers that read and change a
//! file's record (VLT-6 to VLT-11).
//!
//! Upload, chunk reads and thumbnails are left out on purpose: they move
//! bytes, and a file's contents are attacker-controlled text that would
//! reach a model holding tools (D24). Every tool here returns the record,
//! never the contents.

use axum::extract::{Json, Path, Query, State};
use serde_json::{json, Value};

use crate::{
    mcp::{
        budget::Spend,
        registry::{
            args, id, integer, list_of, object, one_of, out, out_done, out_page, string, take_str,
            Ctx, ToolDef,
        },
    },
    mcp_handler,
    vault::handler::{self as web, FileListQuery, UpdateBody},
};
use oewang_domain::Result;

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "list_files",
        description: "Files in the vault (receipts, statements and other images or PDFs): name, type, size in bytes, tags, and how many live transactions carry each one. Paged.",
        spend: Spend::Read,
        schema: || {
            object(
                json!({
                    "search": string("Part of a file name."),
                    "type": one_of(&["image", "pdf"], "Only images, or only PDFs."),
                    "size": one_of(&["lt1", "1to5", "gt5"], "Size band: under 1 MB, 1 to 5 MB, or over 5 MB."),
                    "tag": string("Only files carrying this tag."),
                    "sort": one_of(&["newest", "name_asc", "name_desc", "size_desc", "size_asc"], "Sort order. newest when left out."),
                    "page": integer("Page number, from 1.", 1, 100_000),
                    "limit": integer("Rows per page. 25 when left out.", 1, 100)
                }),
                &[],
            )
        },
        handler: mcp_handler!(list),
    },
    ToolDef {
        name: "get_file",
        description: "One vault file's record: name, type, size, tags, status, and the transactions that carry it. Never the file's contents.",
        spend: Spend::Read,
        schema: || object(json!({ "id": id("file") }), &["id"]),
        handler: mcp_handler!(get),
    },
    ToolDef {
        name: "update_file",
        description: "Rename a vault file, replace its tags, or both. A field left out is left alone; tags replace the whole list.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "id": id("file"),
                    "name": string("The new file name."),
                    "tags": list_of(
                        json!({ "type": "string", "maxLength": 32 }),
                        "The file's complete tag list, at most 10 tags of at most 32 characters. Duplicates are merged ignoring case; an empty list removes every tag."
                    )
                }),
                &["id"],
            )
        },
        handler: mcp_handler!(update),
    },
    ToolDef {
        name: "delete_file",
        description: "Delete a vault file. It is detached from every transaction that carried it; the transactions themselves stay.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("file") }), &["id"]),
        handler: mcp_handler!(delete),
    },
];

async fn list(ctx: Ctx, value: Value) -> Result<Value> {
    let query: FileListQuery = args(value)?;
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

async fn get(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out(web::get_file(
        State(ctx.state.clone()),
        ctx.auth(),
        Path(id),
        ctx.request_id(),
    )
    .await)
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
        web::delete_file(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}
