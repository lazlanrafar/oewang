//! Every MCP tool, by area (D106). Each file wraps the web's own handlers;
//! see `mcp::registry` for why.

use crate::mcp::registry::ToolDef;

pub mod accounts;
pub mod budgets;
pub mod database;
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
