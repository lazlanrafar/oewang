//! Turning a spreadsheet row into a transaction, deterministically.
//!
//! The model maps column *names*, once per file, and never sees a row
//! (D28, AI-9). Everything below is what happens to the rows afterwards:
//! amounts, dates and signs, in code, where a decimal point cannot move.
//!
//! Indonesian bank exports split debit and credit into two columns and
//! write `50.000,00` where an American export writes `50,000.00`. Both are
//! handled here, once, rather than per bank.

use std::collections::BTreeMap;

use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::{
    ledger::{round_money, TransactionType},
    AppError,
};

/// Which column holds what. Every field is a column name from the file.
///
/// `amount` is for a file with one signed column; `amount_out` and
/// `amount_in` are for the two-column shape. A file has one or the other.
#[derive(Debug, Clone, Default, Serialize, Deserialize)]
pub struct ColumnMapping {
    pub date: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub amount: Option<String>,
    pub amount_out: Option<String>,
    pub amount_in: Option<String>,
    pub currency: Option<String>,
    pub category: Option<String>,
}

/// One row as it came out of the file: column name to cell text.
pub type RawRow = BTreeMap<String, String>;

/// A row after transformation, ready to become a transaction.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ImportedRow {
    pub kind: TransactionType,
    pub date: NaiveDate,
    pub amount: Decimal,
    pub currency: Option<String>,
    pub name: Option<String>,
    pub description: Option<String>,
    pub category: Option<String>,
}

/// Why a row could not be transformed. Reported per row, never fatal.
#[derive(Debug, Clone, PartialEq, Eq, thiserror::Error)]
pub enum RowError {
    #[error("no date column is mapped")]
    NoDateColumn,
    #[error("no amount column is mapped")]
    NoAmountColumn,
    #[error("the date {0:?} could not be read")]
    BadDate(String),
    #[error("the amount {0:?} could not be read")]
    BadAmount(String),
    #[error("the row has no amount")]
    EmptyAmount,
}

impl From<RowError> for AppError {
    fn from(error: RowError) -> Self {
        AppError::validation([(
            "row",
            match error {
                RowError::NoDateColumn => "Map the date column.",
                RowError::NoAmountColumn => "Map the amount column.",
                RowError::BadDate(_) => "The date could not be read.",
                RowError::BadAmount(_) => "The amount could not be read.",
                RowError::EmptyAmount => "The row has no amount.",
            },
        )])
    }
}

/// Apply the mapping to one row.
///
/// The sign rule lives here and nowhere else: a value in the "out" column
/// is an expense, one in the "in" column is income, and a single signed
/// column uses its own sign. A row with a figure in both columns takes the
/// larger, because that is what a bank statement with a running balance in
/// the wrong column looks like.
pub fn transform(mapping: &ColumnMapping, row: &RawRow) -> Result<ImportedRow, RowError> {
    let date_column = mapping.date.as_deref().ok_or(RowError::NoDateColumn)?;
    let raw_date = cell(row, date_column);
    let date = parse_date(&raw_date).ok_or_else(|| RowError::BadDate(raw_date.clone()))?;

    let (kind, amount) = read_amount(mapping, row)?;

    Ok(ImportedRow {
        kind,
        date,
        amount,
        currency: mapping.currency.as_deref().map(|column| {
            let value = cell(row, column);
            // A mapping may name a column or carry a literal code, which is
            // what the model returns for a file with no currency column.
            if value.is_empty() {
                column.to_uppercase()
            } else {
                value.to_uppercase()
            }
        }),
        name: non_empty(mapping.name.as_deref().map(|c| cell(row, c))),
        description: non_empty(mapping.description.as_deref().map(|c| cell(row, c))),
        category: non_empty(mapping.category.as_deref().map(|c| cell(row, c))),
    })
}

fn read_amount(
    mapping: &ColumnMapping,
    row: &RawRow,
) -> Result<(TransactionType, Decimal), RowError> {
    // Either half is enough to mean the split shape. A statement that
    // lists only credits is still a two-column statement with one column,
    // and requiring both here made such a file fail on every row while the
    // mapping looked correct.
    let out_column = mapping.amount_out.as_deref();
    let in_column = mapping.amount_in.as_deref();

    if out_column.is_some() || in_column.is_some() {
        let out = match out_column {
            Some(column) => optional_amount(&cell(row, column))?,
            None => None,
        };
        let incoming = match in_column {
            Some(column) => optional_amount(&cell(row, column))?,
            None => None,
        };

        return match (out, incoming) {
            (Some(out), None) => Ok((TransactionType::Expense, out.abs())),
            (None, Some(incoming)) => Ok((TransactionType::Income, incoming.abs())),
            (Some(out), Some(incoming)) if out.abs() >= incoming.abs() => {
                Ok((TransactionType::Expense, out.abs()))
            }
            (Some(_), Some(incoming)) => Ok((TransactionType::Income, incoming.abs())),
            (None, None) => Err(RowError::EmptyAmount),
        };
    }

    let column = mapping.amount.as_deref().ok_or(RowError::NoAmountColumn)?;
    let value = optional_amount(&cell(row, column))?.ok_or(RowError::EmptyAmount)?;

    if value.is_sign_negative() {
        Ok((TransactionType::Expense, value.abs()))
    } else {
        Ok((TransactionType::Income, value))
    }
}

fn optional_amount(raw: &str) -> Result<Option<Decimal>, RowError> {
    if raw.trim().is_empty() {
        return Ok(None);
    }
    parse_amount(raw)
        .map(Some)
        .ok_or_else(|| RowError::BadAmount(raw.to_string()))
}

/// Read a money figure written in any of the separators a bank uses.
///
/// `1.234.567,89`, `1,234,567.89`, `1234567.89` and `(1.234)` all mean what
/// they look like. Which of `.` and `,` is the decimal point is decided by
/// which comes last, because no locale puts the decimal point first.
pub fn parse_amount(raw: &str) -> Option<Decimal> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // Accounting notation: a figure in brackets is negative.
    let bracketed = trimmed.starts_with('(') && trimmed.ends_with(')');
    let body = if bracketed {
        &trimmed[1..trimmed.len() - 1]
    } else {
        trimmed
    };

    // Strip everything that is not a digit, a separator or a sign: currency
    // codes and symbols travel in these columns more often than not.
    let cleaned: String = body
        .chars()
        .filter(|c| c.is_ascii_digit() || *c == '.' || *c == ',' || *c == '-' || *c == '+')
        .collect();
    if cleaned.is_empty() {
        return None;
    }

    let negative = bracketed || cleaned.starts_with('-');
    let digits: String = cleaned.chars().filter(|c| *c != '-' && *c != '+').collect();

    let last_dot = digits.rfind('.');
    let last_comma = digits.rfind(',');

    let normalized = match (last_dot, last_comma) {
        // Both present: the later one is the decimal point.
        (Some(dot), Some(comma)) if comma > dot => digits.replace('.', "").replace(',', "."),
        (Some(_), Some(_)) => digits.replace(',', ""),
        // One separator, and it is a thousands separator when exactly three
        // digits follow it and it is not the only separator shape that fits.
        (None, Some(comma)) => {
            if digits.len() - comma - 1 == 3 && digits.matches(',').count() >= 1 && comma != 0 {
                // Ambiguous: `1,234`. Treated as thousands, which is what a
                // statement means far more often than 1.234.
                digits.replace(',', "")
            } else {
                digits.replace(',', ".")
            }
        }
        (Some(dot), None) => {
            if digits.len() - dot - 1 == 3 && digits.matches('.').count() >= 1 && dot != 0 {
                digits.replace('.', "")
            } else {
                digits
            }
        }
        (None, None) => digits,
    };

    let value: Decimal = normalized.parse().ok()?;
    Some(round_money(if negative { -value } else { value }))
}

/// Read a date in the formats a statement uses.
///
/// Day first when the order is ambiguous, because every bank this product
/// is for writes `02/11/2026` for the second of November.
pub fn parse_date(raw: &str) -> Option<NaiveDate> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return None;
    }

    // A timestamp, from an export that kept the time.
    let head = trimmed.split(['T', ' ']).next().unwrap_or(trimmed);

    for format in [
        "%Y-%m-%d", "%d/%m/%Y", "%d-%m-%Y", "%d.%m.%Y", "%Y/%m/%d", "%d/%m/%y",
    ] {
        if let Ok(date) = NaiveDate::parse_from_str(head, format) {
            return Some(date);
        }
    }

    None
}

fn cell(row: &RawRow, column: &str) -> String {
    row.get(column)
        .map(|value| value.trim().to_string())
        .unwrap_or_default()
}

fn non_empty(value: Option<String>) -> Option<String> {
    value.filter(|text| !text.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn row(pairs: &[(&str, &str)]) -> RawRow {
        pairs
            .iter()
            .map(|(k, v)| (k.to_string(), v.to_string()))
            .collect()
    }

    fn decimal(value: &str) -> Decimal {
        round_money(value.parse().unwrap())
    }

    #[test]
    fn should_read_an_amount_in_either_separator_convention() {
        assert_eq!(parse_amount("1.234.567,89"), Some(decimal("1234567.89")));
        assert_eq!(parse_amount("1,234,567.89"), Some(decimal("1234567.89")));
        assert_eq!(parse_amount("1234567.89"), Some(decimal("1234567.89")));
        assert_eq!(
            parse_amount("50.000"),
            Some(decimal("50000")),
            "three digits after a dot is thousands"
        );
        assert_eq!(
            parse_amount("50,5"),
            Some(decimal("50.5")),
            "two digits after a comma is a decimal"
        );
        assert_eq!(parse_amount("0.75"), Some(decimal("0.75")));
    }

    #[test]
    fn should_read_the_decorations_banks_put_round_a_figure() {
        assert_eq!(parse_amount("Rp 50.000"), Some(decimal("50000")));
        assert_eq!(parse_amount("IDR 50.000,00"), Some(decimal("50000")));
        assert_eq!(parse_amount("-50.000"), Some(decimal("-50000")));
        assert_eq!(
            parse_amount("(50.000)"),
            Some(decimal("-50000")),
            "brackets mean negative"
        );
        assert_eq!(parse_amount("  "), None);
        assert_eq!(parse_amount("n/a"), None);
    }

    #[test]
    fn should_read_a_date_day_first_when_it_is_ambiguous() {
        let second_of_november = NaiveDate::from_ymd_opt(2026, 11, 2).unwrap();
        assert_eq!(parse_date("02/11/2026"), Some(second_of_november));
        assert_eq!(parse_date("2026-11-02"), Some(second_of_november));
        assert_eq!(parse_date("02-11-2026"), Some(second_of_november));
        assert_eq!(parse_date("02.11.2026"), Some(second_of_november));
        assert_eq!(parse_date("2026-11-02T09:30:00Z"), Some(second_of_november));
        assert_eq!(parse_date("second of November"), None);
    }

    /// The shape an Indonesian bank export actually has.
    #[test]
    fn should_split_debit_and_credit_into_a_sign() {
        let mapping = ColumnMapping {
            date: Some("Tanggal".into()),
            name: Some("Keterangan".into()),
            amount_out: Some("Debet".into()),
            amount_in: Some("Kredit".into()),
            ..Default::default()
        };

        let spent = transform(
            &mapping,
            &row(&[
                ("Tanggal", "02/11/2026"),
                ("Keterangan", "WARUNG TEKKO"),
                ("Debet", "50.000"),
                ("Kredit", ""),
            ]),
        )
        .unwrap();
        assert_eq!(spent.kind, TransactionType::Expense);
        assert_eq!(spent.amount, decimal("50000"));
        assert_eq!(spent.name.as_deref(), Some("WARUNG TEKKO"));

        let received = transform(
            &mapping,
            &row(&[
                ("Tanggal", "01/11/2026"),
                ("Keterangan", "GAJI"),
                ("Debet", ""),
                ("Kredit", "9.500.000"),
            ]),
        )
        .unwrap();
        assert_eq!(received.kind, TransactionType::Income);
        assert_eq!(received.amount, decimal("9500000"));
    }

    #[test]
    fn should_take_the_sign_from_a_single_amount_column() {
        let mapping = ColumnMapping {
            date: Some("Date".into()),
            amount: Some("Amount".into()),
            ..Default::default()
        };

        let spent = transform(
            &mapping,
            &row(&[("Date", "2026-11-02"), ("Amount", "-50000")]),
        )
        .unwrap();
        assert_eq!(spent.kind, TransactionType::Expense);
        assert_eq!(
            spent.amount,
            decimal("50000"),
            "the stored amount is always positive"
        );

        let received = transform(
            &mapping,
            &row(&[("Date", "2026-11-02"), ("Amount", "50000")]),
        )
        .unwrap();
        assert_eq!(received.kind, TransactionType::Income);
    }

    #[test]
    fn should_report_a_row_it_cannot_read_rather_than_guess() {
        let mapping = ColumnMapping {
            date: Some("Date".into()),
            amount: Some("Amount".into()),
            ..Default::default()
        };

        assert_eq!(
            transform(&mapping, &row(&[("Date", "whenever"), ("Amount", "1")])),
            Err(RowError::BadDate("whenever".into()))
        );
        assert_eq!(
            transform(&mapping, &row(&[("Date", "2026-11-02"), ("Amount", "")])),
            Err(RowError::EmptyAmount)
        );
        assert_eq!(
            transform(&ColumnMapping::default(), &row(&[])),
            Err(RowError::NoDateColumn)
        );
    }

    #[test]
    fn should_read_a_statement_that_lists_only_credits() {
        // One half of the pair is still the split shape. The mapper drops
        // the single-column `amount` field whenever either half survives,
        // so requiring both here failed every row of a credits-only
        // statement while the mapping itself looked right
        // (docs/ai/service.md#csv-column-mapping).
        let mapping = ColumnMapping {
            date: Some("Date".into()),
            amount_in: Some("Credit".into()),
            ..Default::default()
        };

        let result = transform(
            &mapping,
            &row(&[("Date", "2026-11-02"), ("Credit", "12.000.000")]),
        )
        .unwrap();

        assert_eq!(result.kind, TransactionType::Income);
        assert_eq!(result.amount, "12000000".parse::<Decimal>().unwrap());
    }

    #[test]
    fn should_read_a_statement_that_lists_only_debits() {
        let mapping = ColumnMapping {
            date: Some("Date".into()),
            amount_out: Some("Debit".into()),
            ..Default::default()
        };

        let result = transform(
            &mapping,
            &row(&[("Date", "2026-11-02"), ("Debit", "87.500")]),
        )
        .unwrap();

        assert_eq!(result.kind, TransactionType::Expense);
        assert_eq!(result.amount, "87500".parse::<Decimal>().unwrap());
    }

    #[test]
    fn should_take_the_larger_figure_when_a_row_fills_both_columns() {
        // A statement whose running balance landed in the credit column.
        let mapping = ColumnMapping {
            date: Some("Date".into()),
            amount_out: Some("Debit".into()),
            amount_in: Some("Credit".into()),
            ..Default::default()
        };

        let result = transform(
            &mapping,
            &row(&[
                ("Date", "2026-11-02"),
                ("Debit", "50.000"),
                ("Credit", "1.000"),
            ]),
        )
        .unwrap();
        assert_eq!(result.kind, TransactionType::Expense);
        assert_eq!(result.amount, decimal("50000"));
    }
}
