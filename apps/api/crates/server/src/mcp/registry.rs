//! What an MCP tool is, and the helpers every tool file shares (D106).
//!
//! A tool runs the **web's own handler**: it builds the same extractor
//! values a signed-in request would have (with `source: "mcp"` so audit
//! rows say where the write came from), deserializes its arguments into
//! the same body or query type, and returns the same view. So every rule
//! the web enforces, MCP enforces, because it is the same code: role gates,
//! soft delete, audit rows, locks, the currency rules, one budget per
//! category, the invite rules. A tool adds a schema and nothing else.

use std::{future::Future, pin::Pin};

use axum::{http::StatusCode, Json};
use oewang_domain::{AppError, Envelope, Result, Role};
use serde::{de::DeserializeOwned, Serialize};
use serde_json::{json, Map, Value};

use crate::{
    auth::extractor::{Auth, AuthWrite},
    mcp::budget::Spend,
    response::{ApiError, RequestId},
    state::AppState,
};

/// The audit source of every MCP write.
pub const SOURCE_MCP: &str = "mcp";

/// Who a tool runs for, in which workspace, resolved and checked before the
/// tool is called: the workspace is inside the token's grant and the role
/// was just read from the membership row.
#[derive(Clone)]
pub struct Ctx {
    pub state: AppState,
    pub user_id: String,
    pub workspace_id: String,
    pub role: Role,
    pub request_id: String,
}

impl Ctx {
    /// The read extractor a web request would carry.
    pub fn auth(&self) -> Auth {
        Auth {
            user_id: self.user_id.clone(),
            workspace_id: self.workspace_id.clone(),
            role: self.role,
            source: SOURCE_MCP,
        }
    }

    /// The write extractor, refused for a member exactly as the web's is.
    pub fn auth_write(&self) -> Result<AuthWrite> {
        if !self.role.can_write() {
            return Err(AppError::InsufficientRole);
        }
        Ok(AuthWrite {
            user_id: self.user_id.clone(),
            workspace_id: self.workspace_id.clone(),
            role: self.role,
            source: SOURCE_MCP,
        })
    }

    pub fn request_id(&self) -> RequestId {
        RequestId(self.request_id.clone())
    }
}

pub type ToolFuture = Pin<Box<dyn Future<Output = Result<Value>> + Send>>;
pub type Handler = fn(Ctx, Value) -> ToolFuture;

/// One tool. `spend` decides the caps and the annotations; a `Delete` tool
/// also gets the two-step confirmation and a `confirmed` argument.
pub struct ToolDef {
    pub name: &'static str,
    pub description: &'static str,
    pub spend: Spend,
    /// The arguments as a JSON Schema object, without `workspace_id` or
    /// `confirmed`, which the server adds.
    pub schema: fn() -> Value,
    pub handler: Handler,
}

/// Box a tool's async function into a `Handler`.
#[macro_export]
macro_rules! mcp_handler {
    ($function:path) => {
        |ctx, args| Box::pin($function(ctx, args))
    };
}

// ----------------------------------------------------------------- results

/// The `data` of a handler's envelope.
pub fn out<T: Serialize>(
    result: std::result::Result<Json<Envelope<T>>, ApiError>,
) -> Result<Value> {
    let Json(envelope) = result.map_err(|error| error.error)?;
    to_value(envelope.data)
}

/// A paged list: the rows and the page meta, so a client can tell there is
/// more and ask for the next page.
pub fn out_page<T: Serialize>(
    result: std::result::Result<Json<Envelope<T>>, ApiError>,
) -> Result<Value> {
    let Json(envelope) = result.map_err(|error| error.error)?;
    Ok(json!({
        "rows": to_value(envelope.data)?,
        "page": to_value(envelope.meta.page)?,
    }))
}

/// The `data` of a handler that answers `201 Created`.
pub fn out_created<T: Serialize>(
    result: std::result::Result<(StatusCode, Json<Envelope<T>>), ApiError>,
) -> Result<Value> {
    let (_, Json(envelope)) = result.map_err(|error| error.error)?;
    to_value(envelope.data)
}

/// A handler that answers `204 No Content`.
pub fn out_done(result: std::result::Result<StatusCode, ApiError>) -> Result<Value> {
    result.map_err(|error| error.error)?;
    Ok(json!({ "ok": true }))
}

pub fn to_value<T: Serialize>(value: T) -> Result<Value> {
    serde_json::to_value(value).map_err(|error| AppError::Internal(anyhow::anyhow!(error)))
}

// --------------------------------------------------------------- arguments

/// Arguments into the web's own body or query type. A shape the type
/// refuses is a validation error the client's model can read and fix.
pub fn args<T: DeserializeOwned>(value: Value) -> Result<T> {
    let value = match value {
        Value::Null => Value::Object(Map::new()),
        other => other,
    };
    serde_json::from_value(value).map_err(|error| {
        let mut fields = oewang_domain::FieldErrors::new();
        fields.insert("arguments".into(), error.to_string());
        AppError::Validation(fields)
    })
}

/// One required string argument, such as an `id`.
pub fn take_str(args: &mut Value, key: &'static str) -> Result<String> {
    args.as_object_mut()
        .and_then(|map| map.remove(key))
        .and_then(|value| value.as_str().map(str::to_owned))
        .filter(|value| !value.trim().is_empty())
        .ok_or_else(|| AppError::validation([(key, "Required.")]))
}

// ----------------------------------------------------------------- schemas

pub fn object(properties: Value, required: &[&str]) -> Value {
    json!({
        "type": "object",
        "properties": properties,
        "required": required,
        "additionalProperties": false
    })
}

pub fn no_args() -> Value {
    object(json!({}), &[])
}

pub fn string(description: &str) -> Value {
    json!({ "type": "string", "description": description })
}

pub fn id(what: &str) -> Value {
    json!({ "type": "string", "description": format!("The {what}'s id.") })
}

/// Money is a decimal string, never a JSON number (D12).
pub fn money(description: &str) -> Value {
    json!({
        "type": "string",
        "pattern": "^-?[0-9]+(\\.[0-9]{1,4})?$",
        "description": format!("{description} A decimal string such as \"125000\" or \"12.50\", never a number.")
    })
}

pub fn day(description: &str) -> Value {
    json!({ "type": "string", "format": "date", "description": format!("{description} YYYY-MM-DD.") })
}

pub fn integer(description: &str, minimum: i64, maximum: i64) -> Value {
    json!({ "type": "integer", "minimum": minimum, "maximum": maximum, "description": description })
}

pub fn boolean(description: &str) -> Value {
    json!({ "type": "boolean", "description": description })
}

pub fn one_of(values: &[&str], description: &str) -> Value {
    json!({ "type": "string", "enum": values, "description": description })
}

pub fn list_of(items: Value, description: &str) -> Value {
    json!({ "type": "array", "items": items, "description": description })
}
