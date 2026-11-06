//! Listing and calling tools for one MCP token (D106).
//!
//! Every call resolves its workspace again: inside the token's grant, and a
//! live membership right now, with the role read from the membership row.
//! A token that covers more than one workspace takes `workspace_id` as an
//! argument; that is the one place a workspace id is read from a request,
//! and it is never trusted on its own (AUTH-4).

use chrono::Utc;
use oewang_db::repositories::accounts::{self, WorkspaceMembershipRow};
use oewang_domain::{AppError, FieldErrors, Result};
use serde_json::{json, Map, Value};
use sqlx::PgPool;

use crate::{
    auth::service::current_role,
    mcp::{
        budget::Spend,
        caller::McpCaller,
        registry::{Ctx, ToolDef},
        tools,
    },
    state::AppState,
};

const WORKSPACE_ARG: &str = "workspace_id";
const CONFIRM_ARG: &str = "confirmed";

/// The workspaces this token may reach right now.
pub async fn workspaces(db: &PgPool, caller: &McpCaller) -> Result<Vec<WorkspaceMembershipRow>> {
    let rows = accounts::list_workspaces_for_user(db, &caller.user_id)
        .await
        .map_err(internal)?;
    Ok(match &caller.workspace_ids {
        None => rows,
        Some(grant) => rows
            .into_iter()
            .filter(|row| grant.contains(&row.id))
            .collect(),
    })
}

/// `tools/list`: every tool, with `workspace_id` added when the token can
/// reach more than one workspace and `confirmed` on every delete.
pub async fn list(state: &AppState, caller: &McpCaller) -> Result<Value> {
    let many = workspaces(&state.db, caller).await?.len() != 1;
    let mut listed = vec![describe(&LIST_WORKSPACES, false)];
    listed.extend(tools::all().map(|tool| describe(tool, many)));
    Ok(json!({ "tools": listed }))
}

fn describe(tool: &ToolDef, needs_workspace: bool) -> Value {
    let mut schema = (tool.schema)();
    if let Some(properties) = schema.get_mut("properties").and_then(Value::as_object_mut) {
        if needs_workspace {
            properties.insert(
                WORKSPACE_ARG.into(),
                json!({
                    "type": "string",
                    "description": "Which workspace. Call list_workspaces for the ids this connection may use."
                }),
            );
        }
        if tool.spend == Spend::Delete {
            properties.insert(
                CONFIRM_ARG.into(),
                json!({
                    "type": "boolean",
                    "description": "Leave out on the first call. The server answers CONFIRMATION_REQUIRED; show the user what will be deleted, and only after they agree call again with confirmed: true."
                }),
            );
        }
    }
    if needs_workspace {
        if let Some(required) = schema.get_mut("required").and_then(Value::as_array_mut) {
            required.push(json!(WORKSPACE_ARG));
        }
    }

    json!({
        "name": tool.name,
        "description": tool.description,
        "inputSchema": schema,
        "annotations": {
            "readOnlyHint": tool.spend == Spend::Read,
            "destructiveHint": tool.spend == Spend::Delete,
            "openWorldHint": false
        }
    })
}

/// `tools/call`. Returns the tool's data, or the refusal as an error.
pub async fn call(
    state: &AppState,
    caller: &McpCaller,
    request_id: &str,
    name: &str,
    arguments: Value,
) -> Result<Value> {
    let mut arguments = match arguments {
        Value::Null => Value::Object(Map::new()),
        Value::Object(map) => Value::Object(map),
        _ => {
            return Err(AppError::validation([(
                "arguments",
                "Send the arguments as an object.",
            )]))
        }
    };
    let now = Utc::now().timestamp();

    if name == LIST_WORKSPACES.name {
        state.mcp.spend(&caller.token_id, Spend::Read, now)?;
        let rows = workspaces(&state.db, caller).await?;
        return Ok(json!({
            "workspaces": rows.into_iter().map(|row| json!({
                "id": row.id,
                "name": row.name,
                "currency_code": row.currency_code,
                "role": row.role,
            })).collect::<Vec<_>>()
        }));
    }

    let tool = tools::all()
        .find(|tool| tool.name == name)
        .ok_or(AppError::ToolNotFound)?;

    let workspace_id = resolve_workspace(&state.db, caller, &mut arguments).await?;
    let role = current_role(&state.db, &workspace_id, &caller.user_id).await?;

    let confirmed = take_confirmed(&mut arguments);
    if tool.spend == Spend::Delete {
        // The exact call, workspace included, is what the user agrees to.
        let key = format!("{} {} {}", tool.name, workspace_id, arguments);
        let answered = confirmed && state.mcp.take_challenge(&caller.token_id, &key, now);
        if !answered {
            state.mcp.spend(&caller.token_id, Spend::Read, now)?;
            state.mcp.challenge(&caller.token_id, &key, now);
            let mut fields = FieldErrors::new();
            fields.insert(
                CONFIRM_ARG.into(),
                "Nothing was deleted. Show the user exactly what will be deleted and ask; only after they agree, call again with the same arguments and confirmed: true, within five minutes.".into(),
            );
            return Err(AppError::ConfirmationRequired(fields));
        }
    }

    state.mcp.spend(&caller.token_id, tool.spend, now)?;

    let ctx = Ctx {
        state: state.clone(),
        user_id: caller.user_id.clone(),
        workspace_id,
        role,
        request_id: request_id.to_string(),
    };
    (tool.handler)(ctx, arguments).await
}

pub async fn resolve_workspace(
    db: &PgPool,
    caller: &McpCaller,
    arguments: &mut Value,
) -> Result<String> {
    let requested = arguments
        .as_object_mut()
        .and_then(|map| map.remove(WORKSPACE_ARG))
        .and_then(|value| value.as_str().map(str::to_owned));
    let reachable = workspaces(db, caller).await?;

    match requested {
        Some(id) if reachable.iter().any(|row| row.id == id) => Ok(id),
        Some(_) => Err(AppError::NotAMember),
        None if reachable.len() == 1 => Ok(reachable[0].id.clone()),
        None if reachable.is_empty() => Err(AppError::NotAMember),
        None => Err(AppError::validation([(
            WORKSPACE_ARG,
            "This connection reaches more than one workspace. Call list_workspaces and pass workspace_id.",
        )])),
    }
}

fn take_confirmed(arguments: &mut Value) -> bool {
    arguments
        .as_object_mut()
        .and_then(|map| map.remove(CONFIRM_ARG))
        .and_then(|value| value.as_bool())
        .unwrap_or(false)
}

/// Listed first, answered here: it reads the token, not a workspace.
static LIST_WORKSPACES: ToolDef = ToolDef {
    name: "list_workspaces",
    description: "The workspaces this connection may use, with each one's id, currency and your role in it. Pass an id as workspace_id to every other tool when there is more than one.",
    spend: Spend::Read,
    schema: crate::mcp::registry::no_args,
    handler: |_, _| Box::pin(async { Err(AppError::ToolNotFound) }),
};

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}
