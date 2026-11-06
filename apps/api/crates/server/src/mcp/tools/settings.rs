//! Settings over MCP: the assistant's settings (`/v1/ai/settings`) and
//! feedback (`/v1/feedback`, FB-1).

use axum::extract::{Json, State};
use serde_json::{json, Value};

use crate::{
    ai::handler::{self as ai, SettingsBody},
    feedback::handler::{self as feedback, SendBody},
    mcp::{
        budget::Spend,
        registry::{args, no_args, object, one_of, out, out_created, Ctx, ToolDef},
    },
    mcp_handler,
};
use oewang_domain::Result;

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "get_assistant_settings",
        description: "The workspace's chat assistant settings: its custom instructions and the language it answers in.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(get_settings),
    },
    ToolDef {
        name: "update_assistant_settings",
        description: "Change the chat assistant's custom instructions, its answer language, or both. A field left out is left alone; empty custom_instructions clears them.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "custom_instructions": {
                        "type": "string",
                        "maxLength": 2000,
                        "description": "Text the assistant is given on every chat turn, at most 2000 characters. An empty string clears it."
                    },
                    "response_language": one_of(&["auto", "english", "indonesian"], "The language the assistant answers in. auto follows the user's message.")
                }),
                &[],
            )
        },
        handler: mcp_handler!(update_settings),
    },
    ToolDef {
        name: "send_feedback",
        description: "Send feedback about oewang to its team: a bug report, a feature request or anything else. Any member may send it.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "type": one_of(&["bug", "feature", "other"], "What kind of feedback this is."),
                    "message": {
                        "type": "string",
                        "minLength": 1,
                        "maxLength": 5000,
                        "description": "The feedback itself, at most 5000 characters."
                    }
                }),
                &["type", "message"],
            )
        },
        handler: mcp_handler!(send_feedback),
    },
];

async fn get_settings(ctx: Ctx, _: Value) -> Result<Value> {
    out(ai::get_settings(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}

async fn update_settings(ctx: Ctx, value: Value) -> Result<Value> {
    let body: SettingsBody = args(value)?;
    out(ai::update_settings(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        ctx.request_id(),
        Json(body),
    )
    .await)
}

/// Any role, as on the web: the handler takes `Auth`, not `AuthWrite`.
async fn send_feedback(ctx: Ctx, value: Value) -> Result<Value> {
    let body: SendBody = args(value)?;
    out_created(
        feedback::send(
            State(ctx.state.clone()),
            ctx.auth(),
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}
