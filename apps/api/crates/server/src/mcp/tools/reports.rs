//! Reports over MCP: the overview page's `/v1/reports/overview` handler
//! (OVR-2, OVR-3) and the three analysis reports the chat draws as canvases
//! (CHAT-17, D88).
//!
//! The analysis reports have no web route of their own; the chat reaches
//! them through `ai::tools`, which also leaves a canvas artifact on the turn.
//! An MCP client has no turn, so these tools call the same report builders
//! the chat does, with the chat's own argument parsing (`ToolCall::parse`),
//! and return the report as the builder made it. Behaviour and validation
//! match the chat's tool of the same name; nothing touches the turn store.

use axum::extract::{Query, State};
use oewang_domain::{
    tools::{RangeArgs, Tool, ToolCall},
    AppError, Result,
};
use serde_json::{json, Value};

use crate::{
    mcp::{
        budget::Spend,
        registry::{args, day, object, out, to_value, Ctx, ToolDef},
    },
    mcp_handler,
    reports::{
        handler::{self as web, RangeQuery},
        service::{self as reports, DayRange},
    },
};

/// `from` and `to`, both required, as every report here takes them.
fn range_schema() -> Value {
    object(
        json!({
            "from": day("The first day of the range, inclusive."),
            "to": day("The last day of the range, inclusive. A report covers at most 60 months.")
        }),
        &["from", "to"],
    )
}

pub static TOOLS: &[ToolDef] = &[
    ToolDef {
        name: "get_overview",
        description: "The overview page for a date range: income, expense and net with the change against the preceding period of equal length, monthly averages, a month-by-month series, and income and expense by category, all in the workspace currency. Figures are computed and formatted by oewang; quote them rather than recomputing.",
        spend: Spend::Read,
        schema: range_schema,
        handler: mcp_handler!(overview),
    },
    ToolDef {
        name: "get_spending_analysis",
        description: "Spending over a date range: the total with the change against the preceding period, the transaction count, each expense category's share, and the largest expenses. Figures are computed and formatted by oewang; quote them rather than recomputing.",
        spend: Spend::Read,
        schema: range_schema,
        handler: mcp_handler!(spending),
    },
    ToolDef {
        name: "get_income_summary",
        description: "Income over a date range: the total with the change against the preceding period, the monthly average, each month beside the same month a year earlier, income by category, and the latest income transactions. Figures are computed and formatted by oewang; quote them rather than recomputing.",
        spend: Spend::Read,
        schema: range_schema,
        handler: mcp_handler!(income),
    },
    ToolDef {
        name: "get_burn_rate",
        description: "How fast money is spent over a date range: total spending, the average per month, each month's spending, and how many months spent more than the average. Figures are computed and formatted by oewang; quote them rather than recomputing.",
        spend: Spend::Read,
        schema: range_schema,
        handler: mcp_handler!(burn_rate),
    },
];

async fn overview(ctx: Ctx, value: Value) -> Result<Value> {
    let query: RangeQuery = args(value)?;
    out(web::overview(
        State(ctx.state.clone()),
        ctx.auth(),
        ctx.request_id(),
        Query(query),
    )
    .await)
}

async fn spending(ctx: Ctx, value: Value) -> Result<Value> {
    let range = range(Tool::GetSpendingAnalysis, &value)?;
    to_value(reports::spending(&ctx.state.db, &ctx.workspace_id, range).await?)
}

async fn income(ctx: Ctx, value: Value) -> Result<Value> {
    let range = range(Tool::GetIncomeSummary, &value)?;
    to_value(reports::income(&ctx.state.db, &ctx.workspace_id, range).await?)
}

async fn burn_rate(ctx: Ctx, value: Value) -> Result<Value> {
    let range = range(Tool::GetBurnRate, &value)?;
    to_value(reports::burn_rate(&ctx.state.db, &ctx.workspace_id, range).await?)
}

/// The range exactly as the chat's tool of the same name reads it: both
/// ends required and in order, unknown keys refused, then the report's own
/// limits (at most 60 months) applied by `DayRange`.
fn range(tool: Tool, value: &Value) -> Result<DayRange> {
    let parsed: RangeArgs = match ToolCall::parse(tool, value)? {
        ToolCall::GetSpendingAnalysis(parsed)
        | ToolCall::GetIncomeSummary(parsed)
        | ToolCall::GetBurnRate(parsed) => parsed,
        _ => {
            return Err(AppError::Internal(anyhow::anyhow!(
                "{} is not a range report",
                tool.name()
            )))
        }
    };
    DayRange::from_instants(parsed.from, parsed.to)
}
