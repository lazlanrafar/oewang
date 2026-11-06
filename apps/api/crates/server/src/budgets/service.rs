//! Budget writes and the monthly status read.
//!
//! Every figure the page or the canvas shows is computed here, in
//! `Decimal`, and paired with a `_formatted` twin (D12, D27): neither the
//! web app nor the model does arithmetic on a budget.

use oewang_db::{
    repositories::{
        accounts,
        budgets::{self as repo, BudgetRow, BudgetUsageRow},
        categories,
    },
    PgPool,
};
use oewang_domain::{
    budget::{used_percent, BudgetState, Month},
    format_money, AppError, Result,
};
use rust_decimal::Decimal;
use serde::Serialize;

use crate::audit::{log, snapshot, Actor};

const ENTITY_BUDGET: &str = "budget";

/// A limit past which a typo is more likely than a budget.
fn max_amount() -> Decimal {
    Decimal::new(100_000_000_000_000, 0)
}

// ------------------------------------------------------------------ status

/// How the page orders its rows.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum SortField {
    /// The category list's own order.
    Category,
    Amount,
    Spent,
    Remaining,
    Percent,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct Sort {
    pub field: SortField,
    pub descending: bool,
}

impl Default for Sort {
    fn default() -> Self {
        Self {
            field: SortField::Category,
            descending: false,
        }
    }
}

/// One budget in one month.
#[derive(Debug, Clone, Serialize)]
pub struct BudgetLine {
    pub id: String,
    pub category_id: String,
    pub category_name: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub amount_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub spent: Decimal,
    pub spent_formatted: String,
    /// Negative once the budget is over.
    #[serde(with = "rust_decimal::serde::str")]
    pub remaining: Decimal,
    pub remaining_formatted: String,
    /// Whole percent of the limit, past 100 when over.
    pub percent: i64,
    /// `safe`, `warning` (80% or more) or `over` (past 100%).
    pub state: &'static str,
}

/// Every budget in one month, with the totals the page's cards show.
///
/// Also the `budget` canvas payload (D88, D103). `from` and `to` are the
/// month's first and last day, which is what every canvas title reads.
#[derive(Debug, Clone, Serialize)]
pub struct BudgetStatus {
    pub month: String,
    pub from: String,
    pub to: String,
    pub currency_code: String,
    /// Totals over every budget, whatever the search.
    #[serde(with = "rust_decimal::serde::str")]
    pub budgeted: Decimal,
    pub budgeted_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub spent: Decimal,
    pub spent_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub remaining: Decimal,
    pub remaining_formatted: String,
    pub percent: i64,
    pub state: &'static str,
    /// How many budgets there are, and how many are past their limit.
    pub count: usize,
    pub over_count: usize,
    /// One sentence for the canvas and the model, finished here (D27).
    pub summary: String,
    pub budgets: Vec<BudgetLine>,
}

pub async fn status(
    pool: &PgPool,
    workspace_id: &str,
    month: Month,
    search: Option<&str>,
    sort: Sort,
) -> Result<BudgetStatus> {
    let currency = accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .map(|workspace| workspace.currency_code)
        .ok_or(AppError::NotFound)?;

    let rows = repo::usage(pool, workspace_id, month.start(), month.end_exclusive())
        .await
        .map_err(internal)?;

    Ok(build_status(month, &currency, rows, search, sort))
}

fn build_status(
    month: Month,
    currency: &str,
    rows: Vec<BudgetUsageRow>,
    search: Option<&str>,
    sort: Sort,
) -> BudgetStatus {
    let lines: Vec<BudgetLine> = rows.into_iter().map(|row| line(row, currency)).collect();

    let budgeted: Decimal = lines.iter().map(|line| line.amount).sum();
    let spent: Decimal = lines.iter().map(|line| line.spent).sum();
    let remaining = budgeted - spent;
    let percent = used_percent(spent, budgeted);

    let mut over: Vec<&BudgetLine> = lines.iter().filter(|line| line.state == "over").collect();
    over.sort_by_key(|line| std::cmp::Reverse(line.percent));
    let summary = summarize(month, currency, budgeted, spent, percent, &over);
    let over_count = over.len();
    let count = lines.len();

    let needle = search
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_lowercase);
    let mut budgets: Vec<BudgetLine> = lines
        .into_iter()
        .filter(|line| {
            needle
                .as_deref()
                .is_none_or(|needle| line.category_name.to_lowercase().contains(needle))
        })
        .collect();
    sort_lines(&mut budgets, sort);

    BudgetStatus {
        month: month.to_string(),
        from: month.first_day().to_string(),
        to: month.last_day().to_string(),
        currency_code: currency.to_string(),
        budgeted,
        budgeted_formatted: format_money(budgeted, currency, false),
        spent,
        spent_formatted: format_money(spent, currency, false),
        remaining,
        remaining_formatted: format_money(remaining, currency, false),
        percent,
        state: BudgetState::of(percent).as_str(),
        count,
        over_count,
        summary,
        budgets,
    }
}

fn line(row: BudgetUsageRow, currency: &str) -> BudgetLine {
    let remaining = row.amount - row.spent;
    let percent = used_percent(row.spent, row.amount);
    BudgetLine {
        amount_formatted: format_money(row.amount, currency, false),
        spent_formatted: format_money(row.spent, currency, false),
        remaining_formatted: format_money(remaining, currency, false),
        state: BudgetState::of(percent).as_str(),
        id: row.id,
        category_id: row.category_id,
        category_name: row.category_name,
        amount: row.amount,
        spent: row.spent,
        remaining,
        percent,
    }
}

/// Stable, with the category order breaking ties, so equal rows keep the
/// order the settings page gives them.
fn sort_lines(lines: &mut [BudgetLine], sort: Sort) {
    if sort.field == SortField::Category {
        if sort.descending {
            lines.reverse();
        }
        return;
    }

    lines.sort_by(|a, b| {
        let ordering = match sort.field {
            SortField::Amount => a.amount.cmp(&b.amount),
            SortField::Spent => a.spent.cmp(&b.spent),
            SortField::Remaining => a.remaining.cmp(&b.remaining),
            SortField::Percent => a.percent.cmp(&b.percent),
            SortField::Category => std::cmp::Ordering::Equal,
        };
        if sort.descending {
            ordering.reverse()
        } else {
            ordering
        }
    });
}

fn summarize(
    month: Month,
    currency: &str,
    budgeted: Decimal,
    spent: Decimal,
    percent: i64,
    over: &[&BudgetLine],
) -> String {
    if budgeted.is_zero() {
        return "No budgets have been set up yet.".to_string();
    }

    let mut sentence = format!(
        "{} spent of a {} budget in {} ({}%).",
        format_money(spent, currency, false),
        format_money(budgeted, currency, false),
        month.first_day().format("%B %Y"),
        percent,
    );

    match over.len() {
        0 => sentence.push_str(" Every category is within its budget."),
        count => {
            let names: Vec<&str> = over
                .iter()
                .map(|line| line.category_name.as_str())
                .collect();
            let noun = if count == 1 {
                "category is"
            } else {
                "categories are"
            };
            sentence.push_str(&format!(
                " {count} {noun} over budget: {}.",
                names.join(", ")
            ));
        }
    }

    sentence
}

// ------------------------------------------------------------------ writes

pub async fn create(
    pool: &PgPool,
    actor: Actor<'_>,
    category_id: &str,
    amount: Decimal,
) -> Result<BudgetRow> {
    let amount = validate_amount(amount)?;
    let mut tx = pool.begin().await.map_err(internal)?;

    // An income category, or one from another workspace, is the same
    // answer as one that never existed.
    let category = categories::find_category(&mut *tx, actor.workspace_id, category_id)
        .await
        .map_err(internal)?
        .filter(|category| category.r#type == "expense")
        .ok_or_else(|| AppError::validation([("category_id", "Pick an expense category.")]))?;

    if repo::find_for_category(&mut *tx, actor.workspace_id, &category.id)
        .await
        .map_err(internal)?
        .is_some()
    {
        return Err(already_budgeted());
    }

    let budget = repo::insert(
        &mut *tx,
        &cuid2::create_id(),
        actor.workspace_id,
        &category.id,
        amount,
    )
    .await
    .map_err(|error| {
        // Two saves at once both pass the check above; the index stops the
        // second, and it gets the same answer as if it had come later.
        if is_unique_violation(&error) {
            already_budgeted()
        } else {
            internal(error)
        }
    })?;

    log(
        &mut tx,
        actor,
        "budget.created",
        ENTITY_BUDGET,
        &budget.id,
        None,
        snapshot(&budget)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(budget)
}

/// Only the limit changes. A budget on another category is a new budget,
/// the old app's rule.
pub async fn update(
    pool: &PgPool,
    actor: Actor<'_>,
    id: &str,
    amount: Decimal,
) -> Result<BudgetRow> {
    let amount = validate_amount(amount)?;
    let mut tx = pool.begin().await.map_err(internal)?;

    let before = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    let after = repo::update_amount(&mut *tx, actor.workspace_id, id, amount)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    log(
        &mut tx,
        actor,
        "budget.updated",
        ENTITY_BUDGET,
        id,
        snapshot(&before)?,
        snapshot(&after)?,
    )
    .await?;

    tx.commit().await.map_err(internal)?;
    Ok(after)
}

pub async fn delete(pool: &PgPool, actor: Actor<'_>, id: &str) -> Result<()> {
    let mut tx = pool.begin().await.map_err(internal)?;

    let before = repo::find(&mut *tx, actor.workspace_id, id)
        .await
        .map_err(internal)?
        .ok_or(AppError::NotFound)?;

    retire(&mut tx, actor, &before).await?;

    tx.commit().await.map_err(internal)?;
    Ok(())
}

/// Delete a category's budget along with the category, on the caller's
/// transaction (BUD-4). A budget on a category nobody can pick any more is
/// a row nobody can see or remove.
pub async fn delete_for_category(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: Actor<'_>,
    category_id: &str,
) -> Result<()> {
    let found = repo::find_for_category(&mut **tx, actor.workspace_id, category_id)
        .await
        .map_err(internal)?;

    match found {
        Some(budget) => retire(tx, actor, &budget).await,
        None => Ok(()),
    }
}

async fn retire(
    tx: &mut sqlx::Transaction<'_, sqlx::Postgres>,
    actor: Actor<'_>,
    budget: &BudgetRow,
) -> Result<()> {
    repo::soft_delete(&mut **tx, actor.workspace_id, &budget.id)
        .await
        .map_err(internal)?;

    log(
        tx,
        actor,
        "budget.deleted",
        ENTITY_BUDGET,
        &budget.id,
        snapshot(budget)?,
        None,
    )
    .await
}

fn validate_amount(amount: Decimal) -> Result<Decimal> {
    if amount <= Decimal::ZERO {
        return Err(AppError::validation([(
            "amount",
            "Enter a limit above zero.",
        )]));
    }
    if amount > max_amount() {
        return Err(AppError::validation([(
            "amount",
            "That limit is too large.",
        )]));
    }
    // The column keeps four places; say so rather than round silently.
    if amount.round_dp(4) != amount {
        return Err(AppError::validation([(
            "amount",
            "Use at most four decimal places.",
        )]));
    }
    Ok(amount)
}

fn already_budgeted() -> AppError {
    AppError::validation([(
        "category_id",
        "This category already has a budget. Edit that one instead.",
    )])
}

fn is_unique_violation(error: &sqlx::Error) -> bool {
    matches!(error, sqlx::Error::Database(db) if db.is_unique_violation())
}

fn internal(error: sqlx::Error) -> AppError {
    AppError::Internal(anyhow::anyhow!(error))
}

#[cfg(test)]
mod unit {
    use super::*;

    fn row(name: &str, amount: i64, spent: i64) -> BudgetUsageRow {
        BudgetUsageRow {
            id: format!("b_{name}"),
            category_id: format!("c_{name}"),
            category_name: name.to_string(),
            amount: Decimal::from(amount),
            spent: Decimal::from(spent),
        }
    }

    fn rows() -> Vec<BudgetUsageRow> {
        vec![
            row("Food", 1000, 1200),
            row("Coffee", 500, 400),
            row("Rent", 2000, 0),
        ]
    }

    #[test]
    fn should_total_every_budget_and_name_the_ones_over() {
        let month = Month::parse("2026-11").unwrap();
        let status = build_status(month, "IDR", rows(), None, Sort::default());

        assert_eq!(status.budgeted, Decimal::from(3500));
        assert_eq!(status.spent, Decimal::from(1600));
        assert_eq!(status.remaining, Decimal::from(1900));
        assert_eq!(status.percent, 46);
        assert_eq!((status.count, status.over_count), (3, 1));
        assert_eq!(
            (status.from.as_str(), status.to.as_str()),
            ("2026-11-01", "2026-11-30")
        );
        assert!(
            status.summary.contains("November 2026"),
            "{}",
            status.summary
        );
        assert!(status.summary.ends_with("1 category is over budget: Food."));

        let food = &status.budgets[0];
        assert_eq!((food.percent, food.state), (120, "over"));
        assert_eq!(food.remaining, Decimal::from(-200));
        assert_eq!(status.budgets[1].state, "warning");
    }

    #[test]
    fn should_search_rows_but_keep_totals_whole() {
        let month = Month::parse("2026-11").unwrap();
        let status = build_status(month, "IDR", rows(), Some(" cof "), Sort::default());
        assert_eq!(status.budgets.len(), 1);
        assert_eq!(status.budgeted, Decimal::from(3500));
    }

    #[test]
    fn should_sort_by_the_asked_field_and_keep_category_order_otherwise() {
        let month = Month::parse("2026-11").unwrap();
        let names = |sort| {
            build_status(month, "IDR", rows(), None, sort)
                .budgets
                .into_iter()
                .map(|line| line.category_name)
                .collect::<Vec<_>>()
        };
        assert_eq!(names(Sort::default()), ["Food", "Coffee", "Rent"]);
        let by_percent = Sort {
            field: SortField::Percent,
            descending: true,
        };
        assert_eq!(names(by_percent), ["Food", "Coffee", "Rent"]);
        let by_remaining = Sort {
            field: SortField::Remaining,
            descending: false,
        };
        assert_eq!(names(by_remaining), ["Food", "Coffee", "Rent"]);
        let by_amount = Sort {
            field: SortField::Amount,
            descending: true,
        };
        assert_eq!(names(by_amount), ["Rent", "Food", "Coffee"]);
    }

    #[test]
    fn should_say_so_when_there_are_no_budgets() {
        let month = Month::parse("2026-11").unwrap();
        let status = build_status(month, "IDR", Vec::new(), None, Sort::default());
        assert_eq!(status.summary, "No budgets have been set up yet.");
        assert_eq!(status.percent, 0);
    }

    #[test]
    fn should_refuse_a_limit_that_is_not_a_limit() {
        for raw in ["0", "-1", "1.00001"] {
            assert!(validate_amount(raw.parse().unwrap()).is_err(), "{raw}");
        }
        assert!(validate_amount("1500000.50".parse().unwrap()).is_ok());
    }
}
