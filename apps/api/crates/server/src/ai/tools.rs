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
use oewang_db::{
    repositories::{
        categories,
        debts::{DebtFilters, DebtListRow, DebtSort},
        transactions as repo,
        transactions::{GroupTotalRow, SummaryGroup},
        wallets,
    },
    PgPool,
};
use oewang_domain::{
    budget::Month,
    format_money,
    ledger::{round_money, TransactionType},
    tools::{
        ChoicesArgs, DeleteArgs, DeleteDebtArgs, ItemsArgs, NewCategoryArgs, NewDebtArgs,
        NewWalletArgs, PayDebtArgs, RangeArgs, RecentArgs, SearchArgs, SplitBillArgs, SummaryArgs,
        SummaryGrouping, Tool, ToolCall, UpdateDebtArgs, WriteTransactionArgs, RESULT_BYTE_BUDGET,
    },
    validate_currency_code, AppError, FieldErrors, Page, Result,
};
use rust_decimal::Decimal;
use serde_json::{json, Map, Value};

use crate::{
    accounts,
    ai::turns::{Artifact, TurnStore},
    audit::{Actor, SOURCE_CHAT},
    auth, budgets, contacts,
    debts::{self, service::SplitSource},
    fx,
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

    // Layer 3. A delete or a split is challenged before it costs the turn
    // anything, so asking the user does not spend the turn's budget (D20,
    // D122).
    if let Some((key, confirmed)) = call.confirmation() {
        confirm(
            pool,
            turns,
            request.workspace_id,
            request.session_id,
            &call,
            &key,
            confirmed,
        )
        .await?;
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
        ToolCall::GetBudgetStatus(month) => budget_status(pool, turns, &request, month).await,
        ToolCall::CreateTransaction(args) => create_transaction(pool, actor, args).await,
        ToolCall::UpdateTransaction(args) => update_transaction(pool, actor, args).await,
        ToolCall::DeleteTransaction(args) => {
            delete_transaction(pool, turns, actor, request.session_id, args).await
        }
        ToolCall::AddTransactionItems(args) => add_items(pool, actor, args).await,
        ToolCall::CreateWallet(args) => create_wallet(pool, actor, args).await,
        ToolCall::CreateCategory(args) => create_category(pool, actor, args).await,
        ToolCall::GetOutstandingDebts => outstanding_debts(pool, request.workspace_id).await,
        ToolCall::CreateDebt(args) => create_debt(pool, actor, args).await,
        ToolCall::PayDebt(args) => pay_debt(pool, actor, max_amount, args).await,
        ToolCall::UpdateDebt(args) => update_debt(pool, actor, args).await,
        ToolCall::DeleteDebt(args) => {
            delete_debt(pool, turns, actor, request.session_id, args).await
        }
        ToolCall::SplitBill(args) => split_bill(pool, turns, actor, request.session_id, args).await,
        ToolCall::PresentChoices(args) => present_choices(args),
    }
}

/// A ceiling on what one chat call may write, in the wallet's own currency
/// (SEC-24). A parse error that shifts a decimal point stops here, before
/// anything is locked.
fn check_amount_ceiling(call: &ToolCall, max_amount: Decimal) -> Result<()> {
    let amounts: Vec<Option<Decimal>> = match call {
        ToolCall::CreateTransaction(args) | ToolCall::UpdateTransaction(args) => {
            let mut amounts = vec![args.amount, args.to_amount];
            amounts.extend(args.items.iter().map(|item| Some(item.amount)));
            amounts
        }
        ToolCall::AddTransactionItems(args) => {
            args.items.iter().map(|item| Some(item.amount)).collect()
        }
        // A payment in another currency is checked again on its wallet
        // amount, once the rate is known (`pay_debt`).
        ToolCall::CreateDebt(args) => vec![Some(args.amount)],
        ToolCall::PayDebt(args) => vec![Some(args.amount)],
        ToolCall::UpdateDebt(args) => vec![args.amount],
        ToolCall::SplitBill(args) => vec![Some(args.amount)],
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

fn above_ceiling(max_amount: Decimal) -> AppError {
    let mut fields = FieldErrors::new();
    fields.insert(
        "amount".to_string(),
        format!("Above the ceiling one chat call may write ({max_amount})."),
    );
    AppError::ToolArgsInvalid(fields)
}

/// The confirmation gate (CHAT-6, D20, D122).
///
/// `confirmed: true` is honoured only for a key this session has already
/// been challenged on: a row's id, or a split's argument hash. A model that
/// sets the flag on a first call is told to ask, and the challenge is
/// issued at the same time, so the user sees what they are being asked
/// about.
async fn confirm(
    pool: &PgPool,
    turns: &TurnStore,
    workspace_id: &str,
    session_id: &str,
    call: &ToolCall,
    key: &str,
    confirmed: bool,
) -> Result<()> {
    if confirmed && turns.challenged(session_id, key, now_secs()) {
        return Ok(());
    }

    // Read it first: a challenge naming a row that does not exist would
    // teach the model nothing and leak the shape of other workspaces.
    let target = describe(pool, workspace_id, call).await?;
    turns.challenge(session_id, key, now_secs());
    Err(AppError::ConfirmationRequired(target))
}

/// What the person is asked to agree to, every figure formatted here (D27).
async fn describe(pool: &PgPool, workspace_id: &str, call: &ToolCall) -> Result<FieldErrors> {
    let mut target = FieldErrors::new();
    match call {
        ToolCall::DeleteTransaction(args) => {
            let row = transactions::service::find(pool, workspace_id, &args.transaction_id).await?;
            target.insert("date".to_string(), row.date.date_naive().to_string());
            target.insert("name".to_string(), row.name.clone().unwrap_or_default());
            target.insert(
                "amount".to_string(),
                format_money(row.amount, &row.wallet_currency_code, false),
            );
            target.insert("wallet".to_string(), row.wallet_name.clone());
        }
        ToolCall::DeleteDebt(args) => {
            let debt = debts::service::find(pool, workspace_id, &args.debt_id).await?;
            target.insert("contact".to_string(), debt.contact_name.clone());
            target.insert("type".to_string(), debt.r#type.clone());
            target.insert(
                "amount".to_string(),
                format_money(debt.amount, &debt.currency_code, false),
            );
            target.insert(
                "remaining".to_string(),
                format_money(debt.remaining_amount, &debt.currency_code, false),
            );
            target.insert(
                "description".to_string(),
                debt.description.clone().unwrap_or_default(),
            );
        }
        ToolCall::SplitBill(args) => {
            let wallet_id =
                wallet_or_default(pool, workspace_id, args.wallet_id.as_deref()).await?;
            let preview = debts::service::preview_split(
                pool,
                workspace_id,
                &SplitSource::New(debts::service::NewExpense {
                    wallet_id: &wallet_id,
                    amount: args.amount,
                    name: &args.name,
                    category_id: args.category_id.as_deref(),
                    date: Utc::now(),
                }),
                &[],
                &args.contact_names,
            )
            .await?;
            target.insert("people".to_string(), preview.people_line());
            target.insert("name".to_string(), args.name.clone());
            target.insert("amount".to_string(), preview.amount_formatted);
            target.insert("share_each".to_string(), preview.share_formatted);
            target.insert("yours".to_string(), preview.yours_formatted);
        }
        _ => {}
    }
    Ok(target)
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
/// for the stream as a canvas artifact (see `canvas`).
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

    Ok(canvas(turns, request, name, payload, has_data, summary))
}

/// Budget against spending for one month (D103). Same shape as the three
/// analysis tools: one report, read by the model and drawn by the canvas.
async fn budget_status(
    pool: &PgPool,
    turns: &TurnStore,
    request: &ToolRequest<'_>,
    month: Option<Month>,
) -> Result<ToolOutcome> {
    let month = month.unwrap_or_else(|| Month::containing(Utc::now()));
    // Fullest first, the order a "how is my budget" answer is read in.
    let sort = budgets::service::Sort {
        field: budgets::service::SortField::Percent,
        descending: true,
    };
    let report = budgets::service::status(pool, request.workspace_id, month, None, sort).await?;
    let summary = report.summary.clone();
    let has_data = report.count > 0;
    let payload = serde_json::to_value(&report).map_err(internal)?;

    Ok(canvas(turns, request, "budget", payload, has_data, summary))
}

/// Leave the report for the stream as a canvas artifact, and answer the
/// model with the same report.
///
/// The model and the canvas read one value, so the sentence and the chart
/// cannot disagree. The artifact is kept only when there is something to
/// draw, the old app's rule: an empty chart is a worse answer than none.
fn canvas(
    turns: &TurnStore,
    request: &ToolRequest<'_>,
    kind: &'static str,
    payload: Value,
    has_data: bool,
    summary: String,
) -> ToolOutcome {
    if has_data {
        if let Some(call_id) = request.call_id {
            turns.put_artifact(
                request.turn_id,
                call_id,
                Artifact {
                    kind,
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

    ToolOutcome { result, summary }
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
        attachment_ids: None,
    };

    // One write for the transaction and its items (TXN-28). The amounts are
    // the ones the model was given: nothing here adds them up or works out
    // a remainder (D27); the share view does that when a figure is read.
    let items: Vec<transactions::service::ItemInput<'_>> = args
        .items
        .iter()
        .map(|item| transactions::service::ItemInput {
            name: &item.name,
            brand: None,
            quantity: item.quantity,
            unit: None,
            unit_price: None,
            amount: item.amount,
            category_id: item.category_id.as_deref(),
            notes: None,
        })
        .collect();

    let row = transactions::service::create_with_items(pool, actor, input, &items).await?;
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
        attachment_ids: None,
    };

    transactions::service::update(pool, actor, &id, input, None).await?;
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

// ------------------------------------------------------------------- debts

/// The named wallet, or the workspace's default, as the old app's chat did.
async fn wallet_or_default(
    pool: &PgPool,
    workspace_id: &str,
    wallet_id: Option<&str>,
) -> Result<String> {
    if let Some(id) = wallet_id {
        return Ok(id.to_string());
    }
    wallets::list_wallets(pool, workspace_id)
        .await
        .map_err(internal)?
        .into_iter()
        .find(|wallet| wallet.is_default)
        .map(|wallet| wallet.id)
        .ok_or_else(|| {
            let mut fields = FieldErrors::new();
            fields.insert(
                "wallet_id".to_string(),
                "The workspace has no default wallet. Name one.".to_string(),
            );
            AppError::ToolArgsInvalid(fields)
        })
}

fn debt_view(debt: &DebtListRow) -> Value {
    json!({
        "id": debt.id,
        "contact": debt.contact_name,
        "type": debt.r#type,
        "status": debt.status,
        "currency_code": debt.currency_code,
        "amount": debt.amount.to_string(),
        "amount_formatted": format_money(debt.amount, &debt.currency_code, false),
        "remaining": debt.remaining_amount.to_string(),
        "remaining_formatted": format_money(debt.remaining_amount, &debt.currency_code, false),
        "due_date": debt.due_date.map(|day| day.to_string()),
        "description": debt.description,
    })
}

/// Unpaid and partial debts, soonest due first, with the totals the debts
/// page shows (D27).
async fn outstanding_debts(pool: &PgPool, workspace_id: &str) -> Result<ToolOutcome> {
    let filters = DebtFilters {
        statuses: vec!["unpaid".to_string(), "partial".to_string()],
        ..Default::default()
    };
    let ((rows, total), summary) = tokio::try_join!(
        debts::service::list(
            pool,
            workspace_id,
            &filters,
            DebtSort::DueDate,
            false,
            Page::new(Some(1), Some(100)),
        ),
        debts::service::summary(pool, workspace_id, Utc::now().date_naive()),
    )?;

    let (data, truncated) = bounded(rows.iter().map(debt_view).collect());
    let returned = data.len();

    Ok(ToolOutcome {
        result: json!({
            "debts": data,
            "totals": {
                "currency_code": summary.currency_code,
                "owed_to_you": summary.owed_to_you_formatted,
                "you_owe": summary.you_owe_formatted,
                "net": summary.net_formatted,
                "overdue_count": summary.overdue_count,
                "left_out_for_want_of_a_rate": summary.left_out,
            },
            "meta": {
                "returned": returned,
                "total": total,
                "truncated": truncated || i64::try_from(returned).unwrap_or(i64::MAX) < total,
            },
        }),
        summary: format!("{total} outstanding debts."),
    })
}

async fn create_debt(pool: &PgPool, actor: Actor<'_>, args: NewDebtArgs) -> Result<ToolOutcome> {
    // Checked before the contact is made, so a refused debt leaves no new
    // contact behind.
    if args.amount <= Decimal::ZERO {
        return Err(AppError::validation([(
            "amount",
            "Enter an amount above zero.",
        )]));
    }
    if let Some(code) = args.currency_code.as_deref() {
        validate_currency_code("currency_code", code)?;
    }

    let contact = contacts::service::find_or_create_named(pool, actor, &args.contact_name).await?;
    let (debt, _) = debts::service::create_with_id(
        pool,
        actor,
        None,
        debts::service::DebtInput {
            kind: &args.kind,
            contact_id: &contact.id,
            amount: args.amount,
            currency_code: args.currency_code.as_deref(),
            due_date: args.due_date,
            description: args.description.as_deref(),
            source_transaction_id: None,
        },
    )
    .await?;

    Ok(ToolOutcome {
        summary: format!(
            "Recorded a {} debt with {} of {}.",
            debt.r#type,
            debt.contact_name,
            format_money(debt.amount, &debt.currency_code, false)
        ),
        result: debt_view(&debt),
    })
}

/// A payment through the named wallet or the default one, dated now. In
/// another currency the rate is resolved here, so the wallet amount can be
/// held to the ceiling before anything is written, and the service is handed
/// that same rate.
async fn pay_debt(
    pool: &PgPool,
    actor: Actor<'_>,
    max_amount: Decimal,
    args: PayDebtArgs,
) -> Result<ToolOutcome> {
    let debt = debts::service::find(pool, actor.workspace_id, &args.debt_id).await?;
    let wallet_id = wallet_or_default(pool, actor.workspace_id, args.wallet_id.as_deref()).await?;
    let wallet = wallets::find_wallet(pool, actor.workspace_id, &wallet_id)
        .await
        .map_err(internal)?
        .ok_or(AppError::WalletNotFound)?;
    let now = Utc::now();

    let exchange_rate = if wallet.currency_code == debt.currency_code {
        None
    } else {
        let rate = fx::service::resolve(
            pool,
            &debt.currency_code,
            &wallet.currency_code,
            now.date_naive(),
            None,
        )
        .await?
        .rate;
        if round_money(args.amount * rate).abs() > max_amount {
            return Err(above_ceiling(max_amount));
        }
        Some(rate)
    };

    let (paid, _) = debts::service::pay(
        pool,
        actor,
        &args.debt_id,
        None,
        debts::service::PayInput {
            amount: args.amount,
            wallet_id: Some(&wallet_id),
            date: now,
            exchange_rate,
        },
    )
    .await?;

    let moved = paid
        .transaction
        .as_ref()
        .map(|row| format_money(row.amount, &row.wallet_currency_code, false));
    Ok(ToolOutcome {
        summary: format!(
            "Paid {} on the debt with {}; {} remains.",
            format_money(paid.payment.amount, &paid.debt.currency_code, false),
            paid.debt.contact_name,
            format_money(paid.debt.remaining_amount, &paid.debt.currency_code, false)
        ),
        result: json!({
            "payment_id": paid.payment.id,
            "paid": format_money(paid.payment.amount, &paid.debt.currency_code, false),
            "wallet": wallet.name,
            "wallet_amount": moved,
            "transaction_id": paid.transaction.as_ref().map(|row| row.id.clone()),
            "debt": debt_view(&paid.debt),
        }),
    })
}

async fn update_debt(pool: &PgPool, actor: Actor<'_>, args: UpdateDebtArgs) -> Result<ToolOutcome> {
    let debt = debts::service::update(
        pool,
        actor,
        &args.debt_id,
        debts::service::DebtChange {
            amount: args.amount,
            description: args.description.as_deref().map(Some),
            due_date: args.due_date.map(Some),
            ..Default::default()
        },
        None,
    )
    .await?;

    Ok(ToolOutcome {
        summary: format!("Updated the debt with {}.", debt.contact_name),
        result: debt_view(&debt),
    })
}

async fn delete_debt(
    pool: &PgPool,
    turns: &TurnStore,
    actor: Actor<'_>,
    session_id: &str,
    args: DeleteDebtArgs,
) -> Result<ToolOutcome> {
    let debt = debts::service::find(pool, actor.workspace_id, &args.debt_id).await?;
    debts::service::delete(pool, actor, &args.debt_id).await?;

    // One confirmation answers one delete.
    turns.clear_challenge(session_id, &format!("debt:{}", args.debt_id));

    Ok(ToolOutcome {
        result: json!({ "id": args.debt_id, "deleted": true }),
        summary: format!(
            "Deleted the debt with {} of {}.",
            debt.contact_name,
            format_money(debt.amount, &debt.currency_code, false)
        ),
    })
}

/// A confirmed split (D122): a new expense from the named or default wallet,
/// dated now, and a receivable per person.
async fn split_bill(
    pool: &PgPool,
    turns: &TurnStore,
    actor: Actor<'_>,
    session_id: &str,
    args: SplitBillArgs,
) -> Result<ToolOutcome> {
    let wallet_id = wallet_or_default(pool, actor.workspace_id, args.wallet_id.as_deref()).await?;
    let (transaction, created) = debts::service::split(
        pool,
        actor,
        SplitSource::New(debts::service::NewExpense {
            wallet_id: &wallet_id,
            amount: args.amount,
            name: &args.name,
            category_id: args.category_id.as_deref(),
            date: Utc::now(),
        }),
        &[],
        &args.contact_names,
    )
    .await?;

    turns.clear_challenge(session_id, &args.challenge_key());

    let people: Vec<Value> = created.iter().map(debt_view).collect();
    Ok(ToolOutcome {
        summary: format!(
            "Split {} with {} people.",
            format_money(transaction.amount, &transaction.wallet_currency_code, false),
            created.len()
        ),
        result: json!({
            "transaction": transaction_view(&transaction),
            "receivables": people,
        }),
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

    /// AI-8
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
