//! MCP over JSON-RPC 2.0, the stateless Streamable HTTP way: one request
//! in, one response out, no server-sent events (D106).

use oewang_domain::AppError;
use serde_json::{json, Value};

use crate::{
    mcp::{caller::McpCaller, service},
    state::AppState,
};

/// Newest first. The client's version is answered when it is one of these.
const PROTOCOL_VERSIONS: [&str; 3] = ["2025-06-18", "2025-03-26", "2024-11-05"];

const INSTRUCTIONS: &str = "oewang is a personal and small-team money tracker. \
Every amount is a decimal string, never a number, and every figure you read was computed by oewang: \
quote it, do not recalculate it. When this connection reaches more than one workspace, call \
list_workspaces first and pass workspace_id to every tool. Deletes are confirmed in two steps: \
the first call deletes nothing and asks you to check with the user.";

/// Answer one JSON-RPC message. None for a notification, which gets no
/// response.
pub async fn handle(
    state: &AppState,
    caller: &McpCaller,
    request_id: &str,
    message: Value,
) -> Option<Value> {
    let id = message.get("id").cloned();
    let method = message
        .get("method")
        .and_then(Value::as_str)
        .unwrap_or_default();

    // A notification has no id and is answered with nothing.
    let id = id?;

    if message.get("jsonrpc").and_then(Value::as_str) != Some("2.0") || method.is_empty() {
        return Some(failure(id, -32600, "Invalid request"));
    }

    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some(match method {
        "initialize" => success(id, initialize(&params)),
        "ping" => success(id, json!({})),
        "tools/list" => match service::list(state, caller).await {
            Ok(result) => success(id, result),
            Err(error) => failure(id, -32603, &error.to_string()),
        },
        "tools/call" => {
            let name = params
                .get("name")
                .and_then(Value::as_str)
                .unwrap_or_default();
            let arguments = params.get("arguments").cloned().unwrap_or(Value::Null);
            let outcome = service::call(state, caller, request_id, name, arguments).await;
            success(id, tool_result(outcome))
        }
        _ => failure(id, -32601, "Method not found"),
    })
}

fn initialize(params: &Value) -> Value {
    let asked = params
        .get("protocolVersion")
        .and_then(Value::as_str)
        .unwrap_or_default();
    let version = PROTOCOL_VERSIONS
        .iter()
        .find(|known| **known == asked)
        .unwrap_or(&PROTOCOL_VERSIONS[0]);

    json!({
        "protocolVersion": version,
        "capabilities": { "tools": { "listChanged": false } },
        "serverInfo": { "name": "oewang", "title": "oewang", "version": env!("CARGO_PKG_VERSION") },
        "instructions": INSTRUCTIONS
    })
}

/// A tool's answer as MCP content. A refusal is a result with `isError`,
/// not a protocol error, so the client's model reads it and can fix the
/// call: the same `code`, `message`, `hint` and `fields` the web gets.
fn tool_result(outcome: Result<Value, AppError>) -> Value {
    match outcome {
        Ok(value) => {
            let text = serde_json::to_string(&value).unwrap_or_default();
            let mut result =
                json!({ "content": [{ "type": "text", "text": text }], "isError": false });
            if value.is_object() {
                result["structuredContent"] = value;
            }
            result
        }
        Err(error) => {
            if let AppError::Internal(source) = &error {
                tracing::error!(error = %source, "mcp tool failed");
            }
            let body = json!({
                "code": error.code(),
                "message": if matches!(error, AppError::Internal(_)) { "Something went wrong.".to_string() } else { error.to_string() },
                "hint": error.hint(),
                "fields": match &error {
                    AppError::Validation(fields)
                    | AppError::ConfirmationRequired(fields)
                    | AppError::ToolArgsInvalid(fields) => json!(fields),
                    _ => Value::Null,
                },
            });
            json!({ "content": [{ "type": "text", "text": body.to_string() }], "isError": true })
        }
    }
}

fn success(id: Value, result: Value) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "result": result })
}

fn failure(id: Value, code: i64, message: &str) -> Value {
    json!({ "jsonrpc": "2.0", "id": id, "error": { "code": code, "message": message } })
}
