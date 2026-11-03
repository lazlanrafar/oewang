//! The receipt draft, and the arithmetic that checks what a model read.
//!
//! A vision model misreading one digit in a total is the most common
//! receipt failure, and summing the line items catches it for the cost of a
//! function call (D30, AI-7). So every figure that arrives from the AI
//! service passes through here before anyone sees it.
//!
//! Two rules shape the whole module:
//!
//! - **The model never corrects its own numbers.** Every fix is arithmetic,
//!   in Rust, with no second call (D27).
//! - **A fix is always declared.** A corrected field is named in
//!   `corrected`, so the confirmation sheet can mark it and the user knows
//!   which values came off the receipt and which came from a sum
//!   ([the ladder](../../../../docs/ai/service.md#cross-field-consistency)).
//!
//! The draft is never persisted. Confirming it goes through the ordinary
//! create path like anything the user typed (AI-2).

use chrono::NaiveDate;
use rust_decimal::Decimal;
use serde::{Deserialize, Serialize};

use crate::money::normalize_currency_code;

/// How far two figures may differ before the difference is a mistake rather
/// than rounding: a hundredth of a unit, in the receipt's own currency.
fn tolerance() -> Decimal {
    Decimal::new(1, 2)
}

/// A receipt with more items than this is not a receipt this product is
/// reading correctly, and the body has to stay bounded either way.
const MAX_ITEMS: usize = 200;

/// Long enough for a merchant name with a branch on the end, short enough
/// that a wall of text extracted from a photograph cannot become a label.
const MAX_MERCHANT_CHARS: usize = 120;

// ----------------------------------------------------------------- the wire

/// What the AI service sends: every field optional, every figure a string.
///
/// Nothing here is trusted. The strings come from a model reading a
/// photograph, so each one is parsed rather than believed, and a field that
/// will not parse is cleared rather than guessed at.
#[derive(Debug, Default, Deserialize)]
pub struct RawDraft {
    pub merchant: Option<String>,
    pub date: Option<String>,
    pub currency: Option<String>,
    pub subtotal: Option<String>,
    pub tax: Option<String>,
    pub total: Option<String>,
    #[serde(default)]
    pub line_items: Vec<RawItem>,
}

#[derive(Debug, Default, Deserialize)]
pub struct RawItem {
    pub name: Option<String>,
    pub amount: Option<String>,
    pub quantity: Option<String>,
    pub unit_price: Option<String>,
}

// ---------------------------------------------------------------- the draft

/// One line off the receipt. `amount` is what the line costs in total;
/// `unit_price` times `quantity` is the arithmetic that has to agree with it.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct LineItem {
    pub name: String,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub amount: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub quantity: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub unit_price: Option<Decimal>,
}

/// The checked draft. Absent beats guessed in every field: the confirmation
/// sheet can ask the user for a missing merchant, and cannot un-ask a wrong
/// one it never showed as missing.
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize)]
pub struct ReceiptDraft {
    pub merchant: Option<String>,
    pub date: Option<NaiveDate>,
    pub currency: String,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub subtotal: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub tax: Option<Decimal>,
    #[serde(with = "rust_decimal::serde::str_option")]
    pub total: Option<Decimal>,
    pub line_items: Vec<LineItem>,
}

/// One field arithmetic replaced, and what the model had given for it.
///
/// Both halves are the point. The name lets the sheet mark the field; the
/// old value lets it show the figure the model read beside the figure the
/// code computed, which is the promise AI-11 makes to the user. A name on
/// its own would say a number changed without saying from what.
///
/// `model_value` is null when the model gave nothing and the arithmetic
/// supplied the field outright, which is a different thing from a
/// disagreement and reads differently on the sheet.
#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Correction {
    pub field: String,
    pub model_value: Option<String>,
}

impl Correction {
    fn new(field: &str, model_value: Option<&str>) -> Self {
        Self {
            field: field.to_string(),
            model_value: model_value.map(|value| value.trim().to_string()),
        }
    }
}

/// What the ladder scored, plus what the arithmetic changed.
///
/// `score` and `low_confidence_fields` come from the AI service and are
/// passed through; `corrected_fields` is filled here, because the
/// corrections happen here (D30).
#[derive(Debug, Default, Clone, PartialEq, Eq, Serialize, Deserialize)]
pub struct Quality {
    pub score: u8,
    #[serde(default)]
    pub low_confidence_fields: Vec<String>,
    #[serde(default)]
    pub corrected_fields: Vec<Correction>,
}

/// A draft and the fields arithmetic replaced.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct Checked {
    pub draft: ReceiptDraft,
    pub corrected: Vec<Correction>,
}

/// Read a raw draft, then make it consistent.
///
/// Parsing and checking are one pass on purpose. Both produce the same kind
/// of outcome, a field the user is shown as changed, and splitting them
/// would mean deciding twice whether an unreadable total counts as a
/// correction. It does.
///
/// `fallback_currency` is the workspace's, used when the receipt states no
/// currency or states one that is not an ISO 4217 code.
pub fn check(raw: RawDraft, fallback_currency: &str, today: NaiveDate) -> Checked {
    let mut corrected: Vec<Correction> = Vec::new();

    let merchant = raw
        .merchant
        .and_then(|name| clamp(&name, MAX_MERCHANT_CHARS));

    // A date that is not a real calendar date, or that has not happened yet,
    // is cleared rather than guessed at: a receipt dated next March is a
    // misread year, and no arithmetic says which year it should be.
    let date = match raw.date.as_deref().map(str::trim).filter(|v| !v.is_empty()) {
        None => None,
        Some(value) => match NaiveDate::parse_from_str(value, "%Y-%m-%d") {
            Ok(parsed) if parsed <= today => Some(parsed),
            _ => {
                corrected.push(Correction::new("date", raw.date.as_deref()));
                None
            }
        },
    };

    // A currency the receipt does not state is not a correction: the ladder
    // already scored it as missing. A currency it states wrongly is.
    let currency = match raw
        .currency
        .as_deref()
        .map(str::trim)
        .filter(|v| !v.is_empty())
    {
        None => normalize_currency_code(fallback_currency),
        Some(stated) => match iso_4217(stated) {
            Some(code) => code,
            None => {
                corrected.push(Correction::new("currency", Some(stated)));
                normalize_currency_code(fallback_currency)
            }
        },
    };

    let mut line_items = Vec::new();
    let mut items_fixed = false;

    for raw_item in raw.line_items.into_iter().take(MAX_ITEMS) {
        let mut item = LineItem {
            name: raw_item
                .name
                .and_then(|n| clamp(&n, MAX_MERCHANT_CHARS))
                .unwrap_or_default(),
            amount: decimal(raw_item.amount.as_deref()),
            quantity: decimal(raw_item.quantity.as_deref()),
            unit_price: decimal(raw_item.unit_price.as_deref()),
        };

        // Unit price times quantity is the line's own arithmetic. When it
        // disagrees with the stated amount, the product is the answer: two
        // figures agreeing beat one standing alone.
        if let (Some(unit), Some(quantity)) = (item.unit_price, item.quantity) {
            let computed = unit * quantity;
            if item
                .amount
                .is_none_or(|stated| (stated - computed).abs() > tolerance())
            {
                item.amount = Some(computed);
                items_fixed = true;
            }
        }

        line_items.push(item);
    }

    if items_fixed {
        // No `model_value`: the sheet shows every item at once, so the
        // badge belongs to the block. An index here would be a second way
        // to address a field, for one badge.
        corrected.push(Correction::new("line_items", None));
    }

    let items_total = sum_items(&line_items);
    let stated_subtotal = decimal(raw.subtotal.as_deref());
    let tax = decimal(raw.tax.as_deref());
    let stated_total = decimal(raw.total.as_deref());

    // The items are the independent evidence. When they exist they decide
    // the subtotal, whether the receipt stated one or not.
    let subtotal = match (items_total, stated_subtotal) {
        (Some(computed), Some(stated)) if (stated - computed).abs() > tolerance() => {
            corrected.push(Correction::new("subtotal", raw.subtotal.as_deref()));
            Some(computed)
        }
        (Some(computed), None) => {
            corrected.push(Correction::new("subtotal", None));
            Some(computed)
        }
        (_, stated) => stated,
    };

    // Subtotal plus tax is the total. A receipt carrying a service charge
    // the items do not list legitimately disagrees, which is why the fix is
    // marked rather than silent: the user sees the badge and the receipt
    // beside it, and keeps whichever is right (TXN-12).
    let total = match subtotal {
        None => stated_total,
        Some(base) => {
            let computed = base + tax.unwrap_or_default();
            match stated_total {
                Some(stated) if (stated - computed).abs() <= tolerance() => Some(stated),
                _ => {
                    corrected.push(Correction::new("total", raw.total.as_deref()));
                    Some(computed)
                }
            }
        }
    };

    Checked {
        draft: ReceiptDraft {
            merchant,
            date,
            currency,
            subtotal,
            tax,
            total,
            line_items,
        },
        corrected,
    }
}

// ----------------------------------------------------------------- helpers

/// Sum the items that carry an amount. `None` when no item does, which is
/// not the same as zero: a receipt whose items were not read tells the
/// arithmetic nothing, and a zero would tell it the wrong thing.
fn sum_items(items: &[LineItem]) -> Option<Decimal> {
    let amounts: Vec<Decimal> = items.iter().filter_map(|item| item.amount).collect();
    (!amounts.is_empty()).then(|| amounts.into_iter().sum())
}

fn decimal(raw: Option<&str>) -> Option<Decimal> {
    raw.map(str::trim)
        .filter(|value| !value.is_empty())
        .and_then(|value| value.parse::<Decimal>().ok())
}

/// The ISO 4217 shape check, as elsewhere: three ASCII letters, not a list
/// (see `money::validate_currency_code` for why).
fn iso_4217(code: &str) -> Option<String> {
    let normalized = normalize_currency_code(code);
    (normalized.len() == 3 && normalized.chars().all(|c| c.is_ascii_uppercase()))
        .then_some(normalized)
}

fn clamp(value: &str, chars: usize) -> Option<String> {
    let trimmed: String = value.trim().chars().take(chars).collect();
    (!trimmed.is_empty()).then_some(trimmed)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// The corrected field names, for the assertions that only care which
    /// fields changed.
    fn fields(checked: &Checked) -> Vec<&str> {
        checked
            .corrected
            .iter()
            .map(|correction| correction.field.as_str())
            .collect()
    }

    fn today() -> NaiveDate {
        NaiveDate::from_ymd_opt(2026, 11, 3).unwrap()
    }

    fn money(value: &str) -> Option<Decimal> {
        Some(value.parse().unwrap())
    }

    fn item(name: &str, amount: &str) -> RawItem {
        RawItem {
            name: Some(name.into()),
            amount: Some(amount.into()),
            ..RawItem::default()
        }
    }

    fn raw() -> RawDraft {
        RawDraft {
            merchant: Some("Warung Tekko".into()),
            date: Some("2026-11-02".into()),
            currency: Some("IDR".into()),
            total: Some("87500".into()),
            line_items: vec![item("Iga bakar", "45000"), item("Es teh", "42500")],
            ..RawDraft::default()
        }
    }

    #[test]
    fn should_keep_a_receipt_that_already_adds_up() {
        let checked = check(raw(), "IDR", today());

        assert_eq!(checked.draft.total, money("87500"));
        assert_eq!(checked.draft.merchant.as_deref(), Some("Warung Tekko"));
        // The subtotal was absent and the items supply it, which is a
        // change the user is shown; the total itself is left alone.
        assert_eq!(fields(&checked), vec!["subtotal"]);
    }

    #[test]
    fn should_correct_a_total_the_items_disagree_with() {
        let mut draft = raw();
        // The classic failure: one digit misread in the total.
        draft.total = Some("8750".into());

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.total, money("87500"));
        assert!(fields(&checked).contains(&"total"));
    }

    #[test]
    fn should_add_tax_to_the_items_rather_than_trusting_the_total() {
        let mut draft = raw();
        draft.tax = Some("8750".into());
        draft.total = Some("87500".into());

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.subtotal, money("87500"));
        assert_eq!(checked.draft.total, money("96250"));
        assert!(fields(&checked).contains(&"total"));
    }

    #[test]
    fn should_compute_an_item_amount_from_its_unit_price() {
        let draft = RawDraft {
            line_items: vec![RawItem {
                name: Some("Iga bakar".into()),
                amount: Some("45000".into()),
                quantity: Some("2".into()),
                unit_price: Some("45000".into()),
            }],
            ..RawDraft::default()
        };

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.line_items[0].amount, money("90000"));
        assert!(fields(&checked).contains(&"line_items"));
    }

    #[test]
    fn should_leave_an_item_whose_arithmetic_already_agrees() {
        let draft = RawDraft {
            line_items: vec![RawItem {
                name: Some("Es teh".into()),
                amount: Some("16000".into()),
                quantity: Some("2".into()),
                unit_price: Some("8000".into()),
            }],
            ..RawDraft::default()
        };

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.line_items[0].amount, money("16000"));
        assert!(!fields(&checked).contains(&"line_items"));
    }

    #[test]
    fn should_report_the_figure_the_model_gave_beside_the_one_it_computed() {
        let mut draft = raw();
        draft.total = Some("8750".into());

        let checked = check(draft, "IDR", today());
        let correction = checked
            .corrected
            .iter()
            .find(|correction| correction.field == "total")
            .expect("the total was corrected");

        // Half of AI-11 is being able to show the user both numbers. A
        // name on its own says a figure changed without saying from what.
        assert_eq!(correction.model_value.as_deref(), Some("8750"));
        assert_eq!(checked.draft.total, money("87500"));
    }

    #[test]
    fn should_report_no_model_value_when_arithmetic_supplied_the_field() {
        // The receipt stated no subtotal, so nothing was contradicted and
        // there is no earlier figure to show.
        let checked = check(raw(), "IDR", today());
        let correction = &checked.corrected[0];

        assert_eq!(correction.field, "subtotal");
        assert_eq!(correction.model_value, None);
    }

    #[test]
    fn should_clear_a_date_in_the_future() {
        let mut draft = raw();
        draft.date = Some("2027-03-01".into());

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.date, None);
        assert!(fields(&checked).contains(&"date"));
    }

    #[test]
    fn should_clear_a_date_that_is_not_a_calendar_date() {
        let mut draft = raw();
        draft.date = Some("2026-02-31".into());

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.date, None);
        assert!(fields(&checked).contains(&"date"));
    }

    #[test]
    fn should_accept_a_date_of_today() {
        let mut draft = raw();
        draft.date = Some("2026-11-03".into());

        assert_eq!(check(draft, "IDR", today()).draft.date, Some(today()));
    }

    #[test]
    fn should_fall_back_to_the_workspace_currency_when_the_code_is_nonsense() {
        let mut draft = raw();
        draft.currency = Some("Rp".into());

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.currency, "IDR");
        assert!(fields(&checked).contains(&"currency"));
    }

    #[test]
    fn should_not_call_a_missing_currency_a_correction() {
        let mut draft = raw();
        draft.currency = None;

        let checked = check(draft, "SGD", today());

        assert_eq!(checked.draft.currency, "SGD");
        assert!(!fields(&checked).contains(&"currency"));
    }

    #[test]
    fn should_leave_the_total_alone_when_no_item_was_read() {
        let draft = RawDraft {
            total: Some("87500".into()),
            ..RawDraft::default()
        };

        let checked = check(draft, "IDR", today());

        assert_eq!(checked.draft.total, money("87500"));
        assert!(checked.corrected.is_empty());
    }

    #[test]
    fn should_bound_the_item_list() {
        let draft = RawDraft {
            line_items: (0..MAX_ITEMS + 50).map(|_| item("x", "1")).collect(),
            ..RawDraft::default()
        };

        assert_eq!(
            check(draft, "IDR", today()).draft.line_items.len(),
            MAX_ITEMS
        );
    }

    #[test]
    fn should_drop_a_figure_that_is_not_a_number() {
        let mut draft = raw();
        draft.total = Some("fifty thousand".into());
        draft.line_items = Vec::new();

        assert_eq!(check(draft, "IDR", today()).draft.total, None);
    }

    #[test]
    fn should_serialize_every_figure_as_a_string() {
        let checked = check(raw(), "IDR", today());
        let json = serde_json::to_string(&checked.draft).unwrap();

        assert!(json.contains(r#""total":"87500""#), "{json}");
        assert!(json.contains(r#""date":"2026-11-02""#), "{json}");
        assert!(
            !json.contains(": 87500") && !json.contains(":87500,"),
            "a figure escaped as a number: {json}"
        );
    }
}
