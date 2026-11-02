//! Currency codes and the rules that travel with them.
//!
//! Money itself is `rust_decimal::Decimal` everywhere and a string on the
//! wire (D12). What lives here is the code that names the unit.

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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn should_normalize_a_valid_code() {
        assert_eq!(validate_currency_code("currency_code", " idr ").unwrap(), "IDR");
        assert_eq!(validate_currency_code("currency_code", "EUR").unwrap(), "EUR");
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
