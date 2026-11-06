//! Members and invitations over MCP: the `/v1/workspaces/current/members`
//! and `/invites` handlers (WS-2 to WS-4).
//!
//! Roles: a member reads only, an admin also writes and manages members and
//! admins, an owner also manages owners. The handlers enforce all of it,
//! including the last-owner rule and that an admin cannot touch an owner.

use axum::extract::{Json, Path, State};
use serde_json::{json, Value};

use crate::{
    mcp::{
        budget::Spend,
        registry::{
            args, id, no_args, object, one_of, out, out_created, out_done, string, take_str, Ctx,
            ToolDef,
        },
    },
    mcp_handler,
    workspaces::handler::{self as web, InviteRequest, UpdateMemberRequest},
};
use oewang_domain::Result;

const ROLE: &str = "member reads only; admin also writes and manages members; owner also manages owners and the workspace. Only an owner can grant owner.";

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "list_members",
        description: "Everyone in the workspace with their email, name, role and join date.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(list_members),
    },
    ToolDef {
        name: "list_invites",
        description: "Pending invitations: email, role and expiry. Admin or owner only.",
        spend: Spend::Read,
        schema: no_args,
        handler: mcp_handler!(list_invites),
    },
    ToolDef {
        name: "invite_member",
        description: "Invite someone by email. oewang emails them a link that only that address can accept; inviting the same email again replaces the earlier link.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "email": string("The invitee's email address."),
                    "role": one_of(&["member", "admin", "owner"], ROLE)
                }),
                &["email", "role"],
            )
        },
        handler: mcp_handler!(invite),
    },
    ToolDef {
        name: "revoke_invite",
        description: "Cancel a pending invitation so its link no longer works.",
        spend: Spend::Delete,
        schema: || object(json!({ "id": id("invitation") }), &["id"]),
        handler: mcp_handler!(revoke_invite),
    },
    ToolDef {
        name: "update_member_role",
        description: "Change a member's role. An admin cannot change an owner, and the last owner cannot be demoted.",
        spend: Spend::Write,
        schema: || {
            object(
                json!({
                    "user_id": id("member's user"),
                    "role": one_of(&["member", "admin", "owner"], ROLE)
                }),
                &["user_id", "role"],
            )
        },
        handler: mcp_handler!(update_role),
    },
    ToolDef {
        name: "remove_member",
        description: "Remove someone from the workspace and end their sessions. An admin cannot remove an owner, and the last owner cannot be removed.",
        spend: Spend::Delete,
        schema: || object(json!({ "user_id": id("member's user") }), &["user_id"]),
        handler: mcp_handler!(remove),
    },
];

async fn list_members(ctx: Ctx, _value: Value) -> Result<Value> {
    out(web::list_members(State(ctx.state.clone()), ctx.auth(), ctx.request_id()).await)
}

/// A read, but the web gates it behind `AuthWrite`, so this does too.
async fn list_invites(ctx: Ctx, _value: Value) -> Result<Value> {
    out(web::list_invites(
        State(ctx.state.clone()),
        ctx.auth_write()?,
        ctx.request_id(),
    )
    .await)
}

/// The handler answers with the raw invite token for the web inviter to
/// pass on by hand. It is a secret that admits whoever holds it, so it is
/// removed before the client's model sees the result.
async fn invite(ctx: Ctx, value: Value) -> Result<Value> {
    let body: InviteRequest = args(value)?;
    let mut created = out_created(
        web::create_invite(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            ctx.request_id(),
            Json(body),
        )
        .await,
    )?;
    if let Some(map) = created.as_object_mut() {
        map.remove("token");
    }
    Ok(created)
}

async fn revoke_invite(ctx: Ctx, mut value: Value) -> Result<Value> {
    let id = take_str(&mut value, "id")?;
    out_done(
        web::revoke_invite(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(id),
            ctx.request_id(),
        )
        .await,
    )
}

async fn update_role(ctx: Ctx, mut value: Value) -> Result<Value> {
    let user_id = take_str(&mut value, "user_id")?;
    let body: UpdateMemberRequest = args(value)?;
    out_done(
        web::update_member(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(user_id),
            ctx.request_id(),
            Json(body),
        )
        .await,
    )
}

async fn remove(ctx: Ctx, mut value: Value) -> Result<Value> {
    let user_id = take_str(&mut value, "user_id")?;
    out_done(
        web::remove_member(
            State(ctx.state.clone()),
            ctx.auth_write()?,
            Path(user_id),
            ctx.request_id(),
        )
        .await,
    )
}
