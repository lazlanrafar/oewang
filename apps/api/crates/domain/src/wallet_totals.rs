//! What a workspace's wallets add up to, in the workspace currency (D117).
//!
//! The one place a balance total is computed, so no client sums money
//! (MOB-4, D27). A balance is a live figure in its wallet's own currency
//! with no stored base amount, so a foreign wallet is converted at today's
//! rate here (TXN-19). A wallet whose currency has no rate is left out and
//! counted as left out: an honest partial figure beats a whole wrong one.

use std::collections::{BTreeSet, HashMap};

use rust_decimal::Decimal;

use crate::ledger::round_money;

/// The part of a wallet the totals read.
#[derive(Debug, Clone, Copy)]
pub struct WalletBalance<'a> {
    pub group_id: Option<&'a str>,
    pub currency_code: &'a str,
    pub balance: Decimal,
    pub is_included_in_totals: bool,
}

/// One group's share. Only wallets flagged "include in totals" count (WAL-2).
#[derive(Debug, Clone, Default, PartialEq, Eq)]
pub struct GroupTotal {
    pub subtotal: Decimal,
    pub left_out: usize,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct WalletTotals {
    /// The positive counted balances.
    pub assets: Decimal,
    /// The negative counted balances, as a positive figure: the old app's
    /// Liabilities column, which `total` subtracts.
    pub liabilities: Decimal,
    /// Every live wallet, counted or not.
    pub count: usize,
    /// How many carry the flag, which is what the total is a total of.
    pub counted: usize,
    /// Counted wallets with no rate for their currency.
    pub left_out: usize,
    /// The currencies those wallets are in, sorted.
    pub missing_currencies: Vec<String>,
    /// Keyed by group id, `None` for the wallets in no group.
    pub groups: HashMap<Option<String>, GroupTotal>,
}

impl WalletTotals {
    pub fn total(&self) -> Decimal {
        round_money(self.assets - self.liabilities)
    }
}

/// `rates` maps a currency to what one unit of it is worth in `home`.
pub fn wallet_totals(
    wallets: &[WalletBalance<'_>],
    home: &str,
    rates: &HashMap<String, Decimal>,
) -> WalletTotals {
    let mut assets = Decimal::ZERO;
    let mut liabilities = Decimal::ZERO;
    let mut counted = 0;
    let mut missing = BTreeSet::new();
    let mut left_out = 0;
    let mut groups: HashMap<Option<String>, GroupTotal> = HashMap::new();

    for wallet in wallets {
        let group = groups
            .entry(wallet.group_id.map(str::to_string))
            .or_default();
        if !wallet.is_included_in_totals {
            continue;
        }
        counted += 1;

        let value = if wallet.currency_code == home {
            Some(wallet.balance)
        } else {
            rates
                .get(wallet.currency_code)
                .map(|rate| round_money(wallet.balance * rate))
        };
        let Some(value) = value else {
            left_out += 1;
            group.left_out += 1;
            missing.insert(wallet.currency_code.to_string());
            continue;
        };

        group.subtotal += value;
        if value.is_sign_negative() {
            liabilities -= value;
        } else {
            assets += value;
        }
    }

    for group in groups.values_mut() {
        group.subtotal = round_money(group.subtotal);
    }

    WalletTotals {
        assets: round_money(assets),
        liabilities: round_money(liabilities),
        count: wallets.len(),
        counted,
        left_out,
        missing_currencies: missing.into_iter().collect(),
        groups,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn d(value: &str) -> Decimal {
        value.parse().unwrap()
    }

    fn wallet<'a>(group: Option<&'a str>, currency: &'a str, balance: &str) -> WalletBalance<'a> {
        WalletBalance {
            group_id: group,
            currency_code: currency,
            balance: d(balance),
            is_included_in_totals: true,
        }
    }

    #[test]
    fn mob_4_should_sum_workspace_currency_wallets_into_assets_and_liabilities() {
        let wallets = [
            wallet(Some("g1"), "IDR", "625000"),
            wallet(Some("g1"), "IDR", "-131500"),
            wallet(None, "IDR", "-1947500"),
        ];

        let totals = wallet_totals(&wallets, "IDR", &HashMap::new());

        assert_eq!(totals.assets, d("625000"));
        assert_eq!(totals.liabilities, d("2079000"), "a positive figure");
        assert_eq!(totals.total(), d("-1454000"));
        assert_eq!(totals.groups[&Some("g1".into())].subtotal, d("493500"));
        assert_eq!(totals.groups[&None].subtotal, d("-1947500"));
        assert_eq!((totals.count, totals.counted, totals.left_out), (3, 3, 0));
    }

    #[test]
    fn mob_4_should_convert_a_foreign_wallet_at_the_rate() {
        let wallets = [wallet(None, "IDR", "100000"), wallet(None, "EUR", "10.5")];
        let rates = HashMap::from([("EUR".to_string(), d("17000.12345678"))]);

        let totals = wallet_totals(&wallets, "IDR", &rates);

        assert_eq!(totals.assets, d("278501.2963"), "rounded to four places");
        assert_eq!(totals.total().to_string(), "278501.2963");
    }

    #[test]
    fn mob_4_should_leave_out_and_count_a_wallet_with_no_rate() {
        let wallets = [
            wallet(Some("g1"), "IDR", "1000"),
            wallet(Some("g1"), "XAU", "2"),
            wallet(None, "XAU", "-3"),
        ];

        let totals = wallet_totals(&wallets, "IDR", &HashMap::new());

        assert_eq!(totals.total(), d("1000"));
        assert_eq!(totals.counted, 3, "still counted");
        assert_eq!(totals.left_out, 2);
        assert_eq!(totals.missing_currencies, vec!["XAU".to_string()]);
        assert_eq!(totals.groups[&Some("g1".into())].left_out, 1);
        assert_eq!(totals.groups[&None].left_out, 1);
        assert_eq!(totals.groups[&None].subtotal, Decimal::ZERO);
    }

    #[test]
    fn mob_4_should_not_count_an_excluded_wallet() {
        let mut hidden = wallet(Some("g1"), "IDR", "-500");
        hidden.is_included_in_totals = false;
        let wallets = [wallet(Some("g1"), "IDR", "200"), hidden];

        let totals = wallet_totals(&wallets, "IDR", &HashMap::new());

        assert_eq!(totals.total(), d("200"));
        assert_eq!(totals.liabilities, Decimal::ZERO);
        assert_eq!((totals.count, totals.counted), (2, 1));
        assert_eq!(totals.groups[&Some("g1".into())].subtotal, d("200"));
    }

    #[test]
    fn mob_4_should_answer_zero_for_no_wallets() {
        let totals = wallet_totals(&[], "IDR", &HashMap::new());
        assert_eq!(totals.total().to_string(), "0.0000");
        assert!(totals.groups.is_empty());
    }
}
