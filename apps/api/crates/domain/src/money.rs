//! Currency codes and the rules that travel with them.
//!
//! Money itself is `rust_decimal::Decimal` everywhere and a string on the
//! wire (D12). What lives here is the code that names the unit.

use rust_decimal::{Decimal, RoundingStrategy};

use crate::AppError;

/// Trimmed and upper-cased, which is how a code is stored and compared.
pub fn normalize_currency_code(code: &str) -> String {
    code.trim().to_uppercase()
}

/// Checks the ISO 4217 shape: three ASCII letters.
///
/// Deliberately a shape check rather than a list. The list changes, a
/// workspace may legitimately hold a currency this build has not heard of,
/// and being wrong costs a label, not a miscomputed balance. Returns the
/// normalized code so a caller cannot forget to normalize it.
pub fn validate_currency_code(field: &'static str, code: &str) -> Result<String, AppError> {
    let normalized = normalize_currency_code(code);

    if normalized.len() == 3 && normalized.chars().all(|c| c.is_ascii_uppercase()) {
        Ok(normalized)
    } else {
        Err(AppError::validation([(
            field,
            "Use a three-letter ISO 4217 code, for example IDR.",
        )]))
    }
}

/// Currencies this product renders without decimal places.
///
/// A table rather than a lookup of ISO 4217 minor units: rupiah showing no
/// decimals is a display convention here, not an ISO fact, and the old app
/// never showed them. The same table lives in the web app's `money.ts`, so
/// a figure reads identically wherever it is rendered.
const ZERO_DECIMAL: [&str; 8] = ["IDR", "JPY", "KRW", "VND", "CLP", "ISK", "HUF", "TWD"];

/// How many decimal places a currency shows. Two unless the table says
/// otherwise.
pub fn currency_digits(code: &str) -> usize {
    if ZERO_DECIMAL.contains(&normalize_currency_code(code).as_str()) {
        0
    } else {
        2
    }
}

/// `Rp` for rupiah, `$` for dollars, the code itself for anything else.
pub fn currency_symbol(code: &str) -> String {
    match normalize_currency_code(code).as_str() {
        "IDR" => "Rp".to_string(),
        "USD" => "$".to_string(),
        "EUR" => "\u{20ac}".to_string(),
        "GBP" => "\u{a3}".to_string(),
        "SGD" => "S$".to_string(),
        "JPY" => "\u{a5}".to_string(),
        other => other.to_string(),
    }
}

/// A figure in one currency, formatted once, by the API.
///
/// Every number the model states comes through here (D27): it is given the
/// finished string and never the arithmetic. The grouping matches the web
/// app exactly, dot for thousands and comma for the fraction, so a total
/// quoted in chat reads the same as the same total in a table.
pub fn format_money(value: Decimal, code: &str, signed: bool) -> String {
    let digits = currency_digits(code);
    let rounded = value.round_dp_with_strategy(digits as u32, RoundingStrategy::MidpointAwayFromZero);

    let text = rounded.abs().to_string();
    let (whole, fraction) = match text.split_once('.') {
        Some((whole, fraction)) => (whole.to_string(), fraction.to_string()),
        None => (text, String::new()),
    };

    let mut body = group(&whole);
    if digits > 0 {
        body.push(',');
        let mut fraction = fraction;
        fraction.truncate(digits);
        while fraction.len() < digits {
            fraction.push('0');
        }
        body.push_str(&fraction);
    }

    let marker = if rounded.is_sign_negative() && !rounded.is_zero() {
        "-"
    } else if signed && !rounded.is_zero() {
        "+"
    } else {
        ""
    };

    format!("{marker}{} {body}", currency_symbol(code))
}

/// Group a run of digits in threes, with a dot, as the old app renders it.
fn group(digits: &str) -> String {
    let mut out = String::with_capacity(digits.len() + digits.len() / 3);
    let count = digits.len();

    for (index, digit) in digits.chars().enumerate() {
        if index > 0 && (count - index) % 3 == 0 {
            out.push('.');
        }
        out.push(digit);
    }

    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_normalize_a_valid_code() {
        assert_eq!(validate_currency_code("currency_code", " idr ").unwrap(), "IDR");
        assert_eq!(validate_currency_code("currency_code", "EUR").unwrap(), "EUR");
    }

    use std::str::FromStr;

    fn money(raw: &str) -> Decimal {
        Decimal::from_str(raw).unwrap()
    }

    /// The expectations are the web app's own, copied from
    /// apps/app/src/lib/money.test.ts: one figure, one rendering.
    #[test]
    fn should_render_a_figure_the_way_the_web_app_does() {
        assert_eq!(format_money(money("812500.0000"), "IDR", false), "Rp 812.500");
        assert_eq!(format_money(money("-87500.0000"), "IDR", false), "-Rp 87.500");
        assert_eq!(format_money(money("49.9900"), "USD", false), "$ 49,99");
        assert_eq!(format_money(money("1234.5000"), "USD", false), "$ 1.234,50");
        assert_eq!(format_money(money("0"), "IDR", false), "Rp 0");
    }

    #[test]
    fn should_mark_the_sign_when_asked() {
        assert_eq!(format_money(money("50000"), "IDR", true), "+Rp 50.000");
        assert_eq!(format_money(money("-50000"), "IDR", true), "-Rp 50.000");
        // Zero is neither, whatever the caller asked for.
        assert_eq!(format_money(money("0"), "IDR", true), "Rp 0");
    }

    #[test]
    fn should_round_half_away_from_zero_like_the_rest_of_the_ledger() {
        assert_eq!(format_money(money("87500.5"), "IDR", false), "Rp 87.501");
        assert_eq!(format_money(money("1.005"), "USD", false), "$ 1,01");
    }

    #[test]
    fn should_use_the_code_when_no_symbol_is_known() {
        assert_eq!(format_money(money("1000"), "AUD", false), "AUD 1.000,00");
        assert_eq!(format_money(money("1000"), "VND", false), "VND 1.000");
    }

    #[test]
    fn should_reject_anything_that_is_not_three_letters() {
        for bad in ["", "ID", "IDRX", "ID1", "ID "] {
            assert!(
                validate_currency_code("currency_code", bad).is_err(),
                "accepted {bad:?}"
            );
        }
    }
}
