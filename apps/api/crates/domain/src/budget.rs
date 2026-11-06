//! Budget rules that need no database (BUD-2, BUD-3).
//!
//! A budget is a monthly limit on one expense category. What it has used is
//! the sum of that category's expenses in a calendar month, read from the
//! ledger at request time; nothing is stored or carried over (D103).

use std::fmt;

use chrono::{DateTime, Datelike, NaiveDate, TimeZone, Utc};
use rust_decimal::{Decimal, RoundingStrategy};

/// At or past this percentage a budget is a warning.
pub const WARNING_PERCENT: i64 = 80;
/// Past this percentage a budget is over. Exactly 100% is spent, not over.
pub const OVER_PERCENT: i64 = 100;

/// One calendar month, the only period a budget has.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub struct Month {
    year: i32,
    month: u32,
}

impl Month {
    pub fn new(year: i32, month: u32) -> Option<Self> {
        // Through NaiveDate, so the bounds are the calendar's, not ours.
        NaiveDate::from_ymd_opt(year, month, 1)?;
        Some(Self { year, month })
    }

    /// `YYYY-MM`, the form the URL and the tool argument use.
    pub fn parse(raw: &str) -> Option<Self> {
        let (year, month) = raw.trim().split_once('-')?;
        if year.len() != 4 || month.len() != 2 {
            return None;
        }
        Month::new(year.parse().ok()?, month.parse().ok()?)
    }

    pub fn containing(instant: DateTime<Utc>) -> Self {
        Self {
            year: instant.year(),
            month: instant.month(),
        }
    }

    pub fn first_day(self) -> NaiveDate {
        NaiveDate::from_ymd_opt(self.year, self.month, 1).expect("checked in new")
    }

    pub fn next(self) -> Self {
        if self.month == 12 {
            Self {
                year: self.year + 1,
                month: 1,
            }
        } else {
            Self {
                year: self.year,
                month: self.month + 1,
            }
        }
    }

    pub fn last_day(self) -> NaiveDate {
        self.next()
            .first_day()
            .pred_opt()
            .expect("a month has a day")
    }

    /// The first instant of the month, UTC (days are UTC product-wide).
    pub fn start(self) -> DateTime<Utc> {
        Utc.from_utc_datetime(&self.first_day().and_hms_opt(0, 0, 0).expect("midnight"))
    }

    /// The first instant of the next month: the range is half-open, so a
    /// transaction in the last second of the month is still in it.
    pub fn end_exclusive(self) -> DateTime<Utc> {
        self.next().start()
    }
}

impl fmt::Display for Month {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(f, "{:04}-{:02}", self.year, self.month)
    }
}

/// How far into its limit a budget is.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum BudgetState {
    Safe,
    Warning,
    Over,
}

impl BudgetState {
    pub fn as_str(self) -> &'static str {
        match self {
            BudgetState::Safe => "safe",
            BudgetState::Warning => "warning",
            BudgetState::Over => "over",
        }
    }

    pub fn of(percent: i64) -> Self {
        if percent > OVER_PERCENT {
            BudgetState::Over
        } else if percent >= WARNING_PERCENT {
            BudgetState::Warning
        } else {
            BudgetState::Safe
        }
    }
}

/// Spent as a whole percentage of the limit, half away from zero. Zero when
/// there is no limit, because a share of nothing is not a number.
pub fn used_percent(spent: Decimal, limit: Decimal) -> i64 {
    if limit <= Decimal::ZERO {
        return 0;
    }
    (spent / limit * Decimal::ONE_HUNDRED)
        .round_dp_with_strategy(0, RoundingStrategy::MidpointAwayFromZero)
        .try_into()
        .unwrap_or(i64::MAX)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn dec(value: &str) -> Decimal {
        value.parse().unwrap()
    }

    #[test]
    fn should_parse_a_month_and_refuse_anything_else() {
        assert_eq!(Month::parse("2026-11"), Month::new(2026, 11));
        for raw in ["2026-13", "2026-1", "26-11", "2026/11", "", "2026-00"] {
            assert_eq!(Month::parse(raw), None, "{raw}");
        }
    }

    #[test]
    fn should_bound_a_month_half_open() {
        let december = Month::parse("2026-12").unwrap();
        assert_eq!(december.next().to_string(), "2027-01");
        assert_eq!(december.last_day().to_string(), "2026-12-31");
        assert_eq!(
            december.end_exclusive().to_rfc3339(),
            "2027-01-01T00:00:00+00:00"
        );
        let february = Month::parse("2028-02").unwrap();
        assert_eq!(february.last_day().to_string(), "2028-02-29");
    }

    #[test]
    fn should_place_the_thresholds_where_the_old_page_drew_them() {
        let cases = [
            ("79", BudgetState::Safe),
            ("80", BudgetState::Warning),
            ("100", BudgetState::Warning),
            ("101", BudgetState::Over),
        ];
        for (spent, state) in cases {
            let percent = used_percent(dec(spent), dec("100"));
            assert_eq!(BudgetState::of(percent), state, "{spent}");
        }
        assert_eq!(used_percent(dec("1"), dec("3")), 33);
        assert_eq!(used_percent(dec("1"), dec("200")), 1, "0.5 rounds up");
        assert_eq!(used_percent(dec("5"), Decimal::ZERO), 0);
    }
}
