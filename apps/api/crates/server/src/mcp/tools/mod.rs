//! Every MCP tool, by area (D106). Each file wraps the web's own handlers;
//! see `mcp::registry` for why.

use oewang_db::PgPool;
use oewang_domain::{FieldErrors, Result};
use serde_json::Value;

use crate::mcp::registry::ToolDef;

pub mod accounts;
pub mod budgets;
pub mod contacts;
pub mod database;
pub mod debts;
pub mod members;
pub mod reports;
pub mod settings;
pub mod transactions;
pub mod vault;
pub mod workspaces;

const AREAS: &[&[ToolDef]] = &[
    workspaces::TOOLS,
    transactions::TOOLS,
    accounts::TOOLS,
    budgets::TOOLS,
    debts::TOOLS,
    contacts::TOOLS,
    reports::TOOLS,
    database::TOOLS,
    vault::TOOLS,
    members::TOOLS,
    settings::TOOLS,
];

/// The whole catalogue, in the order `tools/list` shows it.
pub fn all() -> impl Iterator<Item = &'static ToolDef> {
    AREAS.iter().flat_map(|area| area.iter())
}

/// What a confirmed call would do, for the first of its two calls (D122).
/// Only a split has figures to show; a delete is described by its own
/// arguments.
pub async fn preview(
    db: &PgPool,
    workspace_id: &str,
    tool: &str,
    arguments: &Value,
) -> Result<FieldErrors> {
    match tool {
        "split_bill" => debts::preview_split(db, workspace_id, arguments).await,
        _ => Ok(FieldErrors::new()),
    }
}
