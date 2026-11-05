//! The report builders.
//!
//! Each reads plain sums of `base_amount`, which is already in the workspace
//! currency (TXN-19), so there is no rate lookup and nothing to convert. Each
//! answer pairs every raw figure with a `_formatted` twin, the same contract
//! the chat tools keep (D27): a reader that needs a sentence never has to
//! format, and a chart that needs a height never has to parse a sentence.

use chrono::{DateTime, Datelike, Duration, NaiveDate, TimeZone, Utc};
use oewang_db::{
    repositories::{
        accounts,
        transactions::{self as repo, CategoryTotalRow, MonthTotalRow, SortField, SortOrder},
    },
    PgPool,
};
use oewang_domain::{format_money, AppError, Result};
use rust_decimal::Decimal;
use serde::Serialize;

/// The longest range a report covers. Enough for five years of monthly
/// bars; past that a chart is a smear and the zero-fill is wasted work.
pub const MAX_MONTHS: usize = 60;

/// How many categories a breakdown names before the rest become "Other".
pub const TOP_CATEGORIES: usize = 6;

/// How many rows a canvas table lists.
pub const TOP_ROWS: i64 = 10;

// ------------------------------------------------------------------ range

/// A closed range of days. Both ends are inclusive, the way the date picker
/// and the transactions filter read them.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct DayRange {
    pub from: NaiveDate,
    pub to: NaiveDate,
}

impl DayRange {
    pub fn new(from: NaiveDate, to: NaiveDate) -> Result<Self> {
        if from > to {
            return Err(AppError::validation([(
                "from",
                "The start of the range is after its end.",
            )]));
        }

        let range = DayRange { from, to };
        if range.months().len() > MAX_MONTHS {
            return Err(AppError::validation([(
                "from",
                "A report covers at most 60 months.",
            )]));
        }

        Ok(range)
    }

    /// From a tool's instants. Only the days count: a model that wrote
    /// `2026-11-30` meant the whole of the 30th, not its first moment.
    pub fn from_instants(from: DateTime<Utc>, to: DateTime<Utc>) -> Result<Self> {
        DayRange::new(from.date_naive(), to.date_naive())
    }

    pub fn start(self) -> DateTime<Utc> {
        Utc.from_utc_datetime(&self.from.and_hms_opt(0, 0, 0).expect("midnight exists"))
    }

    pub fn end(self) -> DateTime<Utc> {
        Utc.from_utc_datetime(
            &self
                .to
                .and_hms_milli_opt(23, 59, 59, 999)
                .expect("the last moment of a day exists"),
        )
    }

    /// The period of equal length that ends the day before this one starts.
    pub fn previous(self) -> DayRange {
        let days = (self.to - self.from).num_days();
        let to = self.from - Duration::days(1);
        DayRange {
            from: to - Duration::days(days),
            to,
        }
    }

    /// The same days one year earlier. The 29th of February becomes the
    /// 28th rather than an error.
    pub fn year_before(self) -> DayRange {
        DayRange {
            from: year_before(self.from),
            to: year_before(self.to),
        }
    }

    /// Every month the range touches, as `YYYY-MM`, oldest first.
    pub fn months(self) -> Vec<String> {
        let mut months = Vec::new();
        let (mut year, mut month) = (self.from.year(), self.from.month());

        while (year, month) <= (self.to.year(), self.to.month()) {
            months.push(format!("{year:04}-{month:02}"));
            if months.len() > MAX_MONTHS {
                break;
            }
            (year, month) = if month == 12 {
                (year + 1, 1)
            } else {
                (year, month + 1)
            };
        }

        months
    }

    fn filters(self, kind: Option<&'static str>) -> repo::TransactionFilters<'static> {
        repo::TransactionFilters {
            kind,
            start_date: Some(self.start()),
            end_date: Some(self.end()),
            ..Default::default()
        }
    }
}

fn year_before(day: NaiveDate) -> NaiveDate {
    day.with_year(day.year() - 1)
        .or_else(|| NaiveDate::from_ymd_opt(day.year() - 1, day.month(), 28))
        .expect("the 28th exists in every month")
}

// ------------------------------------------------------------------ views

/// A total over the range and the same total over the period before it.
#[derive(Debug, Clone, Serialize)]
pub struct Figure {
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
    pub value_formatted: String,
    pub comparison: Comparison,
}

#[derive(Debug, Clone, Serialize)]
pub struct Comparison {
    pub from: String,
    pub to: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub previous: Decimal,
    pub previous_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub change: Decimal,
    pub change_formatted: String,
    /// `None` when there is nothing to compare against: a percentage of
    /// zero is not a large number, it is not a number.
    #[serde(with = "rust_decimal::serde::str_option")]
    pub percent: Option<Decimal>,
    pub percent_formatted: Option<String>,
    /// `up`, `down` or `flat`, so neither the page nor the model reads a
    /// sign to decide which word to use.
    pub direction: &'static str,
}

/// One slice of a breakdown.
///
/// `name` is `None` for uncategorized rows and for the "Other" bucket, which
/// `other` tells apart. The web app names both from its dictionary.
#[derive(Debug, Clone, Serialize)]
pub struct CategoryShare {
    pub id: Option<String>,
    pub name: Option<String>,
    pub other: bool,
    #[serde(with = "rust_decimal::serde::str")]
    pub total: Decimal,
    pub total_formatted: String,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub share_percent: Option<Decimal>,
    pub share_formatted: Option<String>,
}

/// One month of income and expense.
#[derive(Debug, Clone, Serialize)]
pub struct MonthPoint {
    pub month: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub income: Decimal,
    pub income_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub expense: Decimal,
    pub expense_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub net: Decimal,
    pub net_formatted: String,
}

/// One month of one series.
#[derive(Debug, Clone, Serialize)]
pub struct MonthValue {
    pub month: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub value: Decimal,
    pub value_formatted: String,
}

/// One transaction in a canvas table, in the workspace currency.
#[derive(Debug, Clone, Serialize)]
pub struct RowView {
    pub id: String,
    pub date: String,
    pub name: Option<String>,
    pub category_name: Option<String>,
    pub wallet_name: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub amount: Decimal,
    pub amount_formatted: String,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub share_percent: Option<Decimal>,
    pub share_formatted: Option<String>,
}

/// The overview page (OVR-2, OVR-3).
#[derive(Debug, Clone, Serialize)]
pub struct Overview {
    pub from: String,
    pub to: String,
    pub currency_code: String,
    pub income: Figure,
    pub expense: Figure,
    pub net: Figure,
    pub months: Vec<MonthPoint>,
    #[serde(with = "rust_decimal::serde::str")]
    pub average_income: Decimal,
    pub average_income_formatted: String,
    #[serde(with = "rust_decimal::serde::str")]
    pub average_expense: Decimal,
    pub average_expense_formatted: String,
    pub expense_categories: Vec<CategoryShare>,
    pub income_categories: Vec<CategoryShare>,
}

/// The `spending` canvas (CHAT-17).
#[derive(Debug, Clone, Serialize)]
pub struct SpendingAnalysis {
    pub from: String,
    pub to: String,
    pub currency_code: String,
    pub total: Figure,
    pub count: i64,
    pub categories: Vec<CategoryShare>,
    pub largest: Vec<RowView>,
}

/// The `income` canvas (CHAT-17).
#[derive(Debug, Clone, Serialize)]
pub struct IncomeSummary {
    pub from: String,
    pub to: String,
    pub currency_code: String,
    pub total: Figure,
    pub count: i64,
    #[serde(with = "rust_decimal::serde::str")]
    pub average_monthly: Decimal,
    pub average_monthly_formatted: String,
    pub months: Vec<MonthValue>,
    /// The same months a year earlier, index for index.
    pub previous_year: Vec<MonthValue>,
    pub categories: Vec<CategoryShare>,
    pub latest: Vec<RowView>,
}

/// The `burn-rate` canvas (CHAT-17).
#[derive(Debug, Clone, Serialize)]
pub struct BurnRate {
    pub from: String,
    pub to: String,
    pub currency_code: String,
    pub total: Figure,
    #[serde(with = "rust_decimal::serde::str")]
    pub average_monthly: Decimal,
    pub average_monthly_formatted: String,
    pub months: Vec<MonthValue>,
    /// How many months in the range spent more than the average.
    pub months_above_average: usize,
}

// --------------------------------------------------------------- builders

pub async fn overview(pool: &PgPool, workspace_id: &str, range: DayRange) -> Result<Overview> {
    let currency = currency(pool, workspace_id).await?;
    let previous = range.previous();

    let current_filters = range.filters(None);
    let previous_filters = previous.filters(None);

    let (current, before, months, categories) = tokio::try_join!(
        repo::summary(pool, workspace_id, &current_filters),
        repo::summary(pool, workspace_id, &previous_filters),
        repo::monthly_totals(pool, workspace_id, &current_filters),
        repo::summary_by_category(pool, workspace_id, &current_filters),
    )
    .map_err(internal)?;

    let income = total_of(&current, "income");
    let expense = total_of(&current, "expense");
    let income_before = total_of(&before, "income");
    let expense_before = total_of(&before, "expense");

    let months = month_points(range, &months, &currency);
    let count = Decimal::from(months.len());

    Ok(Overview {
        from: range.from.to_string(),
        to: range.to.to_string(),
        income: figure(income, income_before, previous, &currency, false),
        expense: figure(expense, expense_before, previous, &currency, false),
        net: figure(
            income - expense,
            income_before - expense_before,
            previous,
            &currency,
            true,
        ),
        average_income: average(income, count),
        average_income_formatted: format_money(average(income, count), &currency, false),
        average_expense: average(expense, count),
        average_expense_formatted: format_money(average(expense, count), &currency, false),
        months,
        expense_categories: breakdown(&categories, "expense", expense, &currency),
        income_categories: breakdown(&categories, "income", income, &currency),
        currency_code: currency,
    })
}

pub async fn spending(
    pool: &PgPool,
    workspace_id: &str,
    range: DayRange,
) -> Result<SpendingAnalysis> {
    let currency = currency(pool, workspace_id).await?;
    let previous = range.previous();

    let current_filters = range.filters(Some("expense"));
    let previous_filters = previous.filters(Some("expense"));

    let (current, before, categories, largest) = tokio::try_join!(
        repo::summary(pool, workspace_id, &current_filters),
        repo::summary(pool, workspace_id, &previous_filters),
        repo::summary_by_category(pool, workspace_id, &current_filters),
        repo::list(
            pool,
            workspace_id,
            &current_filters,
            SortField::Amount,
            SortOrder::Descending,
            TOP_ROWS,
            0,
        ),
    )
    .map_err(internal)?;

    let total = total_of(&current, "expense");

    Ok(SpendingAnalysis {
        from: range.from.to_string(),
        to: range.to.to_string(),
        total: figure(
            total,
            total_of(&before, "expense"),
            previous,
            &currency,
            false,
        ),
        count: count_of(&current, "expense"),
        categories: breakdown(&categories, "expense", total, &currency),
        largest: largest
            .iter()
            .map(|row| row_view(row, total, &currency))
            .collect(),
        currency_code: currency,
    })
}

pub async fn income(pool: &PgPool, workspace_id: &str, range: DayRange) -> Result<IncomeSummary> {
    let currency = currency(pool, workspace_id).await?;
    let previous = range.previous();
    let year_before = range.year_before();

    let current_filters = range.filters(Some("income"));
    let previous_filters = previous.filters(Some("income"));
    let year_before_filters = year_before.filters(Some("income"));

    let (current, before, months, months_before, categories, latest) = tokio::try_join!(
        repo::summary(pool, workspace_id, &current_filters),
        repo::summary(pool, workspace_id, &previous_filters),
        repo::monthly_totals(pool, workspace_id, &current_filters),
        repo::monthly_totals(pool, workspace_id, &year_before_filters),
        repo::summary_by_category(pool, workspace_id, &current_filters),
        repo::list(
            pool,
            workspace_id,
            &current_filters,
            SortField::Date,
            SortOrder::Descending,
            TOP_ROWS,
            0,
        ),
    )
    .map_err(internal)?;

    let total = total_of(&current, "income");
    let series = month_values(range, &months, "income", &currency);
    let average_monthly = average(total, Decimal::from(series.len()));

    Ok(IncomeSummary {
        from: range.from.to_string(),
        to: range.to.to_string(),
        total: figure(
            total,
            total_of(&before, "income"),
            previous,
            &currency,
            false,
        ),
        count: count_of(&current, "income"),
        average_monthly,
        average_monthly_formatted: format_money(average_monthly, &currency, false),
        months: series,
        previous_year: month_values(year_before, &months_before, "income", &currency),
        categories: breakdown(&categories, "income", total, &currency),
        latest: latest
            .iter()
            .map(|row| row_view(row, total, &currency))
            .collect(),
        currency_code: currency,
    })
}

pub async fn burn_rate(pool: &PgPool, workspace_id: &str, range: DayRange) -> Result<BurnRate> {
    let currency = currency(pool, workspace_id).await?;
    let previous = range.previous();

    let current_filters = range.filters(Some("expense"));
    let previous_filters = previous.filters(Some("expense"));

    let (current, before, months) = tokio::try_join!(
        repo::summary(pool, workspace_id, &current_filters),
        repo::summary(pool, workspace_id, &previous_filters),
        repo::monthly_totals(pool, workspace_id, &current_filters),
    )
    .map_err(internal)?;

    let total = total_of(&current, "expense");
    let series = month_values(range, &months, "expense", &currency);
    let average_monthly = average(total, Decimal::from(series.len()));
    let months_above_average = series
        .iter()
        .filter(|month| month.value > average_monthly)
        .count();

    Ok(BurnRate {
        from: range.from.to_string(),
        to: range.to.to_string(),
        total: figure(
            total,
            total_of(&before, "expense"),
            previous,
            &currency,
            false,
        ),
        average_monthly,
        average_monthly_formatted: format_money(average_monthly, &currency, false),
        months: series,
        months_above_average,
        currency_code: currency,
    })
}

// ---------------------------------------------------------------- helpers

async fn currency(pool: &PgPool, workspace_id: &str) -> Result<String> {
    accounts::find_workspace(pool, workspace_id)
        .await
        .map_err(internal)?
        .map(|workspace| workspace.currency_code)
        .ok_or(AppError::NotFound)
}

fn total_of(rows: &[repo::SummaryRow], kind: &str) -> Decimal {
    rows.iter()
        .find(|row| row.r#type == kind)
        .map(|row| row.total)
        .unwrap_or_default()
}

fn count_of(rows: &[repo::SummaryRow], kind: &str) -> i64 {
    rows.iter()
        .find(|row| row.r#type == kind)
        .map(|row| row.count)
        .unwrap_or_default()
}

/// A total per month, at the scale the ledger stores. Rounding to the
/// currency's digits is the formatter's job, not the average's.
pub fn average(total: Decimal, months: Decimal) -> Decimal {
    if months.is_zero() {
        Decimal::ZERO
    } else {
        (total / months).round_dp(4)
    }
}

/// The change as a percentage of what came before, to one decimal place.
pub fn percent_change(before: Decimal, change: Decimal) -> Option<Decimal> {
    if before.is_zero() {
        None
    } else {
        Some((change / before.abs() * Decimal::ONE_HUNDRED).round_dp(1))
    }
}

pub fn direction(change: Decimal) -> &'static str {
    if change.is_zero() {
        "flat"
    } else if change.is_sign_positive() {
        "up"
    } else {
        "down"
    }
}

fn share(part: Decimal, of: Decimal) -> Option<Decimal> {
    if of.is_zero() {
        None
    } else {
        Some((part / of * Decimal::ONE_HUNDRED).round_dp(1))
    }
}

fn figure(
    value: Decimal,
    previous: Decimal,
    period: DayRange,
    currency: &str,
    signed: bool,
) -> Figure {
    let change = value - previous;
    let percent = percent_change(previous, change);

    Figure {
        value,
        value_formatted: format_money(value, currency, signed),
        comparison: Comparison {
            from: period.from.to_string(),
            to: period.to.to_string(),
            previous,
            previous_formatted: format_money(previous, currency, signed),
            change,
            change_formatted: format_money(change, currency, true),
            percent,
            percent_formatted: percent.map(|value| format!("{value}%")),
            direction: direction(change),
        },
    }
}

/// The largest categories of one type, and the rest summed as "Other".
pub fn breakdown(
    rows: &[CategoryTotalRow],
    kind: &str,
    of_total: Decimal,
    currency: &str,
) -> Vec<CategoryShare> {
    let mut rows: Vec<&CategoryTotalRow> = rows
        .iter()
        .filter(|row| row.r#type == kind && !row.total.is_zero())
        .collect();
    rows.sort_by_key(|row| std::cmp::Reverse(row.total));

    let slice = |id: Option<String>, name: Option<String>, other: bool, total: Decimal| {
        let share = share(total, of_total);
        CategoryShare {
            id,
            name,
            other,
            total,
            total_formatted: format_money(total, currency, false),
            share_percent: share,
            share_formatted: share.map(|value| format!("{value}%")),
        }
    };

    let mut shares: Vec<CategoryShare> = rows
        .iter()
        .take(TOP_CATEGORIES)
        .map(|row| {
            slice(
                row.category_id.clone(),
                row.category_name.clone(),
                false,
                row.total,
            )
        })
        .collect();

    let rest: Decimal = rows.iter().skip(TOP_CATEGORIES).map(|row| row.total).sum();
    if !rest.is_zero() {
        shares.push(slice(None, None, true, rest));
    }

    shares
}

/// Income and expense for every month in the range, empty months as zero.
pub fn month_points(range: DayRange, rows: &[MonthTotalRow], currency: &str) -> Vec<MonthPoint> {
    range
        .months()
        .into_iter()
        .map(|month| {
            let income = month_total(rows, &month, "income");
            let expense = month_total(rows, &month, "expense");
            MonthPoint {
                income_formatted: format_money(income, currency, false),
                expense_formatted: format_money(expense, currency, false),
                net: income - expense,
                net_formatted: format_money(income - expense, currency, true),
                income,
                expense,
                month,
            }
        })
        .collect()
}

/// One type's total for every month in the range, empty months as zero.
pub fn month_values(
    range: DayRange,
    rows: &[MonthTotalRow],
    kind: &str,
    currency: &str,
) -> Vec<MonthValue> {
    range
        .months()
        .into_iter()
        .map(|month| {
            let value = month_total(rows, &month, kind);
            MonthValue {
                value_formatted: format_money(value, currency, false),
                value,
                month,
            }
        })
        .collect()
}

fn month_total(rows: &[MonthTotalRow], month: &str, kind: &str) -> Decimal {
    rows.iter()
        .filter(|row| row.month == month && row.r#type == kind)
        .map(|row| row.total)
        .sum()
}

fn row_view(row: &repo::TransactionListRow, of_total: Decimal, currency: &str) -> RowView {
    let share = share(row.base_amount, of_total);
    RowView {
        id: row.id.clone(),
        date: row.date.date_naive().to_string(),
        name: row.name.clone(),
        category_name: row.category_name.clone(),
        wallet_name: row.wallet_name.clone(),
        amount: row.base_amount,
        amount_formatted: format_money(row.base_amount, currency, false),
        share_percent: share,
        share_formatted: share.map(|value| format!("{value}%")),
    }
}

fn internal(error: impl Into<anyhow::Error>) -> AppError {
    AppError::Internal(error.into())
}
