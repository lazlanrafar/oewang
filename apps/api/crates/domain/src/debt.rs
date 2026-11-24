//! Debt rules that need no database (DEBT-2, DEBT-10).

use rust_decimal::{Decimal, RoundingStrategy};

use crate::money::currency_digits;

/// `unpaid`, `partial` or `paid`, from what is left. Never sent by a client;
/// the table's `CHECK` holds the same rule.
pub fn status(amount: Decimal, remaining: Decimal) -> &'static str {
    if remaining.is_zero() {
        "paid"
    } else if remaining == amount {
        "unpaid"
    } else {
        "partial"
    }
}

/// One person's share of a split between `people` contacts and the person
/// themselves: floored to the currency's minor unit, so the shares never
/// add up to more than was spent and the remainder stays with the person.
pub fn split_share(amount: Decimal, people: usize, currency_code: &str) -> Decimal {
    let each = amount / Decimal::from(people as u64 + 1);
    each.round_dp_with_strategy(
        currency_digits(currency_code) as u32,
        RoundingStrategy::ToZero,
    )
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(raw: &str) -> Decimal {
        raw.parse().unwrap()
    }

    /// DEBT-2
    #[test]
    fn should_derive_the_status_from_what_is_left() {
        assert_eq!(status(d("100"), d("100")), "unpaid");
        assert_eq!(status(d("100"), d("40")), "partial");
        assert_eq!(status(d("100"), d("0")), "paid");
    }

    /// DEBT-10
    #[test]
    fn should_floor_each_share_and_leave_the_remainder_with_the_person() {
        // 100,000 IDR between the person and two friends.
        assert_eq!(split_share(d("100000"), 2, "IDR"), d("33333"));
        // USD 100 between four: 25 each, nothing left over.
        assert_eq!(split_share(d("100"), 3, "USD"), d("25"));
        // USD 10 between three: 3.33 each, the person keeps 3.34.
        let share = split_share(d("10"), 2, "USD");
        assert_eq!(share, d("3.33"));
        assert!(share * d("2") <= d("10"));
    }
}
