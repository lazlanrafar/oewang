//! Executing one tool call.
//!
//! Everything a model asks the ledger to do comes through this one function
//! (CHAT-4). It is the trust boundary: the AI service is authenticated by
//! its service key, but what it relays is a model's output, and a model's
//! output is untrusted input (docs/security/ai-safety.md).
//!
//! The order of the checks is the control model, in the order the four
//! layers are trusted:
//!
//! 1. The tool exists.
//! 2. The live membership row says this caller may run it. The `role` in the
//!    body is a claim and is never read.
//! 3. The arguments parse against the schema.
//! 4. A destructive call has been challenged for that exact row.
//! 5. The turn still has budget.
//!
//! Only then does any work happen, and it happens through the same services
//! the web UI uses, so balance arithmetic, soft delete and validation are
//! identical and cannot drift (D13, D14, OPS-1, OPS-2).
//!
//! Every figure that leaves here is computed, rounded and formatted in Rust
//! (D27). The model is handed finished strings and never the arithmetic,
//! because a model's arithmetic error looks exactly like a correct answer.

use chrono::{DateTime, Utc};
use oewang_clients::RatesClient;
use oewang_db::{
    repositories::{
        categories, transactions as repo,
        transactions::{GroupTotalRow, SummaryGroup},
        wallets,
    },
    PgPool,
};
use oewang_domain::{
    format_money,
    ledger::TransactionType,
    tools::{
        ChoicesArgs, DeleteArgs, ItemsArgs, NewCategoryArgs, NewWalletArgs, RangeArgs, RecentArgs,
        SearchArgs, SummaryArgs, SummaryGrouping, Tool, ToolCall, WriteTransactionArgs,
        RESULT_BYTE_BUDGET,
    },
    AppError, FieldErrors, Result,
};
use rust_decimal::Decimal;
use serde_json::{json, Map, Value};

use crate::{
    accounts,
    ai::turns::{Artifact, TurnStore},
    audit::{Actor, SOURCE_CHAT},
    auth,
    owe1::session::now_secs,
    reports::service::{self as reports, percent_change, DayRange},
    transactions,
};

/// How many rows a list tool returns when the model names no limit.
const DEFAULT_LIMIT: u32 = 10;
const DEFAULT_SEARCH_LIMIT: u32 = 20;

/// One call, as the AI service relays it.
///
/// `workspace_id`, `user_id` and `role` are in the body because the AI
/// service holds no user token (D4). The first two name who the call is for;
/// the third is a claim this module does not read.
#[derive(Debug)]
pub struct ToolRequest<'a> {
    pub workspace_id: &'a str,
    pub user_id: &'a str,
    pub claimed_role: &'a str,
    pub session_id: &'a str,
    pub turn_id: &'a str,
    /// The model's id for this call, which keys the artifact an analysis
    /// tool leaves for the stream (D88). Absent from an older caller, and
    /// then no artifact is kept.
    pub call_id: Option<&'a str>,
    pub tool: &'a str,
    pub args: &'a Value,
}

/// What the AI service hands back to the model.
#[derive(Debug)]
pub struct ToolOutcome {
    pub result: Value,
    /// One line the UI can show on a collapsed tool card, and the model can
    /// read without parsing the result.
    pub summary: String,
}

pub async fn execute(
    pool: &PgPool,
    rates: &RatesClient,
    turns: &TurnStore,
    max_amount: Decimal,
    request: ToolRequest<'_>,
) -> Result<ToolOutcome> {
    let tool = Tool::parse(request.tool)?;

    // Layer 1. The role in the body is a claim; this is the fact (SEC-23).
    let role = auth::service::current_role(pool, request.workspace_id, request.user_id).await?;
    if role.as_str() != request.claimed_role {
        // Not an error: a token's snapshot goes stale legitimately. Worth
        // seeing, because a persistent mismatch is not staleness.
        tracing::warn!(
            claimed = request.claimed_role,
            actual = role.as_str(),
            tool = tool.name(),
            "tool call claimed a role the membership row does not give"
        );
    }
    if !tool.allowed_for(role) {
        return Err(AppError::ToolForbidden);
    }

    // Layer 4, the weakest, applied first because it is the cheapest: a
    // malformed call is answered without touching the database.
    let call = ToolCall::parse(tool, request.args)?;
    check_amount_ceiling(&call, max_amount)?;

    // Layer 3. A delete is challenged before it costs the turn anything,
    // so asking the user does not spend the turn's one delete (D20).
    if let ToolCall::DeleteTransaction(args) = &call {
        confirm_delete(pool, turns, request.workspace_id, request.session_id, args).await?;
    }

    // Layer 2.
    turns.reserve(request.turn_id, tool, now_secs())?;

    let actor = Actor {
        workspace_id: request.workspace_id,
        user_id: request.user_id,
        source: SOURCE_CHAT,
    };

    match call {
        ToolCall::GetWorkspaceContext => workspace_context(pool, request.workspace_id).await,
        ToolCall::GetRecentTransactions(args) => recent(pool, request.workspace_id, args).await,
        ToolCall::SearchTransactions(args) => search(pool, request.workspace_id, args).await,
        ToolCall::GetSpendingSummary(args) => summary(pool, request.workspace_id, args).await,
        ToolCall::GetSpendingAnalysis(args) => {
            analysis(pool, turns, &request, Analysis::Spending, args).await
        }
        ToolCall::GetIncomeSummary(args) => {
            analysis(pool, turns, &request, Analysis::Income, args).await
        }
        ToolCall::GetBurnRate(args) => {
            analysis(pool, turns, &request, Analysis::BurnRate, args).await
        }
        ToolCall::CreateTransaction(args) => create_transaction(pool, rates, actor, args).await,
        ToolCall::UpdateTransaction(args) => update_transaction(pool, rates, actor, args).await,
        ToolCall::DeleteTransaction(args) => {
            delete_transaction(pool, turns, actor, request.session_id, args).await
        }
        ToolCall::AddTransactionItems(args) => add_items(pool, actor, args).await,
        ToolCall::CreateWallet(args) => create_wallet(pool, actor, args).await,
        ToolCall::CreateCategory(args) => create_category(pool, actor, args).await,
        ToolCall::PresentChoices(args) => present_choices(args),
    }
}

/// A ceiling on what one chat call may write, in the wallet's own currency
/// (SEC-24). A parse error that shifts a decimal point stops here, before
/// anything is locked.
fn check_amount_ceiling(call: &ToolCall, max_amount: Decimal) -> Result<()> {
    let amounts: Vec<Option<Decimal>> = match call {
        ToolCall::CreateTransaction(args) | ToolCall::UpdateTransaction(args) => {
            vec![args.amount, args.to_amount]
        }
        ToolCall::AddTransactionItems(args) => {
            args.items.iter().map(|item| Some(item.amount)).collect()
        }
        _ => return Ok(()),
    };

    if amounts
        .into_iter()
        .flatten()
        .any(|amount| amount.abs() > max_amount)
    {
        let mut fields = FieldErrors::new();
        fields.insert(
            "amount".to_string(),
            format!("Above the ceiling one chat call may write ({max_amount})."),
        );
        return Err(AppError::ToolArgsInvalid(fields));
    }

    Ok(())
}

/// The confirmation gate (CHAT-6, D20).
///
/// `confirmed: true` is honoured only for an id this session has already
/// been challenged on. A model that sets the flag on a first call is told to
/// ask, and the challenge is issued at the same time, so the user sees what
/// they are being asked about.
async fn confirm_delete(
    pool: &PgPool,
    turns: &TurnStore,
    workspace_id: &str,
    session_id: &str,
    args: &DeleteArgs,
) -> Result<()> {
    if args.confirmed && turns.challenged(session_id, &args.transaction_id, now_secs()) {
        return Ok(());
    }

    // Read it first: a challenge naming a row that does not exist would
    // teach the model nothing and leak the shape of other workspaces.
    let row = transactions::service::find(pool, workspace_id, &args.transaction_id).await?;

    turns.challenge(session_id, &args.transaction_id, now_secs());

    let mut target = FieldErrors::new();
    target.insert("date".to_string(), row.date.date_naive().to_string());
    target.insert("name".to_string(), row.name.clone().unwrap_or_default());
    target.insert(
        "amount".to_string(),
        format_money(row.amount, &row.wallet_currency_code, false),
    );
    target.insert("wallet".to_string(), row.wallet_name.clone());

    Err(AppError::ConfirmationRequired(target))
}

// ------------------------------------------------------------------- reads

async fn workspace_context(pool: &PgPool, workspace_id: &str) -> Result<ToolOutcome> {
    let workspace = oewang_db::repositories::accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotAMember)?;
    let wallet_rows = wallets::list_wallets(pool, workspace_id)
        .await
        .map_err(internal)?;
    let category_rows = categories::list_categories(pool, workspace_id, None)
        .await
        .map_err(internal)?;

    let wallets: Vec<Value> = wallet_rows
        .iter()
        .map(|wallet| {
            json!({
                "id": wallet.id,
                "name": wallet.name,
                "balance": wallet.balance.to_string(),
                "balance_formatted": format_money(wallet.balance, &wallet.currency_code, false),
                "currency_code": wallet.currency_code,
                "is_default": wallet.is_default,
            })
        })
        .collect();

    let categories: Vec<Value> = category_rows
        .iter()
        .map(
            |category| json!({ "id": category.id, "name": category.name, "type": category.r#type }),
        )
        .collect();

    let summary = format!(
        "{} wallets and {} categories.",
        wallets.len(),
        categories.len()
    );

    Ok(ToolOutcome {
        result: json!({
            "currency_code": workspace.currency_code,
            "wallets": wallets,
            "categories": categories,
        }),
        summary,
    })
}

async fn recent(pool: &PgPool, workspace_id: &str, args: RecentArgs) -> Result<ToolOutcome> {
    let filters = repo::TransactionFilters {
        start_date: args.from,
        end_date: args.to,
        ..Default::default()
    };

    list_transactions(
        pool,
        workspace_id,
        filters,
        args.limit.unwrap_or(DEFAULT_LIMIT),
    )
    .await
}

async fn search(pool: &PgPool, workspace_id: &str, args: SearchArgs) -> Result<ToolOutcome> {
    // The model still names at most one wallet and one category, and the
    // tool's schema says so. The repository takes a set, so each answer
    // becomes a list of one, and no answer becomes an empty list, which the
    // repository reads as no filter.
    let wallet_ids: Vec<String> = args.wallet_id.iter().cloned().collect();
    let category_ids: Vec<String> = args.category_id.iter().cloned().collect();

    let filters = repo::TransactionFilters {
        wallet_ids: Some(&wallet_ids),
        category_ids: Some(&category_ids),
        kind: args.kind.as_deref(),
        start_date: args.from,
        end_date: args.to,
        search: args.query.as_deref(),
        // In the statement rather than over the returned page: filtering
        // after the limit would answer "nothing" for a match that was
        // simply further down than the page reached.
        min_amount: args.min_amount,
        max_amount: args.max_amount,
        ..Default::default()
    };

    list_transactions(
        pool,
        workspace_id,
        filters,
        args.limit.unwrap_or(DEFAULT_SEARCH_LIMIT),
    )
    .await
}

async fn list_transactions(
    pool: &PgPool,
    workspace_id: &str,
    filters: repo::TransactionFilters<'_>,
    limit: u32,
) -> Result<ToolOutcome> {
    // One more than asked for, so "is there another page" is answered by
    // the query rather than by a second count.
    let rows = repo::list(
        pool,
        workspace_id,
        &filters,
        repo::SortField::Date,
        repo::SortOrder::Descending,
        i64::from(limit) + 1,
        0,
    )
    .await
    .map_err(internal)?;

    let has_more = rows.len() > limit as usize;
    let projected: Vec<Value> = rows
        .iter()
        .take(limit as usize)
        .map(transaction_view)
        .collect();

    let (data, truncated) = bounded(projected);
    let returned = data.len();

    Ok(ToolOutcome {
        result: json!({
            "data": data,
            "meta": {
                "returned": returned,
                "has_next_page": has_more || truncated,
                "truncated": truncated,
            },
        }),
        summary: format!("{returned} transactions."),
    })
}

/// A database row is the wrong shape and the wrong size for a model (D34):
/// flat, no foreign keys the model would have to resolve, and every figure
/// already formatted.
fn transaction_view(row: &repo::TransactionListRow) -> Value {
    let mut view = Map::new();
    view.insert("id".into(), json!(row.id));
    view.insert("date".into(), json!(row.date.date_naive().to_string()));
    view.insert("name".into(), json!(row.name));
    view.insert("amount".into(), json!(row.amount.to_string()));
    view.insert(
        "amount_formatted".into(),
        json!(format_money(row.amount, &row.wallet_currency_code, false)),
    );
    view.insert("currency".into(), json!(row.wallet_currency_code));
    view.insert("type".into(), json!(row.r#type));
    view.insert(
        "wallet".into(),
        json!({ "id": row.wallet_id, "name": row.wallet_name }),
    );
    if let (Some(id), Some(name)) = (&row.category_id, &row.category_name) {
        view.insert("category".into(), json!({ "id": id, "name": name }));
    }
    if let (Some(id), Some(name)) = (&row.to_wallet_id, &row.to_wallet_name) {
        view.insert("to_wallet".into(), json!({ "id": id, "name": name }));
    }
    view.insert("is_ready".into(), json!(row.is_ready));

    Value::Object(view)
}

/// Cut a list to the byte budget, reporting that it was cut.
///
/// A model told its result was truncated asks for the next page. A model
/// handed a quietly shortened list reports a wrong total
/// (docs/ai/service.md#tool-result-shape).
fn bounded(rows: Vec<Value>) -> (Vec<Value>, bool) {
    let mut kept = Vec::with_capacity(rows.len());
    let mut bytes = 0usize;

    for row in rows {
        bytes += row.to_string().len();
        if bytes > RESULT_BYTE_BUDGET && !kept.is_empty() {
            return (kept, true);
        }
        kept.push(row);
    }

    (kept, false)
}

/// Spending over a range, with the comparison already made (CHAT-15, D27).
///
/// Every figure in the answer is computed here: the totals, the difference
/// with the preceding period of equal length, the percentage, the share of
/// each group, and the word for the direction. The model picks sentences.
async fn summary(pool: &PgPool, workspace_id: &str, args: SummaryArgs) -> Result<ToolOutcome> {
    let workspace = oewang_db::repositories::accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotAMember)?;
    let currency = workspace.currency_code;

    let current = range_filters(args.from, args.to);
    let span = args.to - args.from;
    let previous_to = args.from - chrono::Duration::milliseconds(1);
    let previous_from = previous_to - span;
    let previous = range_filters(previous_from, previous_to);

    let current_totals = repo::summary(pool, workspace_id, &current)
        .await
        .map_err(internal)?;
    let previous_totals = repo::summary(pool, workspace_id, &previous)
        .await
        .map_err(internal)?;

    let spent = total_of(&current_totals, "expense");
    let earned = total_of(&current_totals, "income");
    let spent_before = total_of(&previous_totals, "expense");

    // Groups are of spending, which is what the tool is named for. A
    // grouping by type is the one case where income belongs in the list.
    let mut group_filters = current.clone();
    if args.group_by != SummaryGrouping::Type {
        group_filters.kind = Some("expense");
    }

    let group_rows = repo::summary_grouped(
        pool,
        workspace_id,
        &group_filters,
        match args.group_by {
            SummaryGrouping::Category => SummaryGroup::Category,
            SummaryGrouping::Wallet => SummaryGroup::Wallet,
            SummaryGrouping::Type => SummaryGroup::Type,
            SummaryGrouping::Month => SummaryGroup::Month,
        },
    )
    .await
    .map_err(internal)?;

    let groups: Vec<Value> = group_rows
        .iter()
        .map(|row| group_view(row, spent, &currency))
        .collect();
    let (groups, truncated) = bounded(groups);

    let change = spent - spent_before;
    let direction = if change.is_zero() {
        "flat"
    } else if change.is_sign_positive() {
        "up"
    } else {
        "down"
    };

    let percent = percent_change(spent_before, change);

    let summary = format!(
        "{} spent, {} the {} before.",
        format_money(spent, &currency, false),
        direction,
        describe_span(args.from, args.to),
    );

    Ok(ToolOutcome {
        result: json!({
            "from": args.from.date_naive().to_string(),
            "to": args.to.date_naive().to_string(),
            "group_by": args.group_by.as_str(),
            "currency_code": currency,
            "spent": spent.to_string(),
            "spent_formatted": format_money(spent, &currency, false),
            "earned": earned.to_string(),
            "earned_formatted": format_money(earned, &currency, false),
            "net": (earned - spent).to_string(),
            "net_formatted": format_money(earned - spent, &currency, true),
            "comparison": {
                "from": previous_from.date_naive().to_string(),
                "to": previous_to.date_naive().to_string(),
                "spent": spent_before.to_string(),
                "spent_formatted": format_money(spent_before, &currency, false),
                "change": change.to_string(),
                "change_formatted": format_money(change, &currency, true),
                "percent": percent.map(|value| value.to_string()),
                "percent_formatted": percent.map(|value| format!("{value}%")),
                "direction": direction,
            },
            "groups": groups,
            "meta": { "returned": 0, "truncated": truncated, "has_next_page": truncated },
        }),
        summary,
    })
}

/// The three analysis tools (D88).
#[derive(Debug, Clone, Copy)]
enum Analysis {
    Spending,
    Income,
    BurnRate,
}

/// Build the report, answer the model with it, and leave the same report
/// for the stream as a canvas artifact.
///
/// The model and the canvas read one value, so the sentence and the chart
/// cannot disagree. The artifact is kept only when there is something to
/// draw, the old app's rule: an empty chart is a worse answer than none.
async fn analysis(
    pool: &PgPool,
    turns: &TurnStore,
    request: &ToolRequest<'_>,
    kind: Analysis,
    args: RangeArgs,
) -> Result<ToolOutcome> {
    let range = DayRange::from_instants(args.from, args.to)?;
    let span = describe_span(range.start(), range.end());
    let workspace_id = request.workspace_id;

    let (name, payload, has_data, summary) = match kind {
        Analysis::Spending => {
            let report = reports::spending(pool, workspace_id, range).await?;
            let summary = format!(
                "{} spent across {} transactions, {} on the {} before.",
                report.total.value_formatted, report.count, report.total.comparison.direction, span,
            );
            (
                "spending",
                serde_json::to_value(&report).map_err(internal)?,
                report.count > 0,
                summary,
            )
        }
        Analysis::Income => {
            let report = reports::income(pool, workspace_id, range).await?;
            let summary = format!(
                "{} earned across {} transactions, {} on the {} before.",
                report.total.value_formatted, report.count, report.total.comparison.direction, span,
            );
            (
                "income",
                serde_json::to_value(&report).map_err(internal)?,
                report.count > 0,
                summary,
            )
        }
        Analysis::BurnRate => {
            let report = reports::burn_rate(pool, workspace_id, range).await?;
            let summary = format!(
                "{} spent per month on average over {} months.",
                report.average_monthly_formatted,
                report.months.len(),
            );
            (
                "burn-rate",
                serde_json::to_value(&report).map_err(internal)?,
                !report.total.value.is_zero(),
                summary,
            )
        }
    };

    if has_data {
        if let Some(call_id) = request.call_id {
            turns.put_artifact(
                request.turn_id,
                call_id,
                Artifact {
                    kind: name,
                    payload: payload.clone(),
                },
            );
        }
    }

    // The year-before series is for the chart. The model is not asked about
    // it, and leaving it out keeps a long range inside the result budget
    // (D34).
    let mut result = payload;
    if let Some(object) = result.as_object_mut() {
        object.remove("previous_year");
        object.insert("canvas".into(), json!(has_data));
    }

    Ok(ToolOutcome { result, summary })
}

fn range_filters<'a>(from: DateTime<Utc>, to: DateTime<Utc>) -> repo::TransactionFilters<'a> {
    repo::TransactionFilters {
        start_date: Some(from),
        end_date: Some(to),
        ..Default::default()
    }
}

fn total_of(rows: &[repo::SummaryRow], kind: &str) -> Decimal {
    rows.iter()
        .find(|row| row.r#type == kind)
        .map(|row| row.total)
        .unwrap_or_default()
}

fn group_view(row: &GroupTotalRow, of_total: Decimal, currency: &str) -> Value {
    let share = if of_total.is_zero() {
        None
    } else {
        Some((row.total / of_total * Decimal::ONE_HUNDRED).round_dp(1))
    };

    json!({
        "key": row.key,
        "label": row.label.clone().unwrap_or_else(|| "Uncategorized".to_string()),
        "total": row.total.to_string(),
        "total_formatted": format_money(row.total, currency, false),
        "count": row.count,
        "share_percent": share.map(|value| value.to_string()),
        "share_formatted": share.map(|value| format!("{value}%")),
    })
}

/// What to call the preceding period, so the summary line reads as English
/// without the model working it out.
fn describe_span(from: DateTime<Utc>, to: DateTime<Utc>) -> &'static str {
    let days = (to - from).num_days();
    match days {
        0..=1 => "day",
        2..=8 => "week",
        9..=31 => "month",
        32..=92 => "quarter",
        _ => "period",
    }
}

// ------------------------------------------------------------------ writes

async fn create_transaction(
    pool: &PgPool,
    rates: &RatesClient,
    actor: Actor<'_>,
    args: WriteTransactionArgs,
) -> Result<ToolOutcome> {
    let kind = parse_kind(args.kind.as_deref())?;
    let amount = args.amount.ok_or_else(|| missing("amount"))?;
    let wallet_id = args.wallet_id.clone().ok_or_else(|| missing("wallet_id"))?;

    let input = transactions::service::TransactionInput {
        kind,
        wallet_id: &wallet_id,
        to_wallet_id: args.to_wallet_id.as_deref(),
        category_id: args.category_id.as_deref(),
        amount,
        to_amount: args.to_amount,
        original_amount: None,
        original_currency_code: None,
        exchange_rate: None,
        requested_base_rate: None,
        date: args.date.unwrap_or_else(Utc::now),
        name: args.name.as_deref(),
        description: args.description.as_deref(),
        // A transaction the user asked for in words is a real one, not a
        // draft: the draft path is the receipt, and it is reviewed first.
        is_ready: true,
        attachment_ids: None,
    };

    let row = transactions::service::create(pool, rates, actor, input).await?;
    let detail = transactions::service::find(pool, actor.workspace_id, &row.id).await?;

    Ok(written(&detail, "Created"))
}

/// `update_transaction` is a patch; the service takes the whole row.
///
/// So the current row is read and the named fields are laid over it. Every
/// transition goes through the same reverse-and-reapply path the web UI
/// uses (TXN-4), and a field the model did not name keeps its value.
async fn update_transaction(
    pool: &PgPool,
    rates: &RatesClient,
    actor: Actor<'_>,
    args: WriteTransactionArgs,
) -> Result<ToolOutcome> {
    let id = args
        .transaction_id
        .clone()
        .ok_or_else(|| missing("transaction_id"))?;
    let current = transactions::service::find(pool, actor.workspace_id, &id).await?;

    let kind = match args.kind.as_deref() {
        Some(_) => parse_kind(args.kind.as_deref())?,
        None => parse_kind(Some(current.r#type.as_str()))?,
    };

    let wallet_id = args
        .wallet_id
        .clone()
        .unwrap_or_else(|| current.wallet_id.clone());
    let to_wallet_id = args
        .to_wallet_id
        .clone()
        .or_else(|| current.to_wallet_id.clone());
    let category_id = args
        .category_id
        .clone()
        .or_else(|| current.category_id.clone());
    let name = args.name.clone().or_else(|| current.name.clone());
    let description = args
        .description
        .clone()
        .or_else(|| current.description.clone());

    let input = transactions::service::TransactionInput {
        kind,
        wallet_id: &wallet_id,
        to_wallet_id: to_wallet_id.as_deref(),
        category_id: category_id.as_deref(),
        amount: args.amount.unwrap_or(current.amount),
        to_amount: args.to_amount.or(current.to_amount),
        original_amount: current.original_amount,
        original_currency_code: current.original_currency_code.as_deref(),
        exchange_rate: current.exchange_rate,
        requested_base_rate: None,
        date: args.date.unwrap_or(current.date),
        name: name.as_deref(),
        description: description.as_deref(),
        is_ready: current.is_ready,
        attachment_ids: None,
    };

    transactions::service::update(pool, rates, actor, &id, input).await?;
    let detail = transactions::service::find(pool, actor.workspace_id, &id).await?;

    Ok(written(&detail, "Updated"))
}

async fn delete_transaction(
    pool: &PgPool,
    turns: &TurnStore,
    actor: Actor<'_>,
    session_id: &str,
    args: DeleteArgs,
) -> Result<ToolOutcome> {
    let row = transactions::service::find(pool, actor.workspace_id, &args.transaction_id).await?;
    transactions::service::delete(pool, actor, &args.transaction_id).await?;

    // One confirmation answers one delete. Anything else is challenged
    // again, including the same row a minute later.
    turns.clear_challenge(session_id, &args.transaction_id);

    Ok(ToolOutcome {
        result: json!({ "id": args.transaction_id, "deleted": true }),
        summary: format!(
            "Deleted {} of {}.",
            row.name
                .clone()
                .unwrap_or_else(|| "the transaction".to_string()),
            format_money(row.amount, &row.wallet_currency_code, false)
        ),
    })
}

/// Items are added one at a time, each with its own audit row, because that
/// is what the service offers and what the web UI does. A failure partway
/// leaves the items already added: they are additive and independent, and
/// none of them moved a balance (TXN-12).
async fn add_items(pool: &PgPool, actor: Actor<'_>, args: ItemsArgs) -> Result<ToolOutcome> {
    let transaction =
        transactions::service::find(pool, actor.workspace_id, &args.transaction_id).await?;

    let mut added = 0usize;
    for item in &args.items {
        transactions::service::add_item(
            pool,
            actor,
            &args.transaction_id,
            transactions::service::ItemInput {
                name: &item.name,
                brand: None,
                quantity: item.quantity,
                unit: None,
                unit_price: None,
                amount: item.amount,
                category_id: None,
                notes: None,
            },
        )
        .await?;
        added += 1;
    }

    Ok(ToolOutcome {
        result: json!({ "transaction_id": args.transaction_id, "added": added }),
        summary: format!(
            "Added {added} items to {}.",
            transaction
                .name
                .clone()
                .unwrap_or_else(|| "the transaction".to_string())
        ),
    })
}

async fn create_wallet(
    pool: &PgPool,
    actor: Actor<'_>,
    args: NewWalletArgs,
) -> Result<ToolOutcome> {
    let wallet = accounts::service::create_wallet(
        pool,
        actor,
        accounts::service::NewWalletInput {
            name: &args.name,
            group_id: args.group_id.as_deref(),
            currency_code: args.currency_code.as_deref(),
            is_included_in_totals: None,
            sort_order: None,
        },
    )
    .await?;

    Ok(ToolOutcome {
        result: json!({
            "id": wallet.id,
            "name": wallet.name,
            "currency_code": wallet.currency_code,
            "balance": wallet.balance.to_string(),
            "balance_formatted": format_money(wallet.balance, &wallet.currency_code, false),
        }),
        summary: format!("Created the wallet {}.", wallet.name),
    })
}

async fn create_category(
    pool: &PgPool,
    actor: Actor<'_>,
    args: NewCategoryArgs,
) -> Result<ToolOutcome> {
    let category =
        accounts::service::create_category(pool, actor, &args.name, &args.kind, None).await?;

    Ok(ToolOutcome {
        result: json!({
            "id": category.id,
            "name": category.name,
            "type": category.r#type,
        }),
        summary: format!(
            "Created the {} category {}.",
            category.r#type, category.name
        ),
    })
}

/// The one tool that changes nothing and reaches no table.
///
/// It exists so the model asks instead of guessing a wallet, a category or
/// a date. The answer arrives as the user's next turn.
fn present_choices(args: ChoicesArgs) -> Result<ToolOutcome> {
    Ok(ToolOutcome {
        result: json!({ "question": args.question, "choices": args.choices }),
        summary: args.question.clone(),
    })
}

// ----------------------------------------------------------------- helpers

fn written(row: &repo::TransactionListRow, verb: &str) -> ToolOutcome {
    ToolOutcome {
        result: transaction_view(row),
        summary: format!(
            "{verb} {} of {} in {}.",
            row.r#type,
            format_money(row.amount, &row.wallet_currency_code, false),
            row.wallet_name
        ),
    }
}

fn parse_kind(raw: Option<&str>) -> Result<TransactionType> {
    match raw {
        Some("income") => Ok(TransactionType::Income),
        Some("expense") => Ok(TransactionType::Expense),
        Some("transfer") => Ok(TransactionType::Transfer),
        _ => Err(missing("type")),
    }
}

fn missing(field: &str) -> AppError {
    let mut fields = FieldErrors::new();
    fields.insert(field.to_string(), "This argument is required.".to_string());
    AppError::ToolArgsInvalid(fields)
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}

#[cfg(test)]
mod budget_tests {
    use super::*;

    fn rows(count: usize, filler: usize) -> Vec<Value> {
        (0..count)
            .map(|index| json!({ "id": index, "name": "x".repeat(filler) }))
            .collect()
    }

    #[test]
    fn should_keep_a_list_that_fits() {
        let (kept, truncated) = bounded(rows(5, 10));
        assert_eq!(kept.len(), 5);
        assert!(!truncated);
    }

    #[test]
    fn should_cut_a_list_over_the_budget_and_say_so() {
        // Each row is about 1 KiB, so the budget is reached well before the
        // fiftieth.
        let (kept, truncated) = bounded(rows(50, 1_000));
        assert!(truncated);
        assert!(kept.len() < 50);
        assert!(!kept.is_empty());
        assert!(
            kept.iter().map(|row| row.to_string().len()).sum::<usize>() <= RESULT_BYTE_BUDGET,
            "what is kept fits the budget"
        );
    }

    #[test]
    fn should_always_return_one_row_however_large() {
        // A single row over the budget is still the answer. Returning
        // nothing would read as "no results", which is a different and
        // wrong statement.
        let (kept, truncated) = bounded(rows(1, RESULT_BYTE_BUDGET * 2));
        assert_eq!(kept.len(), 1);
        assert!(!truncated);
    }

    #[test]
    fn should_report_nothing_as_nothing() {
        let (kept, truncated) = bounded(Vec::new());
        assert!(kept.is_empty());
        assert!(!truncated);
    }
}
